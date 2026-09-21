from __future__ import annotations

import asyncio
import os
import threading
from collections.abc import Callable

from google.genai import types

from services.gemini_client import get_gemini_client


class LiveTranscriptionSession:
    """Own one Gemini Live connection and its audio/response queues."""

    def __init__(
        self,
        on_transcription: Callable[[str, bool], None],
        on_error: Callable[[str], None],
    ) -> None:
        self._on_transcription = on_transcription
        self._on_error = on_error
        self._loop: asyncio.AbstractEventLoop | None = None
        self._audio_queue: asyncio.Queue[bytes | None] | None = None
        self._thread: threading.Thread | None = None
        self._stop_requested = threading.Event()
        self._last_final_text = ""

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def send_audio(self, audio: bytes) -> bool:
        if not audio or self._stop_requested.is_set() or not self._loop or not self._audio_queue:
            return False
        self._loop.call_soon_threadsafe(self._audio_queue.put_nowait, audio)
        return True

    def stop(self) -> None:
        self._stop_requested.set()
        if self._loop and self._audio_queue:
            self._loop.call_soon_threadsafe(self._audio_queue.put_nowait, None)

    def _run(self) -> None:
        try:
            asyncio.run(self._run_async())
        except Exception as error:
            self._on_error(self._message_for_error(error))

    async def _run_async(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._audio_queue = asyncio.Queue(maxsize=32)
        client = get_gemini_client()
        model = os.environ.get(
            "GEMINI_TRANSCRIPTION_MODEL", "gemini-3.5-transcribe-live"
        )
        config = types.LiveConnectConfig(
            generation_config=types.GenerationConfig(response_modalities=["TEXT"]),
            input_audio_transcription=types.AudioTranscriptionConfig(),
        )

        async with client.aio.live.connect(model=model, config=config) as session:
            sender = asyncio.create_task(self._send_audio(session))
            receiver = asyncio.create_task(self._receive_transcriptions(session))
            done, pending = await asyncio.wait(
                (sender, receiver), return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                error = task.exception()
                if error and not self._stop_requested.is_set():
                    raise error

    async def _send_audio(self, session) -> None:
        while True:
            audio = await self._audio_queue.get()
            if audio is None:
                return
            await session.send_realtime_input(
                audio={"data": audio, "mime_type": "audio/pcm;rate=16000"}
            )

    async def _receive_transcriptions(self, session) -> None:
        async for message in session.receive():
            server_content = getattr(message, "server_content", None)
            transcription = getattr(server_content, "input_transcription", None)
            text = (getattr(transcription, "text", None) or "").strip()
            if text:
                finished = bool(getattr(transcription, "finished", False))
                if finished and text == self._last_final_text:
                    continue
                if finished:
                    self._last_final_text = text
                self._on_transcription(text, finished)

    @staticmethod
    def _message_for_error(error: Exception) -> str:
        status = getattr(error, "status_code", None) or getattr(error, "status", None)
        details = str(error).lower()
        if status == 429 or "quota" in details or "resource_exhausted" in details:
            return "Gemini transcription rate limit reached. Please wait and try again."
        return "Gemini live transcription connection failed."
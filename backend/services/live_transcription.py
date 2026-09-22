from __future__ import annotations

import asyncio
import os
import queue
import threading
from collections.abc import Callable

from google.genai import types

from services.gemini_client import get_gemini_client


class LiveTranscriptionSession:
    """
    Own one Gemini Live transcription session.

    Audio enters through a thread-safe queue from Flask-SocketIO.
    A dedicated asyncio event loop sends the PCM chunks to Gemini
    while a second task continuously receives transcription events.
    """

    def __init__(
        self,
        on_transcription: Callable[[str, bool], None],
        on_error: Callable[[str], None],
    ) -> None:
        self._on_transcription = on_transcription
        self._on_error = on_error

        self._thread: threading.Thread | None = None

        self._audio_queue: queue.Queue[
            bytes | None
        ] = queue.Queue(maxsize=64)

        self._stop_requested = threading.Event()

        self._last_final_text = ""

    def start(self) -> None:
        if (
            self._thread
            and self._thread.is_alive()
        ):
            return

        self._stop_requested.clear()
        self._last_final_text = ""

        self._thread = threading.Thread(
            target=self._run,
            name="hinter-gemini-live",
            daemon=True,
        )

        self._thread.start()

    def send_audio(self, audio: bytes) -> bool:
        if (
            not audio
            or self._stop_requested.is_set()
        ):
            return False

        try:
            self._audio_queue.put_nowait(
                bytes(audio)
            )

            return True

        except queue.Full:
            print(
                "[gemini] audio queue full; dropping chunk"
            )

            return False

    def stop(self) -> None:
        if self._stop_requested.is_set():
            return

        self._stop_requested.set()

        try:
            self._audio_queue.put_nowait(None)
        except queue.Full:
            pass

    def _run(self) -> None:
        try:
            asyncio.run(
                self._run_async()
            )

        except Exception as error:
            if not self._stop_requested.is_set():
                message = self._message_for_error(
                    error
                )

                print(
                    "[gemini] live transcription failed:",
                    repr(error),
                )

                self._on_error(message)

    async def _run_async(self) -> None:
        client = get_gemini_client()

        model = os.environ.get(
            "GEMINI_TRANSCRIPTION_MODEL",
            "gemini-3.5-transcribe-live",
        ).strip()

        if not model:
            model = "gemini-3.5-transcribe-live"

        print(
            "[gemini] starting Live transcription session:",
            model,
        )

        config = types.LiveConnectConfig(
            response_modalities=["TEXT"],
            input_audio_transcription=(
                types.AudioTranscriptionConfig(
                    language_codes=[],
                )
            ),
        )

        async with client.aio.live.connect(
            model=model,
            config=config,
        ) as session:
            print(
                "[gemini] Live transcription connected"
            )

            sender = asyncio.create_task(
                self._send_audio(session)
            )

            receiver = asyncio.create_task(
                self._receive_transcriptions(
                    session
                )
            )

            done, pending = await asyncio.wait(
                (sender, receiver),
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            await asyncio.gather(
                *pending,
                return_exceptions=True,
            )

            for task in done:
                if task.cancelled():
                    continue

                error = task.exception()

                if (
                    error
                    and not self._stop_requested.is_set()
                ):
                    raise error

        print(
            "[gemini] Live transcription session closed"
        )

    async def _send_audio(self, session) -> None:
        while True:
            audio = await asyncio.to_thread(
                self._audio_queue.get
            )

            if audio is None:
                try:
                    await session.send_realtime_input(
                        audio_stream_end=True
                    )
                except Exception:
                    pass

                return

            if self._stop_requested.is_set():
                return

            try:
                print(
                    "[gemini] sending PCM:",
                    len(audio),
                    "bytes",
                )

                await session.send_realtime_input(
                    audio=types.Blob(
                        data=audio,
                        mime_type="audio/pcm;rate=16000",
                    )
                )

            except Exception as error:
                print(
                    "[gemini] audio send failed:",
                    repr(error),
                )

                raise

    async def _receive_transcriptions(
        self,
        session,
    ) -> None:
        async for response in session.receive():
            if self._stop_requested.is_set():
                return

            server_content = getattr(
                response,
                "server_content",
                None,
            )

            if not server_content:
                continue

                     # Gemini Live provides:
            #
            # interim_input_transcription
            # input_transcription
            #
            # The former is the live speculative text.
            # The latter is the finalized transcript.

            interim = getattr(
                server_content,
                "interim_input_transcription",
                None,
            )

            if interim:
                interim_text = (
                    getattr(
                        interim,
                        "text",
                        None,
                    )
                    or ""
                ).strip()

                if interim_text:
                    print(
                        "[gemini] interim:",
                        interim_text,
                    )

                    self._on_transcription(
                        interim_text,
                        False,
                    )

            final = getattr(
                server_content,
                "input_transcription",
                None,
            )

            if final:
                final_text = (
                    getattr(
                        final,
                        "text",
                        None,
                    )
                    or ""
                ).strip()

                if final_text:
                    if (
                        final_text
                        == self._last_final_text
                    ):
                        continue

                    self._last_final_text = (
                        final_text
                    )

                    print(
                        "[gemini] final:",
                        final_text,
                    )

                    self._on_transcription(
                        final_text,
                        True,
                    )

    @staticmethod
    def _message_for_error(
        error: Exception,
    ) -> str:
        status = (
            getattr(
                error,
                "status_code",
                None,
            )
            or getattr(
                error,
                "status",
                None,
            )
        )

        details = str(error).lower()

        if (
            status == 429
            or "quota" in details
            or "resource_exhausted" in details
        ):
            return (
                "Gemini transcription rate limit reached. "
                "Please wait and try again."
            )

        return (
            "Gemini Live transcription failed. "
            "Check the backend terminal for details."
        )
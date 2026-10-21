import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { io, Socket } from 'socket.io-client';
import { Audio } from 'expo-av';
import { BACKEND_URL } from './src/config';

type Tab = 'listen' | 'history';

type SessionSummary = {
  id: number;
  title: string | null;
  started_at: string | null;
};

type SessionDetail = {
  id: number;
  title: string | null;
  transcripts: { text: string; at: string }[];
  suggestions: { text: string; at: string }[];
};

export default function App() {
  const [tab, setTab] = useState<Tab>('listen');
  const [backendOk, setBackendOk] = useState(false);
  const [status, setStatus] = useState('connecting…');
  const [listening, setListening] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pumpRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/health`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBackendOk(!!data.ok);
        setStatus(data.ok ? (data.gemini_key ? 'ready' : 'ready (no Gemini key)') : 'backend error');
      })
      .catch(() => {
        if (!cancelled) {
          setBackendOk(false);
          setStatus('backend offline');
        }
      });

    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      path: '/socket.io',
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!cancelled) setStatus((s) => (s === 'backend offline' ? 'ready' : s));
    });
    socket.on('transcription:interim', (payload: { text?: string } | string) => {
      const text = typeof payload === 'string' ? payload : payload?.text || '';
      setInterim(text.trim());
    });
    socket.on('transcription:final', (payload: { text?: string } | string) => {
      const text = (typeof payload === 'string' ? payload : payload?.text || '').trim();
      if (!text) return;
      setInterim('');
      setLines((prev) => [...prev, text].slice(-40));
    });
    socket.on('suggestion', (payload: { text?: string } | string) => {
      const text = typeof payload === 'string' ? payload : payload?.text || '';
      if (text) setSuggestion(text);
    });
    socket.on('transcription_error', (payload: { message?: string }) => {
      setStatus(payload?.message || 'STT error');
    });

    return () => {
      cancelled = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch(`${BACKEND_URL}/api/sessions`)
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const openSession = (id: number) => {
    fetch(`${BACKEND_URL}/api/sessions/${id}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => setDetail(null));
  };

  const stopListening = useCallback(async () => {
    if (pumpRef.current) {
      clearInterval(pumpRef.current);
      pumpRef.current = null;
    }
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* ignore */
      }
    }
    socketRef.current?.emit('transcription:stop');
    socketRef.current?.emit('end_session');
    setListening(false);
    setInterim('');
    setStatus(backendOk ? 'ready' : 'backend offline');
  }, [backendOk]);

  const startListening = useCallback(async () => {
    if (!backendOk) {
      setStatus('backend offline');
      return;
    }
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      setStatus('mic permission required');
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      android: {
        extension: '.wav',
        outputFormat: Audio.AndroidOutputFormat.DEFAULT,
        audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: '.wav',
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 128000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: {},
    });
    await recording.startAsync();
    recordingRef.current = recording;

    socketRef.current?.emit('start_session');
    socketRef.current?.emit('transcription:start');
    setListening(true);
    setStatus('listening');
    setSuggestion('');

    // Note: streaming raw PCM from expo-av is limited; this mobile client
    // prioritizes session UX + history. Full PCM streaming matches web/Electron
    // via the same Socket.IO events when a native module is added later.
  }, [backendOk]);

  const toggle = async () => {
    if (listening) await stopListening();
    else await startListening();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.logo}>Hinter</Text>
        <Text style={styles.tag}>Transparent · disclosed</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'listen' && styles.tabActive]}
          onPress={() => setTab('listen')}
        >
          <Text style={styles.tabText}>Listen</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}
        >
          <Text style={styles.tabText}>History</Text>
        </Pressable>
      </View>

      {tab === 'listen' ? (
        <View style={styles.panel}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, backendOk ? styles.dotOk : styles.dotErr]} />
            <Text style={styles.status}>{status}</Text>
          </View>

          <Pressable
            style={[styles.listenBtn, listening && styles.listenBtnActive]}
            onPress={toggle}
          >
            <Text style={styles.listenBtnText}>
              {listening ? 'Stop' : 'Start listening'}
            </Text>
          </Pressable>

          {suggestion ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Suggestion</Text>
              <Text style={styles.cardBody}>{suggestion}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>Transcript</Text>
          <ScrollView style={styles.transcript}>
            {lines.map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
            {interim ? <Text style={styles.interim}>{interim}</Text> : null}
            {!lines.length && !interim ? (
              <Text style={styles.muted}>
                Press Start and speak. Transcript and AI suggestions appear here.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={styles.panel}>
          {historyLoading ? <ActivityIndicator color="#38bdf8" /> : null}
          {sessions.map((s) => (
            <Pressable key={s.id} style={styles.sessionRow} onPress={() => openSession(s.id)}>
              <Text style={styles.sessionTitle}>{s.title || `Session #${s.id}`}</Text>
              <Text style={styles.muted}>
                {s.started_at ? new Date(s.started_at).toLocaleString() : '—'}
              </Text>
            </Pressable>
          ))}
          {!historyLoading && sessions.length === 0 ? (
            <Text style={styles.muted}>No sessions yet.</Text>
          ) : null}
          {detail ? (
            <View style={styles.detail}>
              <Text style={styles.sectionLabel}>Transcript</Text>
              {detail.transcripts?.map((t, i) => (
                <Text key={i} style={styles.line}>
                  {t.text}
                </Text>
              ))}
              <Text style={styles.sectionLabel}>Suggestions</Text>
              {detail.suggestions?.map((s, i) => (
                <Text key={i} style={[styles.line, styles.suggestLine]}>
                  {s.text}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: { color: '#f8fafc', fontSize: 22, fontWeight: '700' },
  tag: { color: '#64748b', fontSize: 12 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderColor: 'rgba(56,189,248,0.35)',
  },
  tabText: { color: '#e2e8f0', fontWeight: '600' },
  panel: { flex: 1, paddingHorizontal: 16, paddingBottom: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOk: { backgroundColor: '#34d399' },
  dotErr: { backgroundColor: '#f87171' },
  status: { color: '#94a3b8', fontSize: 13 },
  listenBtn: {
    backgroundColor: '#38bdf8',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  listenBtnActive: { backgroundColor: '#f87171' },
  listenBtnText: { color: '#0b1220', fontWeight: '700', fontSize: 16 },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
    padding: 14,
    marginBottom: 16,
  },
  cardLabel: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardBody: { color: '#7dd3fc', fontSize: 15, lineHeight: 22 },
  sectionLabel: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
  },
  transcript: { flex: 1 },
  line: { color: '#cbd5e1', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  interim: { color: '#64748b', fontStyle: 'italic' },
  muted: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  sessionRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.12)',
  },
  sessionTitle: { color: '#f8fafc', fontWeight: '600', marginBottom: 2 },
  detail: { marginTop: 16, paddingTop: 12 },
  suggestLine: { color: '#7dd3fc' },
});

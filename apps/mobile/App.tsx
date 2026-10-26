import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from './src/config';

type Tab = 'listen' | 'history';
type SessionRow = {
  id: number;
  started_at?: string;
  ended_at?: string | null;
  transcript?: string;
  suggestion_count?: number;
};

const SEGMENT_MS = 3500;

export default function App() {
  const [tab, setTab] = useState<Tab>('listen');
  const [status, setStatus] = useState('connecting…');
  const [online, setOnline] = useState(false);
  const [listening, setListening] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listeningRef = useRef(false);
  const rotateTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder);

  const statusColor = useMemo(() => {
    if (!online) return '#b91c1c';
    if (listening) return '#047857';
    return '#6366f1';
  }, [online, listening]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Microphone', 'Permission is required to Listen on mobile.');
        }
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
      } catch (e) {
        console.warn('audio setup', e);
      }

      try {
        const res = await fetch(`${BACKEND_URL}/api/health`);
        if (!res.ok) throw new Error(String(res.status));
        if (!cancelled) {
          setOnline(true);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setOnline(false);
          setStatus('backend offline');
        }
      }
    })();

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!cancelled) {
        setOnline(true);
        if (!listeningRef.current) setStatus('ready');
      }
    });
    socket.on('disconnect', () => {
      if (!cancelled) {
        setOnline(false);
        setStatus('disconnected');
      }
    });
    socket.on('connect_error', () => {
      if (!cancelled) {
        setOnline(false);
        setStatus('backend offline');
      }
    });
    socket.on('transcription:interim', (payload: { text?: string }) => {
      if (!payload?.text) return;
      setLines((prev) => {
        const next = [...prev];
        if (next.length && next[next.length - 1].startsWith('…')) {
          next[next.length - 1] = `… ${payload.text}`;
        } else next.push(`… ${payload.text}`);
        return next.slice(-40);
      });
    });
    socket.on('transcription:final', (payload: { text?: string }) => {
      if (!payload?.text) return;
      setLines((prev) => {
        const cleaned = prev.filter((l) => !l.startsWith('…'));
        return [...cleaned, payload.text!].slice(-40);
      });
    });
    socket.on('suggestion', (payload: { text?: string; suggestion?: string }) => {
      const text = payload?.text || payload?.suggestion || '';
      if (text) setSuggestion(text);
    });

    return () => {
      cancelled = true;
      if (rotateTimer.current) clearInterval(rotateTimer.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const uploadSegment = useCallback(async (uri: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return;

      const form = new FormData();
      form.append('audio', {
        uri,
        name: 'segment.m4a',
        type: 'audio/m4a',
      } as any);

      const res = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        // fallback: try base64 JSON if server expects that
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await fetch(`${BACKEND_URL}/api/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_base64: b64, mime: 'audio/m4a' }),
        });
        return;
      }
      const data = await res.json().catch(() => null);
      const text = data?.text || data?.transcript;
      if (text) {
        setLines((prev) => [...prev, text].slice(-40));
      }
    } catch (e) {
      console.warn('upload segment', e);
    }
  }, []);

  const startSegment = useCallback(async () => {
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (e) {
      console.warn('start segment', e);
      setStatus('mic error');
    }
  }, [audioRecorder]);

  const rotateSegment = useCallback(async () => {
    if (!listeningRef.current) return;
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (uri) await uploadSegment(uri);
    } catch (e) {
      console.warn('rotate stop', e);
    }
    if (listeningRef.current) {
      await startSegment();
    }
  }, [audioRecorder, startSegment, uploadSegment]);

  const stopListening = useCallback(async () => {
    listeningRef.current = false;
    setListening(false);
    if (rotateTimer.current) {
      clearInterval(rotateTimer.current);
      rotateTimer.current = null;
    }
    try {
      if (recorderState.isRecording) {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        if (uri) await uploadSegment(uri);
      }
    } catch {
      /* ignore */
    }
    socketRef.current?.emit('transcription:stop');
    setStatus(online ? 'ready' : 'backend offline');
  }, [audioRecorder, online, recorderState.isRecording, uploadSegment]);

  const startListening = useCallback(async () => {
    if (!online) {
      Alert.alert('Backend offline', 'Wait for status ready, then try again.');
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone denied', 'Enable mic permission in system settings.');
      return;
    }

    setLines([]);
    setSuggestion('');
    listeningRef.current = true;
    setListening(true);
    setStatus('listening…');
    socketRef.current?.emit('transcription:start');

    await startSegment();
    rotateTimer.current = setInterval(() => {
      rotateSegment();
    }, SEGMENT_MS);
  }, [online, rotateSegment, startSegment]);

  const toggleListen = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions?limit=20`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : data.sessions || []);
    } catch {
      setSessions([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.dot} />
          <Text style={styles.brand}>Hinter</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{status}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'listen' && styles.tabActive]}
          onPress={() => setTab('listen')}
        >
          <Text style={[styles.tabText, tab === 'listen' && styles.tabTextActive]}>Listen</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
        </Pressable>
      </View>

      {tab === 'listen' ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Pressable
            style={[styles.listenBtn, listening && styles.listenBtnOn]}
            onPress={toggleListen}
          >
            <Text style={[styles.listenText, listening && styles.listenTextOn]}>
              {listening ? 'Stop' : 'Listen'}
            </Text>
          </Pressable>
          <Text style={styles.muted}>
            Mic on device → short segments → same Render API. Speak clearly after tapping Listen.
          </Text>

          <Text style={styles.section}>Live transcript</Text>
          <View style={styles.card}>
            {lines.length === 0 ? (
              <Text style={styles.muted}>Transcript appears here while listening.</Text>
            ) : (
              lines.map((line, i) => (
                <Text key={i} style={styles.line}>
                  {line}
                </Text>
              ))
            )}
          </View>

          <Text style={styles.section}>AI suggestion</Text>
          <View style={styles.card}>
            <Text style={styles.suggestion}>{suggestion || 'Suggestions will appear here.'}</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Pressable style={styles.refresh} onPress={loadHistory}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
          {loadingHistory ? (
            <ActivityIndicator color="#6366f1" />
          ) : sessions.length === 0 ? (
            <Text style={styles.muted}>No sessions yet.</Text>
          ) : (
            sessions.map((s) => (
              <View key={s.id} style={styles.card}>
                <Text style={styles.cardTitle}>Session #{s.id}</Text>
                <Text style={styles.muted}>{s.started_at || '—'}</Text>
                <Text style={styles.line} numberOfLines={4}>
                  {s.transcript || '(empty)'}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6366f1' },
  brand: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#e8eaf2',
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: '#64748b', fontWeight: '600' },
  tabTextActive: { color: '#0f172a' },
  body: { padding: 16, paddingBottom: 40, gap: 10 },
  listenBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  listenBtnOn: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  listenText: { fontWeight: '700', color: '#0f172a', fontSize: 16 },
  listenTextOn: { color: '#047857' },
  section: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#6366f1',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  cardTitle: { fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  muted: { color: '#64748b', lineHeight: 20 },
  line: { color: '#0f172a', marginBottom: 4, lineHeight: 20 },
  suggestion: { color: '#0f172a', lineHeight: 22 },
  refresh: {
    alignSelf: 'flex-start',
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 8,
  },
  refreshText: { color: '#fff', fontWeight: '600' },
});

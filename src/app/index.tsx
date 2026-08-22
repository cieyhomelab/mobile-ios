import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useGoogleCalendarSession } from '@/hooks/use-google-calendar-session';
import { useVoiceRecorder } from '@/lib/audio-recorder';
import { handleCreateEventTool } from '@/lib/create-event-tool';
import { parseEventFromTranscript } from '@/lib/event-parser';
import type { DraftEvent } from '@/lib/google-calendar-api';
import { transcribeAudio } from '@/lib/voice-stt';

export default function HomeScreen() {
  return <VoiceScreen />;
}

type ScreenPhase = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'confirming' | 'creating';

function VoiceScreen() {
  const session = useGoogleCalendarSession();
  const recorder = useVoiceRecorder();
  const [phase, setPhase] = useState<ScreenPhase>('idle');
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const handlePressIn = useCallback(() => {
    if (session.state !== 'signedIn' || phase !== 'idle') return;
    setPipelineError(null);
    setResultMessage(null);
    setPhase('recording');
    recorder.start().catch((err: unknown) => {
      setPipelineError(err instanceof Error ? err.message : 'Could not start recording');
      setPhase('idle');
    });
  }, [session.state, phase, recorder]);

  const handlePressOut = useCallback(() => {
    if (phase !== 'recording') return;
    void (async () => {
      try {
        const uri = await recorder.stop();
        setPhase('transcribing');
        const transcript = await transcribeAudio(uri);
        setPhase('parsing');
        const parsed = await parseEventFromTranscript(transcript);
        setDraft(parsed);
        setPhase('confirming');
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Something went wrong');
        setPhase('idle');
      }
    })();
  }, [phase, recorder]);

  const handleConfirm = useCallback(() => {
    if (!draft) return;
    setPhase('creating');
    void (async () => {
      const message = await handleCreateEventTool(draft, () => void session.forceSignOut());
      setResultMessage(message);
      setDraft(null);
      setPhase('idle');
    })();
  }, [draft, session]);

  const handleCancel = useCallback(() => {
    setDraft(null);
    setPhase('idle');
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Voice Create Event
        </ThemedText>

        {session.state === 'loading' && <ActivityIndicator />}

        {session.state === 'signedOut' && (
          <>
            <Pressable
              disabled={session.isConnecting}
              style={({ pressed }) => pressed && styles.pressed}
              onPress={() => void session.handleConnect()}>
              <ThemedView type="backgroundSelected" style={styles.button}>
                <ThemedText type="default">
                  {session.isConnecting ? 'Connecting…' : 'Connect Google Calendar'}
                </ThemedText>
              </ThemedView>
            </Pressable>
            {session.error !== null && <ThemedText type="small">{session.error}</ThemedText>}
          </>
        )}

        {session.state === 'signedIn' && phase !== 'confirming' && (
          <>
            <Pressable
              disabled={phase !== 'idle' && phase !== 'recording'}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundSelected" style={styles.button}>
                {(phase === 'transcribing' || phase === 'parsing' || phase === 'creating') && (
                  <ActivityIndicator />
                )}
                <ThemedText type="default">{statusLabel(phase)}</ThemedText>
              </ThemedView>
            </Pressable>
            {pipelineError !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {pipelineError}
              </ThemedText>
            )}
            {resultMessage !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {resultMessage}
              </ThemedText>
            )}
            {session.error !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {session.error}
              </ThemedText>
            )}
          </>
        )}

        {session.state === 'signedIn' && phase === 'confirming' && draft && (
          <>
            <ThemedText type="default">{draft.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDraftTime(draft)}
            </ThemedText>
            <ThemedView style={styles.confirmRow}>
              <Pressable style={({ pressed }) => pressed && styles.pressed} onPress={handleConfirm}>
                <ThemedView type="backgroundSelected" style={styles.button}>
                  <ThemedText type="default">Confirm</ThemedText>
                </ThemedView>
              </Pressable>
              <Pressable style={({ pressed }) => pressed && styles.pressed} onPress={handleCancel}>
                <ThemedView type="backgroundElement" style={styles.button}>
                  <ThemedText type="default">Cancel</ThemedText>
                </ThemedView>
              </Pressable>
            </ThemedView>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function statusLabel(phase: ScreenPhase): string {
  switch (phase) {
    case 'recording':
      return 'Listening… release to finish';
    case 'transcribing':
      return 'Transcribing…';
    case 'parsing':
      return 'Understanding…';
    case 'creating':
      return 'Creating event…';
    case 'idle':
    default:
      return 'Hold to create an event';
  }
}

function formatDraftTime(draft: DraftEvent): string {
  const start = new Date(draft.startDateTime);
  const formatted = start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const durationMinutes = draft.durationMinutes ?? 60;
  return `${formatted} · ${durationMinutes} min`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  title: {
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});

import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useGoogleCalendarSession } from '@/hooks/use-google-calendar-session';
import { useVoiceRecorder } from '@/lib/audio-recorder';
import { handleCreateEventTool } from '@/lib/create-event-tool';
import { findEventToDelete, handleDeleteEventTool, type EventMatch } from '@/lib/delete-event-tool';
import { parseDeleteTargetFromTranscript, parseEventFromTranscript } from '@/lib/event-parser';
import {
  CalendarApiError,
  listTodayEvents,
  type CalendarEvent,
  type DraftEvent,
} from '@/lib/google-calendar-api';
import { formatTodayReadout } from '@/lib/today-readout';
import { transcribeAudio } from '@/lib/voice-stt';
import { synthesizeSpeech } from '@/lib/voice-tts';

export default function HomeScreen() {
  return <VoiceScreen />;
}

type ScreenPhase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'parsing'
  | 'confirming'
  | 'creating'
  | 'fetchingToday'
  | 'speakingToday'
  | 'recordingDelete'
  | 'transcribingDelete'
  | 'findingEvent'
  | 'confirmingDelete'
  | 'deleting';

function VoiceScreen() {
  const session = useGoogleCalendarSession();
  const recorder = useVoiceRecorder();
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<ScreenPhase>('idle');
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventMatch | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    if (phase !== 'speakingToday' || !playerStatus.didJustFinish) return;
    void Promise.resolve().then(() => setPhase('idle'));
  }, [phase, playerStatus.didJustFinish]);

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

  const handleDeletePressIn = useCallback(() => {
    if (session.state !== 'signedIn' || phase !== 'idle') return;
    setPipelineError(null);
    setResultMessage(null);
    setPhase('recordingDelete');
    recorder.start().catch((err: unknown) => {
      setPipelineError(err instanceof Error ? err.message : 'Could not start recording');
      setPhase('idle');
    });
  }, [session.state, phase, recorder]);

  const handleDeletePressOut = useCallback(() => {
    if (phase !== 'recordingDelete') return;
    void (async () => {
      try {
        const uri = await recorder.stop();
        setPhase('transcribingDelete');
        const transcript = await transcribeAudio(uri);
        setPhase('findingEvent');
        const target = await parseDeleteTargetFromTranscript(transcript);
        const match = await findEventToDelete(target, () => void session.forceSignOut());
        if ('error' in match) {
          setPipelineError(match.error);
          setPhase('idle');
          return;
        }
        setDeleteTarget(match);
        setPhase('confirmingDelete');
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : 'Something went wrong');
        setPhase('idle');
      }
    })();
  }, [phase, recorder, session]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    setPhase('deleting');
    void (async () => {
      const message = await handleDeleteEventTool(deleteTarget.event.id, () => void session.forceSignOut());
      setResultMessage(message);
      setDeleteTarget(null);
      setPhase('idle');
    })();
  }, [deleteTarget, session]);

  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null);
    setPhase('idle');
  }, []);

  const handleReadToday = useCallback(() => {
    const accessToken = session.accessToken;
    if (session.state !== 'signedIn' || phase !== 'idle' || !accessToken) return;
    setPipelineError(null);
    setResultMessage(null);
    setPhase('fetchingToday');
    void (async () => {
      try {
        const events = await listTodayEvents(accessToken);
        const summary = formatTodayReadout(events);
        const uri = await synthesizeSpeech(summary);
        player.replace(uri);
        player.play();
        setPhase('speakingToday');
      } catch (err) {
        if (err instanceof CalendarApiError && err.status === 401) {
          await session.forceSignOut();
          setPhase('idle');
          return;
        }
        setPipelineError(err instanceof Error ? err.message : "Couldn't read today's events");
        setPhase('idle');
      }
    })();
  }, [session, phase, player]);

  const handleStopSpeaking = useCallback(() => {
    player.pause();
    setPhase('idle');
  }, [player]);

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

        {session.state === 'signedIn' && phase !== 'confirming' && phase !== 'confirmingDelete' && (
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
            {phase === 'speakingToday' ? (
              <Pressable style={({ pressed }) => pressed && styles.pressed} onPress={handleStopSpeaking}>
                <ThemedView type="backgroundElement" style={styles.button}>
                  <ThemedText type="default">Stop</ThemedText>
                </ThemedView>
              </Pressable>
            ) : (
              <Pressable
                disabled={phase !== 'idle'}
                onPress={handleReadToday}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundSelected" style={styles.button}>
                  {phase === 'fetchingToday' && <ActivityIndicator />}
                  <ThemedText type="default">
                    {phase === 'fetchingToday' ? 'Checking your calendar…' : "What's on today?"}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            )}
            <Pressable
              disabled={phase !== 'idle' && phase !== 'recordingDelete'}
              onPressIn={handleDeletePressIn}
              onPressOut={handleDeletePressOut}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundSelected" style={styles.button}>
                {(phase === 'transcribingDelete' || phase === 'findingEvent' || phase === 'deleting') && (
                  <ActivityIndicator />
                )}
                <ThemedText type="default">{deleteStatusLabel(phase)}</ThemedText>
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

        {session.state === 'signedIn' && phase === 'confirmingDelete' && deleteTarget && (
          <>
            <ThemedText type="default">{deleteTarget.event.summary}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatEventTime(deleteTarget.event)}
            </ThemedText>
            {deleteTarget.matchCount > 1 && (
              <ThemedText type="small" themeColor="textSecondary">
                1 of {deleteTarget.matchCount} matching events — is this the one?
              </ThemedText>
            )}
            <ThemedView style={styles.confirmRow}>
              <Pressable style={({ pressed }) => pressed && styles.pressed} onPress={handleConfirmDelete}>
                <ThemedView type="backgroundSelected" style={styles.button}>
                  <ThemedText type="default">Delete</ThemedText>
                </ThemedView>
              </Pressable>
              <Pressable style={({ pressed }) => pressed && styles.pressed} onPress={handleCancelDelete}>
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

function deleteStatusLabel(phase: ScreenPhase): string {
  switch (phase) {
    case 'recordingDelete':
      return 'Listening… release to finish';
    case 'transcribingDelete':
      return 'Transcribing…';
    case 'findingEvent':
      return 'Finding event…';
    case 'deleting':
      return 'Deleting event…';
    case 'idle':
    default:
      return 'Hold to delete an event';
  }
}

function formatEventTime(event: CalendarEvent): string {
  const start = new Date(event.start);
  return start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

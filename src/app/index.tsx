import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarAccessNote } from '@/components/calendar-access-note';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { VoiceColors } from '@/constants/voice-theme';
import { useGoogleCalendarSession, type GoogleCalendarSession } from '@/hooks/use-google-calendar-session';
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

  const handleLogout = useCallback(async () => {
    setPhase('idle');
    setDraft(null);
    setDeleteTarget(null);
    setPipelineError(null);
    setResultMessage(null);
    await session.forceSignOut();
  }, [session]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        {session.state === 'loading' && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={VoiceColors.accent} />
          </View>
        )}

        {session.state === 'signedOut' && <OnboardingView session={session} />}

        {session.state === 'signedIn' && phase !== 'confirming' && phase !== 'confirmingDelete' && (
          <HomeView
            phase={phase}
            pipelineError={pipelineError}
            resultMessage={resultMessage}
            sessionError={session.error}
            onMicPressIn={handlePressIn}
            onMicPressOut={handlePressOut}
            onReadToday={handleReadToday}
            onStopSpeaking={handleStopSpeaking}
            onDeletePressIn={handleDeletePressIn}
            onDeletePressOut={handleDeletePressOut}
            onLogout={() => void handleLogout()}
          />
        )}

        {session.state === 'signedIn' && phase === 'confirming' && draft && (
          <ConfirmCreateView draft={draft} onConfirm={handleConfirm} onCancel={handleCancel} />
        )}

        {session.state === 'signedIn' && phase === 'confirmingDelete' && deleteTarget && (
          <ConfirmDeleteView target={deleteTarget} onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} />
        )}
      </SafeAreaView>
    </View>
  );
}

type IconName = NonNullable<SymbolViewProps['name']>;

const icons = {
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' } as IconName,
  checkmark: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } as IconName,
  mic: { ios: 'mic.fill', android: 'mic', web: 'mic' } as IconName,
  waveform: { ios: 'waveform', android: 'graphic_eq', web: 'graphic_eq' } as IconName,
  trash: { ios: 'trash', android: 'delete', web: 'delete' } as IconName,
  timer: { ios: 'timer', android: 'timer', web: 'timer' } as IconName,
  info: { ios: 'info.circle', android: 'info', web: 'info' } as IconName,
  stop: { ios: 'stop.fill', android: 'stop_circle', web: 'stop_circle' } as IconName,
};

function OnboardingView({ session }: { session: GoogleCalendarSession }) {
  return (
    <View style={styles.centered}>
      <View style={styles.onboardingIconCircle}>
        <SymbolView name={icons.calendar} size={40} tintColor={VoiceColors.accent} />
      </View>
      <Text style={styles.onboardingTitle}>Your calendar, hands-free</Text>
      <CalendarAccessNote />
      <Pressable
        disabled={session.isConnecting}
        onPress={() => void session.handleConnect()}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        {session.isConnecting ? (
          <ActivityIndicator color={VoiceColors.onAccent} />
        ) : (
          <Text style={styles.primaryButtonText}>Connect Google Calendar</Text>
        )}
      </Pressable>
      <Text style={styles.disclaimer}>
        You&apos;ll grant calendar access now. Microphone access is requested the first time you record.
      </Text>
      {session.error !== null && <Text style={styles.errorText}>{session.error}</Text>}
    </View>
  );
}

type HomeViewProps = {
  phase: ScreenPhase;
  pipelineError: string | null;
  resultMessage: string | null;
  sessionError: string | null;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
  onReadToday: () => void;
  onStopSpeaking: () => void;
  onDeletePressIn: () => void;
  onDeletePressOut: () => void;
  onLogout: () => void;
};

function HomeView({
  phase,
  pipelineError,
  resultMessage,
  sessionError,
  onMicPressIn,
  onMicPressOut,
  onReadToday,
  onStopSpeaking,
  onDeletePressIn,
  onDeletePressOut,
  onLogout,
}: HomeViewProps) {
  const isListening = phase === 'recording';
  const micDisabled = phase !== 'idle' && phase !== 'recording';
  const logoutDisabled = phase !== 'idle';
  const status = statusText(phase);

  const handleLogoutPress = () => {
    Alert.alert('Log out?', 'You can reconnect with the same or a different Google account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: onLogout },
    ]);
  };

  return (
    <View style={styles.homeScreen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.headline}>What would you like to do?</Text>
        </View>
        <Pressable
          disabled={logoutDisabled}
          onPress={handleLogoutPress}
          style={({ pressed }) => [styles.connectedBadge, pressed && !logoutDisabled && styles.pressed]}>
          <SymbolView name={icons.checkmark} size={14} tintColor={VoiceColors.accent} />
          <Text style={styles.connectedBadgeText}>Connected</Text>
        </Pressable>
      </View>

      <View style={styles.micArea}>
        <View style={styles.micWrap}>
          {isListening && <View style={styles.micRing} />}
          <Pressable
            disabled={micDisabled}
            onPressIn={onMicPressIn}
            onPressOut={onMicPressOut}
            style={({ pressed }) => [styles.micButton, pressed && !micDisabled && styles.pressed]}>
            <SymbolView name={icons.mic} size={56} tintColor={VoiceColors.onAccent} />
          </Pressable>
        </View>
        {isListening && (
          <SymbolView
            name={icons.waveform}
            size={28}
            tintColor={VoiceColors.accent}
            style={styles.waveformIcon}
          />
        )}
        <View style={styles.statusTextWrap}>
          <Text style={styles.statusTitle}>{status.title}</Text>
          <Text style={styles.statusSubtitle}>{status.subtitle}</Text>
        </View>
      </View>

      <View>
        <View style={styles.actionsRow}>
          {phase === 'speakingToday' ? (
            <ActionTile icon={icons.stop} label="Stop" onPress={onStopSpeaking} />
          ) : (
            <ActionTile
              icon={icons.calendar}
              label={phase === 'fetchingToday' ? 'Checking your calendar…' : "What's on today?"}
              onPress={onReadToday}
              disabled={phase !== 'idle'}
              loading={phase === 'fetchingToday'}
            />
          )}
          <ActionTile
            icon={icons.trash}
            label={deleteTileLabel(phase)}
            onPressIn={onDeletePressIn}
            onPressOut={onDeletePressOut}
            disabled={phase !== 'idle' && phase !== 'recordingDelete'}
            highlighted={phase === 'recordingDelete'}
            loading={phase === 'transcribingDelete' || phase === 'findingEvent' || phase === 'deleting'}
          />
        </View>
        {pipelineError !== null && <Text style={styles.messageText}>{pipelineError}</Text>}
        {resultMessage !== null && <Text style={styles.messageText}>{resultMessage}</Text>}
        {sessionError !== null && <Text style={styles.messageText}>{sessionError}</Text>}
      </View>
    </View>
  );
}

type ActionTileProps = {
  icon: IconName;
  label: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  highlighted?: boolean;
  loading?: boolean;
};

function ActionTile({ icon, label, onPress, onPressIn, onPressOut, disabled, highlighted, loading }: ActionTileProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.actionTile,
        highlighted && styles.actionTileHighlighted,
        disabled && !highlighted && styles.actionTileDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={VoiceColors.accent} />
      ) : (
        <SymbolView name={icon} size={22} tintColor={highlighted ? VoiceColors.accent : VoiceColors.textPrimary} />
      )}
      <Text style={styles.actionTileLabel}>{label}</Text>
    </Pressable>
  );
}

function ConfirmCreateView({
  draft,
  onConfirm,
  onCancel,
}: {
  draft: DraftEvent;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.confirmScreen}>
      <Text style={styles.confirmTitle}>Did I get this right?</Text>
      <Text style={styles.confirmSubtitle}>Say yes to confirm, or use the buttons below.</Text>
      <View style={styles.confirmCard}>
        <View style={styles.confirmCardRow}>
          <SymbolView name={icons.calendar} size={20} tintColor={VoiceColors.accent} />
          <Text style={styles.confirmCardTitle}>{draft.title}</Text>
        </View>
        <View style={styles.confirmCardRow}>
          <SymbolView name={icons.timer} size={18} tintColor={VoiceColors.textSecondary} />
          <Text style={styles.confirmCardSubtitle}>{formatDraftTime(draft)}</Text>
        </View>
      </View>
      <View style={styles.confirmButtonsRow}>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onConfirm} style={({ pressed }) => [styles.primaryButtonFlex, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>Confirm</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ConfirmDeleteView({
  target,
  onConfirm,
  onCancel,
}: {
  target: EventMatch;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.confirmScreen}>
      <Text style={styles.confirmTitle}>Delete this event?</Text>
      <Text style={styles.confirmSubtitle}>This can&apos;t be undone. Say yes to confirm, or use the buttons below.</Text>
      <View style={styles.confirmCard}>
        <View style={styles.confirmCardRow}>
          <SymbolView name={icons.trash} size={20} tintColor={VoiceColors.danger} />
          <Text style={styles.confirmCardTitle}>{target.event.summary}</Text>
        </View>
        <View style={styles.confirmCardRow}>
          <SymbolView name={icons.timer} size={18} tintColor={VoiceColors.textSecondary} />
          <Text style={styles.confirmCardSubtitle}>{formatEventTime(target.event)}</Text>
        </View>
      </View>
      {target.matchCount > 1 && (
        <View style={styles.infoRow}>
          <SymbolView name={icons.info} size={16} tintColor={VoiceColors.textSecondary} />
          <Text style={styles.infoRowText}>1 of {target.matchCount} matching events — is this the one?</Text>
        </View>
      )}
      <View style={styles.confirmButtonsRow}>
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onConfirm} style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
          <Text style={styles.dangerButtonText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function statusText(phase: ScreenPhase): { title: string; subtitle: string } {
  switch (phase) {
    case 'recording':
      return { title: 'Listening… release to finish', subtitle: 'Speak now, then let go' };
    case 'transcribing':
    case 'transcribingDelete':
      return { title: 'Transcribing…', subtitle: 'Turning your voice into text' };
    case 'parsing':
      return { title: 'Understanding…', subtitle: 'Figuring out the details' };
    case 'creating':
      return { title: 'Creating event…', subtitle: 'Adding it to your calendar' };
    case 'fetchingToday':
      return { title: 'Checking your calendar…', subtitle: 'One moment' };
    case 'speakingToday':
      return { title: "Here's your day", subtitle: 'Tap stop to end playback' };
    case 'recordingDelete':
      return { title: 'Listening… release to finish', subtitle: 'Speak now, then let go' };
    case 'findingEvent':
      return { title: 'Finding event…', subtitle: 'Matching it to your calendar' };
    case 'deleting':
      return { title: 'Deleting event…', subtitle: 'Removing it from your calendar' };
    case 'idle':
    default:
      return { title: 'Hold to create an event', subtitle: 'Press and hold, release to send' };
  }
}

function deleteTileLabel(phase: ScreenPhase): string {
  switch (phase) {
    case 'recordingDelete':
      return 'Listening…';
    case 'transcribingDelete':
      return 'Transcribing…';
    case 'findingEvent':
      return 'Finding event…';
    case 'deleting':
      return 'Deleting…';
    default:
      return 'Delete an event';
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
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: VoiceColors.background,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },

  // Onboarding
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  onboardingIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: VoiceColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  onboardingTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 13,
    lineHeight: 18,
    color: VoiceColors.textSecondary,
    textAlign: 'center',
    marginTop: -Spacing.one,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: VoiceColors.danger,
    textAlign: 'center',
  },

  // Buttons
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: VoiceColors.accent,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  primaryButtonFlex: {
    flex: 1,
    backgroundColor: VoiceColors.accent,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: VoiceColors.onAccent,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: VoiceColors.card,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
  },
  dangerButton: {
    flex: 1,
    backgroundColor: VoiceColors.danger,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: VoiceColors.onDanger,
  },

  // Home
  homeScreen: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontSize: 15,
    lineHeight: 20,
    color: VoiceColors.textSecondary,
    fontWeight: '500',
  },
  headline: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
    marginTop: Spacing.half,
    maxWidth: 220,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: VoiceColors.card,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  connectedBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: VoiceColors.textSecondary,
  },
  micArea: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  micWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRing: {
    position: 'absolute',
    width: 232,
    height: 232,
    borderRadius: 116,
    borderWidth: 1,
    borderColor: VoiceColors.accent,
  },
  micButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: VoiceColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: VoiceColors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  waveformIcon: {
    marginTop: -Spacing.two,
  },
  statusTextWrap: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: 14,
    color: VoiceColors.textSecondary,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  actionTile: {
    flex: 1,
    backgroundColor: VoiceColors.card,
    borderRadius: Spacing.four,
    paddingVertical: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionTileHighlighted: {
    borderColor: VoiceColors.accent,
  },
  actionTileDisabled: {
    opacity: 0.5,
  },
  actionTileLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: VoiceColors.textPrimary,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 13,
    color: VoiceColors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.two,
  },

  // Confirm screens
  confirmScreen: {
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  confirmTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
  },
  confirmSubtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: VoiceColors.textSecondary,
    marginTop: -Spacing.two,
  },
  confirmCard: {
    backgroundColor: VoiceColors.card,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  confirmCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  confirmCardTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
  },
  confirmCardSubtitle: {
    fontSize: 15,
    color: VoiceColors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  infoRowText: {
    fontSize: 14,
    color: VoiceColors.textSecondary,
    flexShrink: 1,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
});

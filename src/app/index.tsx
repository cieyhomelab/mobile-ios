import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ConversationProvider,
  ConversationStatus,
  useConversationControls,
  useConversationStatus,
} from '@elevenlabs/react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useGoogleCalendarSession } from '@/hooks/use-google-calendar-session';
import { handleCreateEventTool } from '@/lib/create-event-tool';
import { DraftEvent } from '@/lib/google-calendar-api';
import { ELEVENLABS_AGENT_ID } from '@/lib/voice-config';
import { useWakeWordListener, WakeWordListener } from '@/lib/wake-word';

export default function HomeScreen() {
  return (
    <ConversationProvider agentId={ELEVENLABS_AGENT_ID}>
      <VoiceScreen />
    </ConversationProvider>
  );
}

function VoiceScreen() {
  const session = useGoogleCalendarSession();
  const { startSession, endSession } = useConversationControls();
  const { status, message } = useConversationStatus();

  const wakeWordRef = useRef<WakeWordListener | null>(null);
  const suppressAutoResumeRef = useRef(false);

  const handleCreateEvent = useCallback(
    (params: DraftEvent) =>
      handleCreateEventTool(params, () => {
        suppressAutoResumeRef.current = true;
        endSession();
        void session.forceSignOut();
      }),
    [endSession, session],
  );

  const handleWake = useCallback(() => {
    void (async () => {
      await wakeWordRef.current?.stop();
      suppressAutoResumeRef.current = false;
      startSession({
        agentId: ELEVENLABS_AGENT_ID,
        clientTools: { create_event: handleCreateEvent },
        dynamicVariables: {
          currentDateTime: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        onDisconnect: () => {
          if (!suppressAutoResumeRef.current) void wakeWordRef.current?.start();
        },
        onError: () => {
          if (!suppressAutoResumeRef.current) void wakeWordRef.current?.start();
        },
      });
    })();
  }, [startSession, handleCreateEvent]);

  const wakeWord = useWakeWordListener(handleWake);

  useEffect(() => {
    wakeWordRef.current = wakeWord;
  }, [wakeWord]);

  useEffect(() => {
    if (session.state !== 'signedIn') return;
    void wakeWordRef.current?.start();
    return () => {
      void wakeWordRef.current?.stop();
    };
  }, [session.state]);

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

        {session.state === 'signedIn' && (
          <>
            {status === 'connecting' && <ActivityIndicator />}
            <ThemedText type="default">{statusLabel(status, message)}</ThemedText>
            {session.error !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {session.error}
              </ThemedText>
            )}
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function statusLabel(status: ConversationStatus, message?: string): string {
  switch (status) {
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Listening — say the event details';
    case 'error':
      return message ?? 'Something went wrong';
    case 'disconnected':
    default:
      return 'Say the wake word to create an event';
  }
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
  },
  pressed: {
    opacity: 0.7,
  },
});

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { CalendarApiError, CalendarEvent, listUpcomingEvents } from '@/lib/google-calendar-api';
import {
  configureGoogleAuth,
  getAccessToken,
  signInInteractively,
  signInSilently,
  signOutLocally,
} from '@/lib/google-calendar-auth';

type ScreenState = 'loading' | 'signedOut' | 'signedIn';

export default function HomeScreen() {
  const [state, setState] = useState<ScreenState>('loading');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const loadEvents = useCallback(async (accessToken: string) => {
    try {
      const upcoming = await listUpcomingEvents(accessToken);
      setEvents(upcoming);
      setError(null);
      setState('signedIn');
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        await signOutLocally();
        setEvents([]);
        setState('signedOut');
        return;
      }
      setError("Couldn't refresh events");
      setState((prev) => (prev === 'signedIn' ? 'signedIn' : 'signedOut'));
    }
  }, []);

  useEffect(() => {
    (async () => {
      configureGoogleAuth();
      const silentlySignedIn = await signInSilently();
      if (!silentlySignedIn) {
        setState('signedOut');
        return;
      }
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setState('signedOut');
        return;
      }
      await loadEvents(accessToken);
    })();
  }, [loadEvents]);

  const handleConnect = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);
    try {
      const result = await signInInteractively();
      if ('error' in result) {
        setError(result.error);
        return;
      }
      await loadEvents(result.accessToken);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, loadEvents]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Google Calendar
        </ThemedText>

        {state === 'loading' && <ActivityIndicator />}

        {state === 'signedOut' && (
          <>
            <Pressable
              disabled={isConnecting}
              style={({ pressed }) => pressed && styles.pressed}
              onPress={() => void handleConnect()}>
              <ThemedView type="backgroundSelected" style={styles.button}>
                <ThemedText type="default">
                  {isConnecting ? 'Connecting…' : 'Connect Google Calendar'}
                </ThemedText>
              </ThemedView>
            </Pressable>
            {error !== null && <ThemedText type="small">{error}</ThemedText>}
          </>
        )}

        {state === 'signedIn' && (
          <>
            {error !== null && <ThemedText type="small">{error}</ThemedText>}
            <ThemedView type="backgroundElement" style={styles.eventList}>
              {events.length === 0 && <ThemedText type="small">No upcoming events</ThemedText>}
              {events.map((event) => (
                <ThemedView key={event.id} style={styles.eventRow}>
                  <ThemedText type="default">{event.summary}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {event.start}
                  </ThemedText>
                </ThemedView>
              ))}
            </ThemedView>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
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
  eventList: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  eventRow: {
    gap: Spacing.half,
  },
});

import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useGoogleCalendarSession } from '@/hooks/use-google-calendar-session';

export default function HomeScreen() {
  return <VoiceScreen />;
}

function VoiceScreen() {
  const session = useGoogleCalendarSession();

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
            <ThemedText type="default">Voice recording coming soon</ThemedText>
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

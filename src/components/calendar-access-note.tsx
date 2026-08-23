import { StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';

export function CalendarAccessNote() {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
      To create, check, and delete events by voice while you drive, this app needs access to your Google Calendar. It
      only reads and writes events — nothing else is accessed, and nothing is shared beyond what&apos;s needed to
      fulfill your request.
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  note: {
    textAlign: 'center',
  },
});

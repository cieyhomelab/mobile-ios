import { StyleSheet, Text } from 'react-native';

import { VoiceColors } from '@/constants/voice-theme';

export function CalendarAccessNote() {
  return (
    <Text style={styles.note}>
      To create, check, and delete events by voice while you drive, this app needs access to your Google Calendar. It
      only reads and writes events — nothing else is accessed or shared.
    </Text>
  );
}

const styles = StyleSheet.create({
  note: {
    textAlign: 'center',
    color: VoiceColors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
});

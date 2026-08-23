/**
 * Fixed dark palette for the voice-assistant screens (onboarding, home, confirmations).
 * These screens are designed dark-only, independent of the system color scheme.
 */
export const VoiceColors = {
  background: '#0B0B10',
  card: '#1A1B22',
  cardMuted: 'rgba(26, 27, 34, 0.6)',
  accent: '#F5A623',
  accentGlow: 'rgba(245, 166, 35, 0.35)',
  onAccent: '#1A1300',
  danger: '#EA5A48',
  onDanger: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#9296A1',
  iconMuted: '#71757F',
} as const;

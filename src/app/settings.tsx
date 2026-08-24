import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { VoiceColors } from '@/constants/voice-theme';
import {
  clearAnthropicKey,
  clearElevenLabsKey,
  clearElevenLabsVoiceId,
  getElevenLabsVoiceId,
  hasAnthropicKey,
  hasElevenLabsKey,
  saveAnthropicKey,
  saveElevenLabsKey,
  saveElevenLabsVoiceId,
  validateAnthropicKey,
  validateElevenLabsKey,
} from '@/lib/secure-keys';

type ProviderStatus = { connected: boolean; planName?: string };

export default function SettingsScreen() {
  const [elevenLabsStatus, setElevenLabsStatus] = useState<ProviderStatus>({ connected: false });
  const [anthropicStatus, setAnthropicStatus] = useState<ProviderStatus>({ connected: false });
  const [showExplainer, setShowExplainer] = useState(false);

  const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState('');
  const [elevenLabsError, setElevenLabsError] = useState<string | null>(null);
  const [elevenLabsSaving, setElevenLabsSaving] = useState(false);

  const [voiceIdInput, setVoiceIdInput] = useState('');
  const [voiceIdSaving, setVoiceIdSaving] = useState(false);

  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [anthropicError, setAnthropicError] = useState<string | null>(null);
  const [anthropicSaving, setAnthropicSaving] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadStatuses = useCallback(() => {
    void (async () => {
      try {
        setLoadError(null);
        const [elHas, anHas, voiceId] = await Promise.all([
          hasElevenLabsKey(),
          hasAnthropicKey(),
          getElevenLabsVoiceId(),
        ]);
        setElevenLabsStatus({ connected: elHas });
        setAnthropicStatus({ connected: anHas });
        setVoiceIdInput(voiceId);
        setShowExplainer(!elHas && !anHas);
      } catch {
        setLoadError("Couldn't load your saved keys. Tap Retry to try again.");
      }
    })();
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const handleSaveElevenLabsKey = useCallback(() => {
    const trimmed = elevenLabsKeyInput.trim();
    if (!trimmed) return;
    setElevenLabsError(null);
    setElevenLabsSaving(true);
    void (async () => {
      const result = await validateElevenLabsKey(trimmed);
      if (!result.valid) {
        setElevenLabsError(result.error);
        setElevenLabsSaving(false);
        return;
      }
      await saveElevenLabsKey(trimmed);
      setElevenLabsStatus({ connected: true, planName: result.planName });
      setElevenLabsKeyInput('');
      setElevenLabsSaving(false);
    })();
  }, [elevenLabsKeyInput]);

  const handleRemoveElevenLabsKey = useCallback(() => {
    Alert.alert('Remove ElevenLabs key?', 'Voice recording and playback will stop working until you add a key again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearElevenLabsKey();
            setElevenLabsStatus({ connected: false });
            setElevenLabsError(null);
          })();
        },
      },
    ]);
  }, []);

  const handleSaveVoiceId = useCallback(() => {
    setVoiceIdSaving(true);
    void (async () => {
      const trimmed = voiceIdInput.trim();
      if (trimmed) {
        await saveElevenLabsVoiceId(trimmed);
      } else {
        await clearElevenLabsVoiceId();
      }
      const current = await getElevenLabsVoiceId();
      setVoiceIdInput(current);
      setVoiceIdSaving(false);
    })();
  }, [voiceIdInput]);

  const handleSaveAnthropicKey = useCallback(() => {
    const trimmed = anthropicKeyInput.trim();
    if (!trimmed) return;
    setAnthropicError(null);
    setAnthropicSaving(true);
    void (async () => {
      const result = await validateAnthropicKey(trimmed);
      if (!result.valid) {
        setAnthropicError(result.error);
        setAnthropicSaving(false);
        return;
      }
      await saveAnthropicKey(trimmed);
      setAnthropicStatus({ connected: true });
      setAnthropicKeyInput('');
      setAnthropicSaving(false);
    })();
  }, [anthropicKeyInput]);

  const handleRemoveAnthropicKey = useCallback(() => {
    Alert.alert('Remove Anthropic key?', 'Voice commands will stop working until you add a key again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearAnthropicKey();
            setAnthropicStatus({ connected: false });
            setAnthropicError(null);
          })();
        },
      },
    ]);
  }, []);

  const openLink = useCallback((url: string) => {
    void openBrowserAsync(url);
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} automaticallyAdjustKeyboardInsets>
          <Text style={styles.headline}>Settings</Text>

          {loadError !== null && (
            <View style={styles.explainerCard}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable
                onPress={loadStatuses}
                style={({ pressed }) => [styles.secondaryButton, styles.retryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {showExplainer && (
            <View style={styles.explainerCard}>
              <Text style={styles.explainerText}>
                Voice features need two API keys: ElevenLabs for speech, and Anthropic (Claude)
                for understanding what you say. Get a key from each provider below, then paste it
                in to connect.
              </Text>
            </View>
          )}

          <ProviderSection
            title="ElevenLabs"
            subtitle="Speech-to-text and text-to-speech"
            status={elevenLabsStatus}
            keyInput={elevenLabsKeyInput}
            onChangeKeyInput={setElevenLabsKeyInput}
            error={elevenLabsError}
            saving={elevenLabsSaving}
            onSave={handleSaveElevenLabsKey}
            onRemove={handleRemoveElevenLabsKey}
            onOpenLink={() => openLink('https://elevenlabs.io/app/settings/api-keys')}
          />

          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>Voice ID</Text>
            <Text style={styles.fieldHint}>Defaults to ElevenLabs&apos; premade &quot;Rachel&quot; voice.</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Voice ID"
              placeholderTextColor={VoiceColors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={voiceIdInput}
              onChangeText={setVoiceIdInput}
            />
            <View style={styles.buttonRow}>
              <Pressable
                onPress={() => openLink('https://elevenlabs.io/app/voice-library')}
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
                <Text style={styles.linkButtonText}>Browse voice library</Text>
              </Pressable>
              <Pressable
                disabled={voiceIdSaving}
                onPress={handleSaveVoiceId}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                {voiceIdSaving ? (
                  <ActivityIndicator color={VoiceColors.onAccent} />
                ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>

          <ProviderSection
            title="Anthropic (Claude)"
            subtitle="Understands what you ask for"
            status={anthropicStatus}
            keyInput={anthropicKeyInput}
            onChangeKeyInput={setAnthropicKeyInput}
            error={anthropicError}
            saving={anthropicSaving}
            onSave={handleSaveAnthropicKey}
            onRemove={handleRemoveAnthropicKey}
            onOpenLink={() => openLink('https://console.anthropic.com/settings/keys')}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

type ProviderSectionProps = {
  title: string;
  subtitle: string;
  status: ProviderStatus;
  keyInput: string;
  onChangeKeyInput: (value: string) => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onRemove: () => void;
  onOpenLink: () => void;
};

function ProviderSection({
  title,
  subtitle,
  status,
  keyInput,
  onChangeKeyInput,
  error,
  saving,
  onSave,
  onRemove,
  onOpenLink,
}: ProviderSectionProps) {
  const statusLabel = status.connected
    ? status.planName
      ? `Connected — plan: ${status.planName}`
      : 'Connected'
    : 'Not connected';

  return (
    <View style={styles.fieldCard}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.fieldLabel}>{title}</Text>
          <Text style={styles.fieldHint}>{subtitle}</Text>
        </View>
        <Text style={[styles.statusText, status.connected && styles.statusTextConnected]}>{statusLabel}</Text>
      </View>

      <TextInput
        style={styles.textInput}
        placeholder="API key"
        placeholderTextColor={VoiceColors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={keyInput}
        onChangeText={onChangeKeyInput}
      />

      {error !== null && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.buttonRow}>
        <Pressable onPress={onOpenLink} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
          <Text style={styles.linkButtonText}>Get a key</Text>
        </Pressable>
        {status.connected && (
          <Pressable onPress={onRemove} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>Remove key</Text>
          </Pressable>
        )}
        <Pressable
          disabled={saving}
          onPress={onSave}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          {saving ? (
            <ActivityIndicator color={VoiceColors.onAccent} />
          ) : (
            <Text style={styles.primaryButtonText}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
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
  },
  scrollContent: {
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  headline: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
  },
  explainerCard: {
    backgroundColor: VoiceColors.card,
    borderRadius: Spacing.four,
    padding: Spacing.four,
  },
  explainerText: {
    fontSize: 14,
    lineHeight: 20,
    color: VoiceColors.textSecondary,
  },
  fieldCard: {
    backgroundColor: VoiceColors.card,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  fieldLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: VoiceColors.textPrimary,
  },
  fieldHint: {
    fontSize: 13,
    color: VoiceColors.textSecondary,
    marginTop: Spacing.half,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: VoiceColors.textSecondary,
  },
  statusTextConnected: {
    color: VoiceColors.accent,
  },
  textInput: {
    backgroundColor: VoiceColors.background,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
    color: VoiceColors.textPrimary,
  },
  errorText: {
    fontSize: 13,
    color: VoiceColors.danger,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.three,
  },
  linkButton: {
    marginRight: 'auto',
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: VoiceColors.accent,
  },
  primaryButton: {
    backgroundColor: VoiceColors.accent,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: VoiceColors.onAccent,
  },
  secondaryButton: {
    backgroundColor: VoiceColors.background,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: VoiceColors.textPrimary,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.75,
  },
});

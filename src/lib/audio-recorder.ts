import { useCallback, useState } from 'react';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

export type VoiceRecorder = {
  isRecording: boolean;
  start: () => Promise<void>;
  stop: () => Promise<string>;
};

export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);

  const start = useCallback(async () => {
    const permissions = await getRecordingPermissionsAsync();
    if (!permissions.granted) {
      const requested = await requestRecordingPermissionsAsync();
      if (!requested.granted) {
        throw new Error('Microphone permission was denied');
      }
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);
  }, [recorder]);

  const stop = useCallback(async () => {
    await recorder.stop();
    setIsRecording(false);
    if (!recorder.uri) {
      throw new Error('Recording finished without producing a file');
    }
    return recorder.uri;
  }, [recorder]);

  return { isRecording, start, stop };
}

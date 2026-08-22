import { useCallback, useEffect, useRef } from 'react';
import { BuiltInKeywords, PorcupineErrors, PorcupineManager } from '@picovoice/porcupine-react-native';

import { PICOVOICE_ACCESS_KEY } from '@/lib/voice-config';

// Stand-in for a custom Picovoice Console wake word (no .ppn asset is bundled yet).
// Swap for `PorcupineManager.fromKeywordPaths(...)` once a custom keyword is available.
const WAKE_WORD = BuiltInKeywords.JARVIS;

export type WakeWordListener = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export function useWakeWordListener(onWake: () => void): WakeWordListener {
  const managerRef = useRef<PorcupineManager | null>(null);
  const managerPromiseRef = useRef<Promise<PorcupineManager> | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const onWakeRef = useRef(onWake);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    return () => {
      const manager = managerRef.current;
      managerRef.current = null;
      managerPromiseRef.current = null;
      void (async () => {
        try {
          await manager?.stop();
        } catch (err) {
          if (!(err instanceof PorcupineErrors.PorcupineInvalidStateError)) throw err;
        } finally {
          manager?.delete();
        }
      })();
    };
  }, []);

  const getManager = useCallback(async (): Promise<PorcupineManager> => {
    if (managerRef.current) return managerRef.current;
    if (!managerPromiseRef.current) {
      managerPromiseRef.current = PorcupineManager.fromBuiltInKeywords(
        PICOVOICE_ACCESS_KEY,
        [WAKE_WORD],
        () => onWakeRef.current()
      );
    }
    const manager = await managerPromiseRef.current;
    managerRef.current = manager;
    return manager;
  }, []);

  const start = useCallback(async () => {
    if (startPromiseRef.current) return startPromiseRef.current;
    const promise = (async () => {
      const manager = await getManager();
      await manager.start();
    })().finally(() => {
      startPromiseRef.current = null;
    });
    startPromiseRef.current = promise;
    return promise;
  }, [getManager]);

  const stop = useCallback(async () => {
    if (!managerRef.current) return;
    try {
      await managerRef.current.stop();
    } catch (err) {
      if (!(err instanceof PorcupineErrors.PorcupineInvalidStateError)) throw err;
    }
  }, []);

  return { start, stop };
}

import { useCallback, useEffect, useState } from 'react';

import { CalendarApiError, listUpcomingEvents } from '@/lib/google-calendar-api';
import {
  configureGoogleAuth,
  getAccessToken,
  signInInteractively,
  signInSilently,
  signOutLocally,
} from '@/lib/google-calendar-auth';

export type GoogleCalendarSessionState = 'loading' | 'signedOut' | 'signedIn';

export type GoogleCalendarSession = {
  state: GoogleCalendarSessionState;
  accessToken: string | null;
  error: string | null;
  isConnecting: boolean;
  handleConnect: () => Promise<void>;
  forceSignOut: () => Promise<void>;
};

// TEMP DEBUG: forces the signed-in UI for local simulator testing without real Google OAuth.
// Remove before committing.
const DEBUG_FORCE_SIGNED_IN = false;

export function useGoogleCalendarSession(): GoogleCalendarSession {
  const [state, setState] = useState<GoogleCalendarSessionState>('loading');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const verifyAndSetSignedIn = useCallback(async (token: string) => {
    try {
      await listUpcomingEvents(token);
      setAccessToken(token);
      setError(null);
      setState('signedIn');
    } catch (err) {
      if (err instanceof CalendarApiError && err.status === 401) {
        await signOutLocally();
        setAccessToken(null);
        setState('signedOut');
        return;
      }
      setAccessToken(token);
      setError("Couldn't verify your calendar connection");
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
      const token = await getAccessToken();
      if (!token) {
        setState('signedOut');
        return;
      }
      await verifyAndSetSignedIn(token);
    })();
  }, [verifyAndSetSignedIn]);

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
      await verifyAndSetSignedIn(result.accessToken);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, verifyAndSetSignedIn]);

  const forceSignOut = useCallback(async () => {
    await signOutLocally();
    setAccessToken(null);
    setState('signedOut');
  }, []);

  if (DEBUG_FORCE_SIGNED_IN) {
    return {
      state: 'signedIn',
      accessToken: 'debug-fake-token',
      error: null,
      isConnecting: false,
      handleConnect: async () => {},
      forceSignOut: async () => {},
    };
  }

  return { state, accessToken, error, isConnecting, handleConnect, forceSignOut };
}

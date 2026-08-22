import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

const IOS_CLIENT_ID = '110934841502-93gettlb1arl7vmh2q1bm93s7mj78qar.apps.googleusercontent.com';
const WEB_CLIENT_ID = '110934841502-opnk31o4venldkts27cbtb5gpf331tdm.apps.googleusercontent.com';

let configured = false;

export function configureGoogleAuth(): void {
  if (configured) return;
  GoogleSignin.configure({
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });
  configured = true;
}

configureGoogleAuth();

export async function signInSilently(): Promise<boolean> {
  try {
    const response = await GoogleSignin.signInSilently();
    return response.type === 'success';
  } catch {
    return false;
  }
}

export async function signInInteractively(): Promise<{ accessToken: string } | { error: string }> {
  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return { error: 'Calendar access is required' };
    }
    const { accessToken } = await GoogleSignin.getTokens();
    return { accessToken };
  } catch {
    return { error: 'Calendar access is required' };
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch {
    return null;
  }
}

export async function signOutLocally(): Promise<void> {
  await GoogleSignin.signOut();
}

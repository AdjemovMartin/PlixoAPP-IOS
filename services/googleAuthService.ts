import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

export interface GoogleAuthResult {
  success: boolean;
  idToken?: string;
  error?: string;
  cancelled?: boolean;
}

export interface EdgeFunctionResponse {
  access_token: string;
  refresh_token: string;
  user?: any;
}

const EDGE_FUNCTION_URL = 'https://lxhpheflaucphoxnljws.supabase.co/functions/v1/google-auth-mobile';
const EDGE_FUNCTION_TIMEOUT = 10000;

let googleAuthRequest: Google.GoogleAuthRequestConfig | null = null;
let promptAsyncFn: (() => Promise<any>) | null = null;

export function configureGoogleSignIn(): void {
  console.log('[Google Auth] Configuration called - expo-auth-session will be used');
  const redirectUri = makeRedirectUri({ scheme: 'plixo' });
  console.log('[Google Auth] Redirect URI:', redirectUri);
}

export function setAuthRequest(request: Google.GoogleAuthRequestConfig, promptFn: () => Promise<any>): void {
  console.log('[Google Auth] Setting auth request and prompt function');
  googleAuthRequest = request;
  promptAsyncFn = promptFn;
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  console.log('[Google Auth] signInWithGoogle called');

  if (!promptAsyncFn) {
    console.error('[Google Auth] ERROR: promptAsync function not available');
    return {
      success: false,
      error: 'Authentication not initialized. Please restart the app.',
    };
  }

  try {
    console.log('[Google Auth] Calling promptAsync to open Google account picker...');
    const result = await promptAsyncFn();

    console.log('[Google Auth] promptAsync result:', JSON.stringify({
      type: result.type,
      hasParams: !!result.params,
      hasAuthentication: !!result.authentication,
    }));

    if (result.type === 'cancel') {
      console.log('[Google Auth] User cancelled the sign-in');
      return {
        success: false,
        cancelled: true,
      };
    }

    if (result.type === 'error') {
      console.error('[Google Auth] Authentication error:', result.error);
      return {
        success: false,
        error: result.error?.message || 'Authentication failed',
      };
    }

    if (result.type !== 'success') {
      console.error('[Google Auth] Unexpected result type:', result.type);
      return {
        success: false,
        error: `Unexpected result: ${result.type}`,
      };
    }

    const idToken = result.authentication?.idToken || result.params?.id_token;

    console.log('[Google Auth] ID Token received:', idToken ? 'YES' : 'NO');

    if (!idToken) {
      console.error('[Google Auth] No ID token in result');
      return {
        success: false,
        error: 'No ID token received from Google',
      };
    }

    console.log('[Google Auth] Successfully got ID token');
    return {
      success: true,
      idToken: idToken,
    };
  } catch (error: any) {
    console.error('[Google Auth] Exception during sign-in:', error);
    console.error('[Google Auth] Error details:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    return {
      success: false,
      error: error.message || 'Failed to sign in with Google',
    };
  }
}

export async function exchangeGoogleToken(idToken: string): Promise<{ success: boolean; data?: EdgeFunctionResponse; error?: string }> {
  console.log('[Google Auth] Exchanging Google token with Edge Function');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT);

    console.log('[Google Auth] Making request to:', EDGE_FUNCTION_URL);
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log('[Google Auth] Edge Function response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Google Auth] Edge Function error:', errorData);
      return {
        success: false,
        error: errorData.error || `Server error: ${response.status}`,
      };
    }

    const data: EdgeFunctionResponse = await response.json();
    console.log('[Google Auth] Edge Function success, has tokens:', {
      hasAccessToken: !!data.access_token,
      hasRefreshToken: !!data.refresh_token,
    });

    if (!data.access_token || !data.refresh_token) {
      console.error('[Google Auth] Invalid response from server - missing tokens');
      return {
        success: false,
        error: 'Invalid response from server',
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    console.error('[Google Auth] Error exchanging Google token:', error);

    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out. Please try again.',
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to authenticate with server',
    };
  }
}

export async function signOutGoogle(): Promise<void> {
  console.log('[Google Auth] Sign out called');
  try {
    promptAsyncFn = null;
    googleAuthRequest = null;
    console.log('[Google Auth] Sign out successful');
  } catch (error) {
    console.error('[Google Auth] Error signing out:', error);
  }
}

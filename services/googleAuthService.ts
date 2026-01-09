import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

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

export function configureGoogleSignIn(): void {
  try {
    const iosClientId = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
    const androidClientId = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
    const webClientId = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

    GoogleSignin.configure({
      iosClientId: Platform.OS === 'ios' ? iosClientId : undefined,
      webClientId: Platform.OS === 'android' ? webClientId : undefined,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });

    console.log('Google Sign-In configured successfully');
  } catch (error) {
    console.error('Error configuring Google Sign-In:', error);
  }
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  try {
    await GoogleSignin.hasPlayServices();

    const userInfo = await GoogleSignin.signIn();

    const idToken = (userInfo as any).data?.idToken || (userInfo as any).idToken;

    if (!idToken) {
      return {
        success: false,
        error: 'No ID token received from Google',
      };
    }

    return {
      success: true,
      idToken: idToken,
    };
  } catch (error: any) {
    console.error('Google Sign-In error:', error);

    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      return {
        success: false,
        cancelled: true,
      };
    }

    if (error.code === statusCodes.IN_PROGRESS) {
      return {
        success: false,
        error: 'Sign-in already in progress',
      };
    }

    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return {
        success: false,
        error: 'Google Play Services not available',
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to sign in with Google',
    };
  }
}

export async function exchangeGoogleToken(idToken: string): Promise<{ success: boolean; data?: EdgeFunctionResponse; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT);

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `Server error: ${response.status}`,
      };
    }

    const data: EdgeFunctionResponse = await response.json();

    if (!data.access_token || !data.refresh_token) {
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
    console.error('Error exchanging Google token:', error);

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
  try {
    await GoogleSignin.signOut();
  } catch (error) {
    console.error('Error signing out from Google:', error);
  }
}

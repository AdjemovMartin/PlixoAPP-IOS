import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
}

export async function setSupabaseSession(accessToken: string, refreshToken: string): Promise<{ success: boolean; error?: string; session?: Session }> {
  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error('Error setting Supabase session:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    if (!data.session) {
      return {
        success: false,
        error: 'No session returned from Supabase',
      };
    }

    return {
      success: true,
      session: data.session,
    };
  } catch (error: any) {
    console.error('Error in setSupabaseSession:', error);
    return {
      success: false,
      error: error.message || 'Failed to set session',
    };
  }
}

export async function getSupabaseSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Error getting Supabase session:', error);
      return null;
    }

    return data.session;
  } catch (error) {
    console.error('Error in getSupabaseSession:', error);
    return null;
  }
}

export async function clearSupabaseSession(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Error clearing Supabase session:', error);
  }
}

export function onAuthStateChange(callback: (session: Session | null, user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session, session?.user || null);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error('Error getting current user:', error);
      return null;
    }

    return data.user;
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return null;
  }
}

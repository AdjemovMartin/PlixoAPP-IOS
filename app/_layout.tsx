import { useEffect, useState, useCallback, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useNotifications } from '@/hooks/useNotifications';
import { useDeepLinking } from '@/hooks/useDeepLinking';
import { type NotificationData } from '@/services/notificationService';
import { getNavigationPathFromNotification } from '@/services/navigationHelper';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  useFrameworkReady();
  const router = useRouter();
  const [initialUrl, setInitialUrl] = useState<string | undefined>();
  const pendingNavigationPath = useRef<string | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const handleNotificationPress = useCallback((data: NotificationData) => {
    const navigationPath = getNavigationPathFromNotification(data);
    pendingNavigationPath.current = navigationPath;

    if (appState.current === 'active') {
      router.replace({
        pathname: '/',
        params: { navigationPath },
      });
      pendingNavigationPath.current = null;
    }
  }, [router]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (pendingNavigationPath.current) {
          router.replace({
            pathname: '/',
            params: { navigationPath: pendingNavigationPath.current },
          });
          pendingNavigationPath.current = null;
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  const handleDeepLink = useCallback((url: string) => {
    setInitialUrl(url);
    router.replace({
      pathname: '/',
      params: { initialUrl: url },
    });
  }, [router]);

  if (Platform.OS !== 'web') {
    useNotifications(handleNotificationPress);
    useDeepLinking(handleDeepLink);
  }

  useEffect(() => {
    async function prepare() {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" initialParams={{ initialUrl }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

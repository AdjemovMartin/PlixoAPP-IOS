// app/index.tsx
import {
  clearBadge,
  getDeviceToken,
  initializePushNotifications,
  onTokenChange,
} from '@/services/notificationService';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { WebView } from 'react-native-webview';
import { configureGoogleSignIn, signInWithGoogle, exchangeGoogleToken, signOutGoogle } from '@/services/googleAuthService';
import { setSupabaseSession, clearSupabaseSession, getSupabaseSession, onAuthStateChange } from '@/services/supabaseAuthService';
import type { Session, User } from '@supabase/supabase-js';

interface HomeScreenProps {
  initialUrl?: string;
  navigationPath?: string;
}

const START_URL = 'https://plixo.bg/';
const HEARTBEAT_INTERVAL = 15000; // 15s
const HEARTBEAT_TIMEOUT = 45000;  // 45s
const PULL_TRIGGER = 80;          // px to trigger refresh

export default function HomeScreen({ initialUrl, navigationPath }: HomeScreenProps) {
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState(initialUrl || START_URL);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isOnWalletPage, setIsOnWalletPage] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Check Supabase configuration
  const isSupabaseConfigured = !!(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showGoogleButton, setShowGoogleButton] = useState(false);

  // pull-to-refresh UI
  const pullAnim = useRef(new Animated.Value(0)).current;
  const [refreshing, setRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const refreshTriggered = useRef(false);

  const webViewRef = useRef<WebView>(null);
  const pendingMessages = useRef<string[]>([]);

  // Track actual scrollY from WebView
  const scrollYRef = useRef(0);
  const prevScrollYRef = useRef(0);

  // Track pull gesture origin
  const wasAtTopWhenPullStarted = useRef(false);
  const arrivedAtTopTimestamp = useRef<number | null>(null);
  const justArrivedAtTop = useRef(false);

  // Resume tracking
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastBgAt = useRef<number | null>(null);

  // Heartbeat tracking
  const lastHbAt = useRef<number>(Date.now());

  const sendMessageToWebView = useCallback(
    (message: string) => {
      if (isWebViewReady && webViewRef.current) {
        try {
          webViewRef.current.postMessage(message);
        } catch {
          pendingMessages.current.push(message);
        }
      } else {
        pendingMessages.current.push(message);
      }
    },
    [isWebViewReady]
  );

  const flushPendingMessages = useCallback(() => {
    if (pendingMessages.current.length > 0 && webViewRef.current) {
      pendingMessages.current.forEach((message) => {
        try {
          webViewRef.current?.postMessage(message);
        } catch {}
      });
      pendingMessages.current = [];
    }
  }, []);

  const sendDeviceIdToWebView = useCallback(
    (deviceId: string | null, platform: string) => {
      const message = JSON.stringify({ type: 'device_id', deviceId, platform });
      sendMessageToWebView(message);
    },
    [sendMessageToWebView]
  );

  const sendNavigationToWebView = useCallback(
    (path: string) => {
      const message = JSON.stringify({ type: 'navigate', path });
      sendMessageToWebView(message);
    },
    [sendMessageToWebView]
  );

  const injectSessionToWebView = useCallback((sessionData: Session) => {
    try {
      const url = new URL(currentUrl);

      if (url.hostname !== 'plixo.bg' && url.hostname !== 'www.plixo.bg') {
        console.log('Skipping session injection for non-plixo.bg domain:', url.hostname);
        return;
      }

      const message = JSON.stringify({
        type: 'SUPABASE_SESSION',
        payload: {
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
          user: sessionData.user,
        },
      });

      sendMessageToWebView(message);
      console.log('Session injected into WebView');
    } catch (error) {
      console.error('Error injecting session to WebView:', error);
    }
  }, [currentUrl, sendMessageToWebView]);

  const handleGoogleSignIn = useCallback(async () => {
    if (authLoading) return;

    setAuthLoading(true);

    try {
      const googleResult = await signInWithGoogle();

      if (!googleResult.success) {
        if (googleResult.cancelled) {
          setAuthLoading(false);
          return;
        }

        Alert.alert('Sign In Failed', googleResult.error || 'Failed to sign in with Google');
        setAuthLoading(false);
        return;
      }

      if (!googleResult.idToken) {
        Alert.alert('Sign In Failed', 'No ID token received from Google');
        setAuthLoading(false);
        return;
      }

      const exchangeResult = await exchangeGoogleToken(googleResult.idToken);

      if (!exchangeResult.success || !exchangeResult.data) {
        Alert.alert('Authentication Failed', exchangeResult.error || 'Failed to authenticate with server');
        setAuthLoading(false);
        return;
      }

      const sessionResult = await setSupabaseSession(
        exchangeResult.data.access_token,
        exchangeResult.data.refresh_token
      );

      if (!sessionResult.success || !sessionResult.session) {
        Alert.alert('Session Failed', sessionResult.error || 'Failed to create session');
        setAuthLoading(false);
        return;
      }

      setSession(sessionResult.session);
      setUser(sessionResult.session.user);
      setIsAuthenticated(true);
      setShowGoogleButton(false);

      injectSessionToWebView(sessionResult.session);

      setAuthLoading(false);
    } catch (error: any) {
      console.error('Unexpected error during Google Sign-In:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      setAuthLoading(false);
    }
  }, [authLoading, injectSessionToWebView]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutGoogle();
      await clearSupabaseSession();
      setSession(null);
      setUser(null);
      setIsAuthenticated(false);
      setShowGoogleButton(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  // Log Supabase configuration status in development
  useEffect(() => {
    if (__DEV__ && !isSupabaseConfigured) {
      console.warn(
        'Supabase is not configured. Authentication features will be disabled.\n' +
        'To enable authentication, add the following to your .env file:\n' +
        '- EXPO_PUBLIC_SUPABASE_URL\n' +
        '- EXPO_PUBLIC_SUPABASE_ANON_KEY'
      );
    }
  }, [isSupabaseConfigured]);

  // Initialize Google Sign-In on mount
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  // Check for existing Supabase session on mount
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    (async () => {
      const existingSession = await getSupabaseSession();
      if (existingSession) {
        setSession(existingSession);
        setUser(existingSession.user);
        setIsAuthenticated(true);
        injectSessionToWebView(existingSession);
      }
    })();
  }, [injectSessionToWebView, isSupabaseConfigured]);

  // Listen for auth state changes
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const unsubscribe = onAuthStateChange((newSession, newUser) => {
      setSession(newSession);
      setUser(newUser);
      setIsAuthenticated(!!newSession);

      if (newSession) {
        injectSessionToWebView(newSession);
      }
    });

    return unsubscribe;
  }, [injectSessionToWebView, isSupabaseConfigured]);

  // Monitor URL to show/hide Google button on login/signup pages
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setShowGoogleButton(false);
      return;
    }

    try {
      const url = new URL(currentUrl);
      const isAuthPage = url.pathname.includes('/login') ||
                         url.pathname.includes('/signup') ||
                         url.pathname.includes('/auth');

      setShowGoogleButton(isAuthPage && !isAuthenticated);
    } catch {
      setShowGoogleButton(false);
    }
  }, [currentUrl, isAuthenticated, isSupabaseConfigured]);

  // SAFE notifications effect
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        await initializePushNotifications();
        const maybeUnsub = onTokenChange((tokenData) => {
          sendDeviceIdToWebView(tokenData.deviceId, tokenData.platform);
        });
        if (typeof maybeUnsub === 'function') unsub = maybeUnsub;
      } catch {}
    })();

    return () => {
      try { unsub?.(); } catch {}
    };
  }, [sendDeviceIdToWebView]);

  useEffect(() => {
    if (navigationPath) sendNavigationToWebView(navigationPath);
  }, [navigationPath, sendNavigationToWebView]);

  const onRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setHasError(false);
    webViewRef.current?.reload();
  }, [refreshing]);

  // end the refresh spinner shortly after load ends
  const endRefreshSoon = useCallback(() => {
    if (refreshing) {
      setTimeout(() => setRefreshing(false), 300);
    }
  }, [refreshing]);

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'request_device_id') {
          const tokenData = getDeviceToken();
          sendDeviceIdToWebView(tokenData.deviceId, tokenData.platform);
        }

        if (data.type === 'badge' && data.action === 'clear') clearBadge();

        if (data.type === 'google_auth_requested') {
          handleGoogleSignIn();
        }

        if (data.type === 'navigation') {
          setCurrentUrl(data.url);
          try {
            const url = new URL(data.url);
            setIsOnWalletPage(url.pathname.includes('/wallet'));
          } catch {}
        }

       if (data.type === 'scroll') {
  const newScrollY = data.scrollY || 0;
  const prevScrollY = prevScrollYRef.current;

  scrollYRef.current = newScrollY;
  setIsAtTop(data.isAtTop);

  if (prevScrollY > 0 && newScrollY === 0) {
    // just arrived at top
    justArrivedAtTop.current = true;
    arrivedAtTopTimestamp.current = Date.now();
    setTimeout(() => { justArrivedAtTop.current = false; }, 150);
  } else if (newScrollY === 0 && prevScrollY === 0) {
    if (arrivedAtTopTimestamp.current === null) {
      arrivedAtTopTimestamp.current = Date.now();
    }
  } else if (newScrollY > 0) {
    arrivedAtTopTimestamp.current = null;
    justArrivedAtTop.current = false;
  }

  prevScrollYRef.current = newScrollY;
}


// Handle overscroll pull-to-refresh from WebView
if (data.type === 'overscroll' && Platform.OS === 'ios') {
  const { phase, dy } = data;

  const forceNotAtTop =
    scrollYRef.current > 2 ||  // must be truly at top
    !isAtTop;

  if (phase === 'start') {
    const isStableTop =
      !forceNotAtTop &&
      arrivedAtTopTimestamp.current !== null &&
      Date.now() - arrivedAtTopTimestamp.current >= 120;

    wasAtTopWhenPullStarted.current = isStableTop;

    if (isStableTop) {
      setIsPulling(true);
      refreshTriggered.current = false;
    }
  }

  else if (phase === 'move') {
    if (forceNotAtTop) {
      wasAtTopWhenPullStarted.current = false;
      setIsPulling(false);
      pullAnim.setValue(0);
      return;
    }

    if (!wasAtTopWhenPullStarted.current) return;
    if (dy <= 0) return;
    if (justArrivedAtTop.current) return;

 // Handle overscroll pull-to-refresh from WebView
if (data.type === 'overscroll' && Platform.OS === 'ios') {
  const { phase, dy } = data;

  const forceNotAtTop =
    scrollYRef.current > 1 ||
    !isAtTop;

  if (phase === 'start') {
    wasAtTopWhenPullStarted.current = !forceNotAtTop;

    if (!forceNotAtTop) {
      setIsPulling(true);
      refreshTriggered.current = false;
    }
  }

  else if (phase === 'move') {
    if (!wasAtTopWhenPullStarted.current) return;
    if (forceNotAtTop) return;
    if (dy <= 0) return;

    // 🚀 Instant pull-to-refresh allowed!
    const dampened = Math.min(dy * 0.6, PULL_TRIGGER * 1.5);
    pullAnim.setValue(dampened);

    if (dampened >= PULL_TRIGGER && !refreshTriggered.current) {
      refreshTriggered.current = true;
      onRefresh();
      Animated.spring(pullAnim, {
        toValue: 60,
        tension: 100,
        friction: 12,
        useNativeDriver: false,
      }).start();
    }
  }

  else if (phase === 'end') {
    if (!wasAtTopWhenPullStarted.current) return;

    setIsPulling(false);

    if (!refreshTriggered.current) {
      Animated.spring(pullAnim, {
        toValue: 0,
        tension: 100,
        friction: 12,
        useNativeDriver: false,
      }).start();
    }

    wasAtTopWhenPullStarted.current = false;
  }
}


    if (!refreshing) {
      const dampened = Math.min(dy * 0.6, PULL_TRIGGER * 1.5);
      pullAnim.setValue(dampened);

      if (dampened >= PULL_TRIGGER && !refreshTriggered.current) {
        refreshTriggered.current = true;
        onRefresh();
        Animated.spring(pullAnim, {
          toValue: 60,
          tension: 100,
          friction: 12,
          useNativeDriver: false,
        }).start();
      }
    }
  }

  else if (phase === 'end') {
    if (!wasAtTopWhenPullStarted.current) return;
    setIsPulling(false);

    if (!refreshTriggered.current) {
      Animated.spring(pullAnim, {
        toValue: 0,
        tension: 100,
        friction: 12,
        useNativeDriver: false,
      }).start();
    }
    wasAtTopWhenPullStarted.current = false;
  }
}

      } catch {}
    },
    [sendDeviceIdToWebView, isAtTop, refreshing, pullAnim, onRefresh, handleGoogleSignIn]
  );


  // Inject scroll + navigation + HEARTBEAT + OVERSCROLL detection
const injectedJavaScript = `
  (function() {
    // Listen for Supabase session from native app
    if (!window.__plixoSessionListener) {
      window.__plixoSessionListener = true;

      document.addEventListener('message', function(e) {
        try {
          var data = JSON.parse(e.data);
          if (data.type === 'SUPABASE_SESSION' && data.payload) {
            console.log('Received Supabase session from native app');
            localStorage.setItem('supabase.auth.token', JSON.stringify(data.payload));

            if (window.location.pathname.includes('/login') || window.location.pathname.includes('/signup')) {
              window.location.href = '/';
            }
          }
        } catch (err) {
          console.error('Error handling native message:', err);
        }
      });

      window.addEventListener('message', function(e) {
        try {
          var data = JSON.parse(e.data);
          if (data.type === 'SUPABASE_SESSION' && data.payload) {
            console.log('Received Supabase session from native app');
            localStorage.setItem('supabase.auth.token', JSON.stringify(data.payload));

            if (window.location.pathname.includes('/login') || window.location.pathname.includes('/signup')) {
              window.location.href = '/';
            }
          }
        } catch (err) {
          console.error('Error handling native message:', err);
        }
      });
    }

    // Navigation tracking
    window.addEventListener('popstate', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'navigation',
        url: window.location.href
      }));
    });

    // Scroll tracking
    function checkScroll() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'scroll',
        scrollY: y,
        isAtTop: y <= 1
      }));
    }
    window.addEventListener('scroll', checkScroll, { passive: true });
    setInterval(checkScroll, 120);
    checkScroll();

    // Heartbeat
    if (!window.__plixoHb) {
      window.__plixoHb = setInterval(function() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'hb',
            t: Date.now()
          }));
        } catch (e) {}
      }, ${HEARTBEAT_INTERVAL});
    }

    // Overscroll pull-to-refresh (iOS-style)
    if (!window.__plixoOverscroll) {
      window.__plixoOverscroll = true;

      var startY = 0;
      var lastY = 0;
      var isDragging = false;
      var rafId = null;
      var TOP_EDGE_ZONE = 80; // px from top where pull can start

      function getScrollTop() {
        return window.scrollY || document.documentElement.scrollTop || 0;
      }

      function sendOverscroll(phase, dy) {
        if (rafId) return;
        rafId = requestAnimationFrame(function() {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'overscroll',
              phase: phase,
              dy: dy
            }));
          } catch (e) {}
          rafId = null;
        });
      }

      document.addEventListener('touchstart', function(e) {
        var scrollTop = getScrollTop();
        var touchY = e.touches[0].clientY;

        // ✅ Only start pull-to-refresh if:
        // - page is at top
        // - gesture starts near the top edge of the screen
        if (scrollTop <= 1 && touchY <= TOP_EDGE_ZONE) {
          isDragging = true;
          startY = touchY;
          lastY = startY;
          sendOverscroll('start', 0);
        } else {
          isDragging = false;
        }
      }, { passive: true });

      document.addEventListener('touchmove', function(e) {
        if (!isDragging) return;

        var scrollTop = getScrollTop();
        if (scrollTop > 1) {
          // If page scrolls down, cancel pull-to-refresh
          isDragging = false;
          sendOverscroll('end', 0);
          return;
        }

        var curY = e.touches[0].clientY;
        var dy = curY - startY;
        lastY = curY;

        if (dy > 0) {
          // Only downward pull counts
          sendOverscroll('move', dy);
        } else {
          // Upward move cancels the pull
          isDragging = false;
          sendOverscroll('end', 0);
        }
      }, { passive: true });

      document.addEventListener('touchend', function() {
        if (isDragging) {
          sendOverscroll('end', lastY - startY);
        }
        isDragging = false;
      }, { passive: true });

      document.addEventListener('touchcancel', function() {
        if (isDragging) {
          sendOverscroll('end', 0);
        }
        isDragging = false;
      }, { passive: true });
    }
  })();
  true;
`;



  const handleShouldStartLoadWithRequest = useCallback((request: any) => {
    const url = request.url;
    const isPlixoUrl = url.includes('plixo.bg');
    const isAboutBlank = url.startsWith('about:blank');
    const isDataUrl = url.startsWith('data:');
    if (isPlixoUrl || isAboutBlank || isDataUrl) return true;
    Linking.openURL(url);
    return false;
  }, []);

  const handleWebViewLoad = useCallback(() => {
    setIsWebViewReady(true);
    setLoading(false);
    setHasError(false);
    flushPendingMessages();
    endRefreshSoon();
  }, [flushPendingMessages, endRefreshSoon]);

  const handleOpenWalletInBrowser = useCallback(async () => {
    try {
      await WebBrowser.openBrowserAsync('https://plixo.bg/wallet');
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const url = new URL(currentUrl);
      setIsOnWalletPage(url.pathname.includes('/wallet'));
    } catch {
      setIsOnWalletPage(false);
    }
  }, [currentUrl]);

  const handleWebViewLoadStart = useCallback(() => {
    setLoading(true);
    setHasError(false);
  }, []);

  const handleWebViewLoadEnd = useCallback(() => {
    setLoading(false);
    endRefreshSoon();
  }, [endRefreshSoon]);

// Track when app goes to background — NO auto reloads
useEffect(() => {
  const sub = AppState.addEventListener('change', (next) => {
    if (next.match(/inactive|background/)) {
      lastBgAt.current = Date.now();
    }
    appState.current = next;
  });

  return () => sub.remove();
}, []);

// Heartbeat tracking — NO reload on silence
useEffect(() => {
  const id = setInterval(() => {
    if (appState.current === 'active') {
      const silentFor = Date.now() - lastHbAt.current;

      // Only log — DO NOT reload!
      if (silentFor > HEARTBEAT_TIMEOUT) {
        console.log('⚠️ Heartbeat silent for too long:', silentFor, 'ms');
      }
    }
  }, 5000);

  return () => clearInterval(id);
}, []);


  // Cleanup animation when refreshing completes
  useEffect(() => {
    if (!refreshing) {
      Animated.spring(pullAnim, {
        toValue: 0,
        tension: 100,
        friction: 10,
        useNativeDriver: false,
      }).start();
    }
  }, [refreshing, pullAnim]);

  return (
    <SafeAreaView style={styles.container}>
      {showGoogleButton && (
        <View style={styles.googleButtonContainer}>
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            activeOpacity={0.8}
            disabled={authLoading}
            style={styles.googleButtonWrapper}
          >
            <View style={styles.googleButton}>
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              {authLoading ? (
                <ActivityIndicator color="#1F1F1F" style={styles.googleButtonLoader} />
              ) : (
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      )}

      {isOnWalletPage && (
        <View style={styles.walletButtonContainer}>
          <TouchableOpacity onPress={handleOpenWalletInBrowser} activeOpacity={0.8}>
            <LinearGradient
              colors={['#007AFF', '#0051D5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.walletButton}
            >
              <ExternalLink size={20} color="#fff" style={styles.walletButtonIcon} />
              <Text style={styles.walletButtonText}>Open Wallet in Browser</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.webviewWrapper}>
        {/* Pull-to-refresh spinner (pushes content down) */}
        <Animated.View
          style={[
            styles.pullIndicator,
            {
              height: pullAnim.interpolate({
                inputRange: [0, PULL_TRIGGER * 1.5],
                outputRange: [0, 60],
                extrapolate: 'clamp',
              }),
              opacity: pullAnim.interpolate({
                inputRange: [0, 20, PULL_TRIGGER],
                outputRange: [0, 0.6, 1],
                extrapolate: 'clamp',
              }),
            }
          ]}
        >
          <Animated.View
            style={{
              transform: [{
                scale: pullAnim.interpolate({
                  inputRange: [0, PULL_TRIGGER],
                  outputRange: [0.8, 1],
                  extrapolate: 'clamp',
                })
              }]
            }}
          >
            <ActivityIndicator color="#007AFF" />
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={[
            styles.webviewContainer,
            {
              transform: [{
                translateY: pullAnim.interpolate({
                  inputRange: [0, PULL_TRIGGER * 1.5],
                  outputRange: [0, 0],
                  extrapolate: 'clamp',
                })
              }]
            }
          ]}
        >
          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            style={styles.webview}
            userAgent="webviewMobile"
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            onMessage={handleMessage}
            injectedJavaScript={injectedJavaScript}
            onNavigationStateChange={(navState) => setCurrentUrl(navState.url)}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onLoad={handleWebViewLoad}
            onLoadStart={handleWebViewLoadStart}
            onLoadEnd={handleWebViewLoadEnd}
            onError={() => { setHasError(true); setLoading(false); }}
            onHttpError={() => { setHasError(true); setLoading(false); }}
            onContentProcessDidTerminate={() => { setHasError(false); webViewRef.current?.reload(); }}
            scrollEnabled
            bounces
          />

          {(loading || hasError) && (
            <View style={styles.loadingOverlay}>
              {hasError ? (
                <>
                  <Text style={{ marginBottom: 10 }}>Something went wrong.</Text>
                  <TouchableOpacity
                    onPress={() => { setHasError(false); webViewRef.current?.reload(); }}
                    style={{ backgroundColor: '#111827', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
                  >
                    <Text style={{ color: '#fff' }}>Reload</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <ActivityIndicator size="large" />
              )}
            </View>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webviewWrapper: { flex: 1, position: 'relative' },
  webviewContainer: { flex: 1, position: 'relative' },
  webview: { flex: 1 },
  pullIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  googleButtonWrapper: {
    width: '100%',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dadce0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleButtonText: {
    color: '#1F1F1F',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  googleButtonLoader: {
    marginLeft: 12,
  },
  walletButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  walletButtonIcon: { marginRight: 8 },
  walletButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
});

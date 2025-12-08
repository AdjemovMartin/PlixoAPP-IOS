import React, { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface RefreshableWebViewIOSProps {
  children: ReactNode;
  isAtTop: boolean;
  isReloading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

const PULL_THRESHOLD = 80; // Minimum pull distance to trigger refresh
const MAX_PULL = 120; // Maximum pull distance (clamped)
const LOADING_POSITION = 60; // Position where spinner stays during refresh

export default function RefreshableWebViewIOS({
  children,
  isAtTop,
  isReloading,
  onRefresh,
  refreshing,
}: RefreshableWebViewIOSProps) {
  const translateY = useSharedValue(0);
  const isRefreshing = useSharedValue(false);

  // Animate back to hidden position when refresh completes
  React.useEffect(() => {
    if (!refreshing && isRefreshing.value) {
      isRefreshing.value = false;
      translateY.value = withSpring(-80, {
        damping: 15,
        stiffness: 150,
      });
    }
  }, [refreshing]);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      // Only allow gesture if at top and not currently reloading
      if (!isAtTop || isReloading) {
        // Fail the gesture so it doesn't interfere with WebView scrolling
        return;
      }
    })
    .onUpdate((event) => {
      // Only respond to downward pulls
      if (event.translationY > 0 && isAtTop && !isReloading) {
        // Clamp the pull to MAX_PULL with rubber band effect
        const progress = Math.min(event.translationY, MAX_PULL);
        translateY.value = progress;
      }
    })
    .onEnd((event) => {
      if (event.translationY >= PULL_THRESHOLD && isAtTop && !isReloading) {
        // Pulled past threshold - trigger refresh
        isRefreshing.value = true;
        translateY.value = withSpring(LOADING_POSITION, {
          damping: 15,
          stiffness: 150,
        });
        runOnJS(onRefresh)();
      } else {
        // Not pulled far enough - animate back to hidden
        translateY.value = withSpring(0, {
          damping: 15,
          stiffness: 150,
        });
      }
    })
    .enabled(isAtTop && !isReloading);

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    const opacity = Math.min(translateY.value / PULL_THRESHOLD, 1);
    return {
      transform: [{ translateY: translateY.value - 80 }],
      opacity: isRefreshing.value ? 1 : opacity,
    };
  });

  return (
    <View style={styles.container}>
      {/* Pull indicator */}
      <Animated.View style={[styles.pullIndicator, animatedIndicatorStyle]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </Animated.View>

      {/* WebView wrapped in gesture detector */}
      <GestureDetector gesture={panGesture}>
        <View style={styles.webviewWrapper}>{children}</View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  pullIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  webviewWrapper: {
    flex: 1,
  },
});

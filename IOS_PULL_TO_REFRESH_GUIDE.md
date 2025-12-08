# iOS Pull-to-Refresh Implementation Guide

## Overview

This implementation provides a custom gesture-based pull-to-refresh solution for iOS that works around WebView's scroll gesture consumption issue. The standard `pullToRefreshEnabled` prop doesn't work in Expo Go because the WebView consumes scroll gestures before React Native can intercept them.

## Architecture

### Components

1. **RefreshableWebViewIOS** (`components/RefreshableWebViewIOS.tsx`)
   - Custom wrapper component that handles pull-to-refresh gestures
   - Uses `react-native-gesture-handler` for gesture detection
   - Uses `react-native-reanimated` for smooth animations

2. **HomeScreen** (`app/index.tsx`)
   - Wraps WebView with RefreshableWebViewIOS on iOS
   - Provides existing scroll state tracking and refresh handlers
   - Maintains Android behavior with ScrollView + RefreshControl

### Gesture and Scroll Detection Interaction

#### How It Works

```
┌─────────────────────────────────────────────────┐
│  RefreshableWebViewIOS (Gesture Layer)         │
│  ┌───────────────────────────────────────────┐ │
│  │  WebView (Scroll Layer)                   │ │
│  │  • Normal web content scrolling           │ │
│  │  • Injects JS to track scroll position    │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### State Flow

1. **Injected JavaScript** (in app/index.tsx):
   ```javascript
   window.addEventListener('scroll', checkScroll);
   // Posts message: { type: 'scroll', scrollY: y, isAtTop: y === 0 }
   ```

2. **React Native Message Handler**:
   ```typescript
   if (data.type === 'scroll') {
     setScrollY(data.scrollY || 0);
     setIsAtTop(data.scrollY === 0 || data.isAtTop);
   }
   ```

3. **Gesture Activation**:
   ```typescript
   panGesture
     .enabled(isAtTop && !isReloading)  // Only active at top
     .onBegin(() => {
       if (!isAtTop || isReloading) return;  // Double guard
     })
   ```

#### Gesture States

| State | Condition | Action |
|-------|-----------|--------|
| **Idle** | `isAtTop === false` | Gesture disabled, WebView scrolls normally |
| **Ready** | `isAtTop === true && !isReloading` | Gesture enabled, waiting for downward pull |
| **Pulling** | `translationY > 0 && translationY < PULL_THRESHOLD` | Show pull indicator with increasing opacity |
| **Threshold Reached** | `translationY >= PULL_THRESHOLD` | Ready to trigger refresh on release |
| **Refreshing** | After release past threshold | Call `onRefresh()`, lock at LOADING_POSITION |
| **Completing** | `refreshing === false` | Animate back to hidden position |

## Key Constants

```typescript
const PULL_THRESHOLD = 80;     // Minimum pull to trigger refresh (80px)
const MAX_PULL = 120;          // Maximum pull distance - rubber band effect
const LOADING_POSITION = 60;   // Where spinner stays during refresh
```

## Integration Points

### 1. GestureHandlerRootView Setup
Required in `app/_layout.tsx`:
```typescript
import { GestureHandlerRootView } from 'react-native-gesture-handler';

return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <Stack>...</Stack>
  </GestureHandlerRootView>
);
```

### 2. iOS Conditional Rendering
In `app/index.tsx`:
```typescript
{Platform.OS === 'ios' ? (
  <RefreshableWebViewIOS
    isAtTop={isAtTop}
    isReloading={isReloading.current}
    onRefresh={onRefresh}
    refreshing={refreshing}
  >
    {renderWebView()}
  </RefreshableWebViewIOS>
) : (
  // Android: ScrollView with RefreshControl
)}
```

### 3. State Management
Leverages existing HomeScreen state:
- `isAtTop`: Tracked from WebView scroll events via injected JS
- `isReloading`: Ref that prevents concurrent reloads
- `refreshing`: State that controls spinner visibility
- `onRefresh()`: Callback that triggers `safeReload('pull-to-refresh')`

## Animation Details

### Pull Animation
- **Translation**: Finger pull directly moves indicator (1:1 tracking)
- **Opacity**: Fades in from 0 to 1 as pull progresses to threshold
- **Clamping**: Maximum pull distance capped at 120px for rubber band effect

### Release Animation
Uses `withSpring` from Reanimated:
```typescript
withSpring(targetValue, {
  damping: 15,     // Controls bounce
  stiffness: 150   // Controls speed
})
```

**Two scenarios:**
1. **Not past threshold**: Springs back to 0 (hidden)
2. **Past threshold**: Springs to 60px, triggers refresh, waits for completion

### Completion Animation
When `refreshing` changes to `false`:
- Animates from current position to -80px (fully hidden above screen)
- Uses same spring configuration for consistency

## Benefits Over Native pullToRefreshEnabled

1. **Works in Expo Go**: Standard prop doesn't work due to gesture conflicts
2. **Custom Control**: Full control over threshold, animation, and appearance
3. **State Integration**: Seamlessly integrates with existing reload coordination
4. **Better UX**: Smooth elastic animations and visual feedback during pull
5. **No Breaking Changes**: Android behavior unchanged, iOS gets custom solution

## Testing Checklist

- [ ] Pull gesture only activates when scrollY === 0
- [ ] Normal WebView scrolling works when not at top
- [ ] Pull indicator appears and follows finger during pull
- [ ] Refresh triggers when pulled past 80px threshold
- [ ] Spinner shows during refresh (refreshing === true)
- [ ] Cooldown prevents rapid refreshes (15s)
- [ ] Gesture cancels if page scrolls during pull
- [ ] Animation is smooth on physical iOS device
- [ ] No interference with WebView internal gestures (zoom, horizontal scroll)
- [ ] Works correctly in Expo Go on iOS

## Troubleshooting

### Gesture Not Activating
- Verify `GestureHandlerRootView` wraps the app in `_layout.tsx`
- Check `isAtTop` state is updating correctly (console log scroll events)
- Ensure `isReloading.current === false`

### Animation Lag
- Verify `react-native-reanimated/plugin` is in `babel.config.js`
- Clear Metro bundler cache: `expo start --clear`
- Rebuild app if using development build

### WebView Scrolling Issues
- Keep `scrollEnabled={true}` on WebView
- Ensure gesture `.enabled()` condition includes `isAtTop` check
- Verify injected JavaScript is posting scroll events correctly

## Platform-Specific Notes

### iOS
- Uses RefreshableWebViewIOS wrapper
- Custom PanGestureHandler-based implementation
- Removed `pullToRefreshEnabled` and `onRefresh` from WebView props

### Android
- Uses ScrollView with RefreshControl (unchanged)
- Standard Android pull-to-refresh behavior
- No custom gesture handling needed

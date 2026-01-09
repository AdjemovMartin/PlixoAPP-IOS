# Google Sign-In Integration Guide

This document provides a complete overview of the Google Sign-In implementation in the Plixo mobile app.

## Overview

The app implements native Google Sign-In that operates **outside the WebView**, complying with Google's OAuth policies and bypassing their embedded browser restrictions. After successful authentication, the app exchanges the Google token with a Supabase Edge Function and safely injects the session into the WebView.

## Architecture

```
┌─────────────────┐
│  User taps      │
│  Google button  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Native Google Sign-In  │
│  (Outside WebView)      │
└────────┬────────────────┘
         │
         ▼ (idToken)
┌──────────────────────────┐
│  Supabase Edge Function  │
│  google-auth-mobile      │
└────────┬─────────────────┘
         │
         ▼ (access_token, refresh_token)
┌──────────────────────────┐
│  supabase.auth.setSession│
│  (Native Session)        │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Inject into WebView     │
│  (Domain: plixo.bg only) │
└──────────────────────────┘
```

## Implementation Files

### Core Services

1. **`lib/supabase.ts`**
   - Initializes Supabase client with AsyncStorage persistence
   - Configures auto token refresh
   - Single source of truth for Supabase instance

2. **`services/googleAuthService.ts`**
   - Configures Google Sign-In SDK
   - Handles native Google authentication flow
   - Exchanges Google ID token with Edge Function
   - Manages sign-out

3. **`services/supabaseAuthService.ts`**
   - Sets Supabase session from tokens
   - Gets current session
   - Clears session on sign-out
   - Provides auth state change listener

### Main Integration

4. **`app/index.tsx`**
   - Main WebView screen with Google Sign-In integration
   - Renders "Continue with Google" button on auth pages
   - Handles authentication flow
   - Injects session into WebView securely
   - Monitors URL to show/hide Google button

## Key Features

### Security

- **Domain Validation:** Session only injected when WebView is on `plixo.bg` or `www.plixo.bg`
- **HTTPS Only:** All network requests use secure connections
- **Token Validation:** Edge Function validates Google tokens before creating sessions
- **No Third-Party Injection:** Tokens never sent to external domains

### User Experience

- **Auto-Detection:** Google button appears automatically on login/signup pages
- **Loading States:** Shows spinner during authentication
- **Error Handling:** User-friendly error messages for all failure scenarios
- **Session Persistence:** Uses AsyncStorage to maintain login across app restarts
- **Auto Token Refresh:** Supabase client handles token refresh automatically

### Platform Support

- **iOS:** Uses iOS Client ID with URL scheme callback
- **Android:** Uses Web Client ID with SHA-1 fingerprint validation
- **Cross-Platform:** Same codebase works on both platforms

## Configuration Required

### 1. Google Cloud Console

Create three OAuth client IDs:
- **iOS Client ID** (iOS application type)
- **Android Client ID** (Android application type)
- **Web Client ID** (Web application type)

### 2. Environment Variables

Add to `.env`:
```env
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
```

### 3. iOS Configuration

Update `app.json`:
```json
"ios": {
  "infoPlist": {
    "CFBundleURLTypes": [
      {
        "CFBundleURLSchemes": ["com.googleusercontent.apps.YOUR_IOS_CLIENT_ID"]
      }
    ]
  }
}
```

### 4. Android Configuration

- Add SHA-1 fingerprint to Google Cloud Console
- Both debug and release fingerprints needed
- Get fingerprint: `cd android && ./gradlew signingReport`

### 5. Supabase Edge Function

Deploy `google-auth-mobile` function to:
```
https://lxhpheflaucphoxnljws.supabase.co/functions/v1/google-auth-mobile
```

## Authentication Flow

### Step-by-Step

1. **User Action:** User navigates to login/signup page in WebView
2. **Button Appears:** App detects auth page URL and shows Google button
3. **User Taps:** User taps "Continue with Google"
4. **Native Dialog:** Google Sign-In dialog opens (system UI, not WebView)
5. **User Authenticates:** User selects account and grants permissions
6. **Token Received:** App receives Google ID token
7. **Edge Function Call:** App POSTs idToken to Edge Function
8. **Token Validation:** Edge Function validates token with Google
9. **User Creation:** Edge Function creates/gets user in Supabase
10. **Session Generation:** Edge Function returns access/refresh tokens
11. **Native Session:** App calls `supabase.auth.setSession()`
12. **WebView Injection:** App sends tokens to WebView via postMessage
13. **Website Integration:** WebView stores tokens in localStorage
14. **Redirect:** Website redirects to dashboard (user is logged in)

### Error Scenarios

- **User Cancels:** Flow stops, no error shown
- **Network Error:** User-friendly timeout message
- **Invalid Token:** "Authentication failed" alert
- **Server Error:** Generic error with option to retry
- **Play Services Missing:** Specific Android message

## WebView Integration

### Message Injection

The app uses `postMessage` to communicate with WebView:

```typescript
// Native app sends:
{
  type: 'SUPABASE_SESSION',
  payload: {
    access_token: 'xxx',
    refresh_token: 'yyy',
    user: { ... }
  }
}
```

### WebView Listener (injectedJavaScript)

```javascript
window.addEventListener('message', function(e) {
  const data = JSON.parse(e.data);
  if (data.type === 'SUPABASE_SESSION') {
    localStorage.setItem('supabase.auth.token', JSON.stringify(data.payload));
    // Redirect to dashboard
    window.location.href = '/';
  }
});
```

## Testing

### Prerequisites

- Physical iOS device or Android device with Google Play Services
- Google OAuth credentials configured
- Edge Function deployed
- App rebuilt with `eas build`

### Test Checklist

- [ ] Google button appears on login page
- [ ] Google button hidden when authenticated
- [ ] Native dialog opens on button tap
- [ ] User can select Google account
- [ ] Session created after authentication
- [ ] WebView receives and stores session
- [ ] Website recognizes authenticated user
- [ ] Session persists across app restarts
- [ ] Sign-out clears both native and WebView sessions
- [ ] Error handling works for all scenarios

### Debug Tips

1. **Check Logs:**
   - iOS: Use Xcode console
   - Android: Use `adb logcat`

2. **Verify Environment:**
   ```bash
   cat .env
   # Should show all Google Client IDs
   ```

3. **Test Edge Function:**
   ```bash
   curl -X POST https://lxhpheflaucphoxnljws.supabase.co/functions/v1/google-auth-mobile \
        -H "Content-Type: application/json" \
        -d '{"idToken":"test"}'
   ```

4. **Check WebView Console:**
   - Enable remote debugging
   - Look for `SUPABASE_SESSION` messages

## Common Issues

### iOS

**Issue:** "Sign in failed" immediately after tapping
- **Cause:** Wrong iOS Client ID or URL scheme
- **Fix:** Verify `.env` and `app.json` match Google Cloud Console

**Issue:** Dialog doesn't appear
- **Cause:** Google Sign-In not configured
- **Fix:** Call `configureGoogleSignIn()` on app mount

### Android

**Issue:** "Play Services not available"
- **Cause:** Missing or outdated Google Play Services
- **Fix:** Update Play Services or test on different device

**Issue:** "Sign in failed" with error 10
- **Cause:** SHA-1 fingerprint not added to Google Cloud Console
- **Fix:** Get fingerprint with `./gradlew signingReport` and add to console

### General

**Issue:** Session not appearing in WebView
- **Cause:** Domain mismatch or WebView not listening
- **Fix:** Verify on plixo.bg and check JavaScript listeners

**Issue:** "Failed to authenticate with server"
- **Cause:** Edge Function not deployed or wrong URL
- **Fix:** Deploy function and verify URL in `googleAuthService.ts`

## Best Practices

1. **Always test on physical devices** - Emulators have limitations
2. **Use separate credentials for debug/release** - Prevents conflicts
3. **Monitor Edge Function logs** - Catch server-side issues early
4. **Keep tokens secure** - Never log sensitive data
5. **Handle all error cases** - Provide clear feedback to users
6. **Test session persistence** - Verify across app restarts
7. **Validate domain before injection** - Prevent token leaks

## Resources

- [Google Sign-In for React Native](https://github.com/react-native-google-signin/google-signin)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Expo Documentation](https://docs.expo.dev/)

## Support

For issues or questions:
1. Check [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md) troubleshooting section
2. Review Edge Function logs in Supabase Dashboard
3. Enable debug logging in `googleAuthService.ts`
4. Test with minimal example first

---

**Last Updated:** 2026-01-09
**Version:** 1.0.0

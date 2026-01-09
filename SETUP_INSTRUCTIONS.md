# Plixo Mobile App Setup Instructions

This guide will help you set up push notifications and Google Sign-In for your Plixo Expo app using EAS Build and Firebase Cloud Messaging.

## Prerequisites

- Expo account (sign up at https://expo.dev)
- Firebase project with Cloud Messaging enabled
- Google Cloud Console project for OAuth credentials
- Physical device for testing (recommended for both push notifications and Google Sign-In)

## Table of Contents

1. [Google Sign-In Setup](#google-sign-in-setup)
2. [Push Notifications Setup](#push-notifications-setup)
3. [Building Your App](#building-your-app)
4. [Testing](#testing)
5. [Troubleshooting](#troubleshooting)

---

## Google Sign-In Setup

Your app now supports native Google Sign-In that works outside the WebView, complying with Google's OAuth policies and bypassing embedded browser restrictions.

### How It Works

1. User taps "Continue with Google" button (appears on login/signup pages)
2. Native Google Sign-In dialog opens (outside WebView)
3. User authenticates with Google
4. App receives Google ID token
5. App exchanges token with Supabase Edge Function at `https://lxhpheflaucphoxnljws.supabase.co/functions/v1/google-auth-mobile`
6. Edge Function returns Supabase access/refresh tokens
7. App sets Supabase session natively
8. Session is securely injected into WebView localStorage
9. Website recognizes user as authenticated

### Step 1: Create Google OAuth Credentials

#### 1.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your project ID

#### 1.2 Enable Google Sign-In API

1. Go to "APIs & Services" > "Library"
2. Search for "Google+ API" or "Google Sign-In API"
3. Click "Enable"

#### 1.3 Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type (or Internal if workspace)
3. Fill in required fields:
   - App name: Plixo
   - User support email: your email
   - Developer contact: your email
4. Add scopes: `email`, `profile`
5. Add test users (for testing phase)
6. Save and continue

#### 1.4 Create OAuth Client IDs

You need **three** client IDs:

**A. iOS Client ID:**
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Application type: **iOS**
4. Name: "Plixo iOS"
5. Bundle ID: `com.plixo.app` (matches `bundleIdentifier` in app.json)
6. Click "Create"
7. **Copy the Client ID** (format: `xxx.apps.googleusercontent.com`)

**B. Android Client ID:**
1. Create another OAuth client ID
2. Application type: **Android**
3. Name: "Plixo Android"
4. Package name: `com.plixo.app` (matches `package` in app.json)
5. **SHA-1 certificate fingerprint:** (see below how to get it)
6. Click "Create"
7. **Copy the Client ID**

**C. Web Client ID:**
1. Create another OAuth client ID
2. Application type: **Web application**
3. Name: "Plixo Web"
4. Click "Create"
5. **Copy the Client ID**

#### 1.5 Get Android SHA-1 Fingerprint

**For Debug Builds:**
```bash
cd android
./gradlew signingReport
```

Look for the SHA-1 fingerprint under `Variant: debug` > `Config: debug`

**For Release Builds:**
You need to use your release keystore:
```bash
keytool -list -v -keystore your-release-key.keystore -alias your-key-alias
```

Add **both debug and release SHA-1 fingerprints** to your Android OAuth client in Google Cloud Console.

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env` (if not already done)
2. Add your Google Client IDs to `.env`:

```env
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

### Step 3: Update iOS URL Scheme

Update `app.json` to add your iOS Client ID to the URL scheme:

```json
"ios": {
  "infoPlist": {
    "CFBundleURLTypes": [
      {
        "CFBundleURLSchemes": ["com.googleusercontent.apps.YOUR_IOS_CLIENT_ID_HERE"]
      }
    ]
  }
}
```

Replace `YOUR_IOS_CLIENT_ID_HERE` with the numeric part of your iOS Client ID (before `.apps.googleusercontent.com`).

### Step 4: Create Supabase Edge Function

Your app expects an Edge Function at:
```
https://lxhpheflaucphoxnljws.supabase.co/functions/v1/google-auth-mobile
```

Create a new file `supabase/functions/google-auth-mobile/index.ts`:

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return new Response(
        JSON.stringify({ error: 'Missing idToken' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Google token and get user info
    const googleResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    if (!googleResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Invalid Google token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleUser = await googleResponse.json();

    // Create Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get or create user in Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: googleUser.email,
      email_confirm: true,
      user_metadata: {
        full_name: googleUser.name,
        avatar_url: googleUser.picture,
        provider: 'google',
      },
    });

    if (authError && authError.message !== 'User already registered') {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate session tokens
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: googleUser.email,
    });

    if (sessionError || !sessionData) {
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: sessionData.properties.access_token,
        refresh_token: sessionData.properties.refresh_token,
        user: authData?.user || sessionData.user,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

Deploy the Edge Function:
```bash
npx supabase functions deploy google-auth-mobile
```

### Security Notes

- The app only injects session tokens into WebView when the URL is `plixo.bg` or `www.plixo.bg`
- Tokens are never injected into third-party domains
- The Edge Function validates Google tokens before creating Supabase sessions
- All communication uses HTTPS

---

## Push Notifications Setup

## Current Status

Your app is now configured to:
- ✅ Run safely in Expo Go (push notifications disabled, no crashes)
- ✅ Support push notifications in EAS development and production builds
- ✅ Use Firebase Cloud Messaging for Android
- ✅ Compatible with Expo SDK 54 (ready for SDK 53+)

## Step 1: Get Your EAS Project ID

1. Install EAS CLI (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. Login to your Expo account:
   ```bash
   eas login
   ```

3. Initialize EAS in your project:
   ```bash
   eas build:configure
   ```

4. Get your project ID:
   ```bash
   eas project:info
   ```

5. Copy the project ID and update `app.json`:
   - Open `app.json`
   - Find `"projectId": "YOUR_EAS_PROJECT_ID_HERE"`
   - Replace with your actual project ID (e.g., `"projectId": "abcd1234-5678-90ef-ghij-klmnopqrstuv"`)

## Step 2: Verify Firebase Configuration

You've already uploaded `google-services.json` to the project root. Verify:

1. File location: `./google-services.json` exists in project root
2. File is referenced correctly in `app.json` (already configured):
   ```json
   "android": {
     "googleServicesFile": "./google-services.json"
   }
   ```

## Step 3: Build Your App with EAS

### Development Build (Recommended for Testing)

1. Build for Android development:
   ```bash
   eas build -p android --profile development
   ```

2. Wait for the build to complete (10-20 minutes)

3. Download and install the APK on your physical Android device:
   - You'll receive a link to download the APK
   - Transfer to your device or scan the QR code
   - Install the app (enable "Install from unknown sources" if needed)

### Production Build (For Play Store)

1. Build for Android production:
   ```bash
   eas build -p android --profile production
   ```

2. The AAB file can be uploaded to Google Play Console

## Step 4: Test Push Notifications

### Testing in Development Build

1. Launch the app on your physical device
2. Grant notification permissions when prompted
3. The app will automatically register for push notifications
4. Check the logs to see your Expo Push Token:
   ```bash
   npx expo start --dev-client
   ```

### Verify Push Token Registration

Your app sends the device ID to your WebView when:
- The app launches
- The WebView requests it (via `request_device_id` message)

The WebView receives the push token via:
```javascript
window.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'device_id') {
    console.log('Device ID:', data.deviceId);
    console.log('Platform:', data.platform);
  }
});
```

### Send Test Notification

Use the Expo Push API to send a test notification:

```bash
curl -H "Content-Type: application/json" \
     -X POST https://exp.host/--/api/v2/push/send \
     -d '{
  "to": "ExponentPushToken[YOUR_TOKEN_HERE]",
  "title": "Test Notification",
  "body": "This is a test notification from Plixo!",
  "data": {
    "type": "new_message",
    "messageId": "123"
  }
}'
```

## Step 5: Important Notes

### Expo Go vs EAS Builds

- **Expo Go**: Push notifications are DISABLED (no crashes)
  - Perfect for testing WebView functionality
  - Cannot test push notifications
  - Good for rapid development

- **EAS Development Build**: Push notifications are ENABLED
  - Full native code compiled
  - Can test push notifications
  - Closer to production environment

- **EAS Production Build**: Ready for Play Store
  - Optimized and minified
  - Full push notification support
  - Signed for distribution

### Android Notification Channel

Your app automatically creates a notification channel with:
- Name: "default"
- Importance: MAX (shows as popup)
- Sound: enabled
- Vibration: enabled
- Badge: enabled

### Notification Types

Your app handles these notification types:
- `new_message`: Opens messages page, increments badge
- `listing_approval`: Opens listing details
- `listing_rejection`: Opens listing details

### Badge Management

The app automatically:
- Increments badge when receiving `new_message` notifications
- Clears badge when user visits `/messages` page in WebView
- Syncs badge count with native OS badge

## Troubleshooting

### Google Sign-In Issues

#### "Google Sign-In button not appearing"
- Check that you're on a login or signup page (`/login`, `/signup`, `/auth`)
- Verify environment variables are set correctly in `.env`
- Make sure the app has been rebuilt after adding Google Sign-In

#### "Sign in failed" or "No ID token received"
- **iOS:** Verify iOS Client ID is correct in `.env`
- **Android:** Verify Android Client ID and Web Client ID are correct
- Check that SHA-1 fingerprint is added to Google Cloud Console
- Ensure Google Sign-In API is enabled in Google Cloud Console
- For iOS, verify URL scheme in `app.json` matches your client ID

#### "Invalid Google token" from Edge Function
- Token might have expired (try signing in again)
- Verify Google credentials are set up correctly in Google Cloud Console
- Check that OAuth consent screen is configured properly

#### "Failed to authenticate with server"
- Check that Edge Function is deployed: `npx supabase functions deploy google-auth-mobile`
- Verify Edge Function URL is correct in `googleAuthService.ts`
- Check Supabase project is running and accessible
- Review Edge Function logs in Supabase Dashboard

#### "Play Services not available" (Android)
- Google Play Services must be installed and updated
- Won't work on emulators without Google Play Services
- Test on a physical device with Google Play Services

#### Session not syncing to WebView
- Verify you're on `plixo.bg` domain (session only injects on this domain)
- Check browser console in WebView for JavaScript errors
- Ensure website is listening for `SUPABASE_SESSION` message events

### Push Notifications Issues

#### "Must use physical device for Push Notifications"
- Push notifications only work on real devices, not emulators
- Build with EAS and install on a physical device

#### "Project ID not found"
- Update the `projectId` in `app.json` under `extra.eas`
- Make sure you've run `eas build:configure`

#### App crashes in Expo Go
- This should be fixed now
- The app detects Expo Go and skips push notification registration
- Update your code if still crashing

#### Not receiving notifications
1. Check notification permissions are granted
2. Verify Firebase is configured correctly
3. Test with Expo Push Notification Tool: https://expo.dev/notifications
4. Check device logs for errors

#### Token not generated
- Ensure you're using a physical device
- Check that `google-services.json` is in the project root
- Verify the EAS project ID is correct in `app.json`

## Next Steps

1. Update `app.json` with your real EAS project ID
2. Run `eas build -p android --profile development`
3. Install the APK on your device
4. Test push notifications
5. When ready, build production version for Play Store

## Resources

- [Expo Push Notifications Guide](https://docs.expo.dev/push-notifications/overview/)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Expo Push Notification Tool](https://expo.dev/notifications)

## Support

If you encounter issues:
1. Check the Expo documentation
2. Review your Firebase console for errors
3. Check device logs with `adb logcat`
4. Test with the Expo Push Notification Tool

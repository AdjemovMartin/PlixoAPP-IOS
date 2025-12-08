# Push Notifications Setup Instructions

This guide will help you set up push notifications for your Plixo Expo app using EAS Build and Firebase Cloud Messaging.

## Prerequisites

- Expo account (sign up at https://expo.dev)
- Firebase project with Cloud Messaging enabled
- Physical Android device for testing (emulator won't receive push notifications)

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

### "Must use physical device for Push Notifications"
- Push notifications only work on real devices, not emulators
- Build with EAS and install on a physical device

### "Project ID not found"
- Update the `projectId` in `app.json` under `extra.eas`
- Make sure you've run `eas build:configure`

### App crashes in Expo Go
- This should be fixed now
- The app detects Expo Go and skips push notification registration
- Update your code if still crashing

### Not receiving notifications
1. Check notification permissions are granted
2. Verify Firebase is configured correctly
3. Test with Expo Push Notification Tool: https://expo.dev/notifications
4. Check device logs for errors

### Token not generated
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

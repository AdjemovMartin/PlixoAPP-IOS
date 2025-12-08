# Push Notifications Implementation Guide

## Overview

Your Plixo.bg WebView app now includes full push notification support with pull-to-refresh functionality. This guide explains how to trigger notifications from your backend.

## Features Implemented

1. **Push Notifications** for listing approvals/rejections and new messages
2. **Pull-to-Refresh** in WebView (works on iOS & Android)
3. **Badge Management** for unread message counts
4. **Deep Linking** to navigate to specific sections when notifications are tapped
5. **Session Preservation** - all cookies and sessions remain intact

## How to Send Notifications

### Using the Supabase Edge Function

Your backend can send notifications by calling the `send-push-notification` edge function:

```javascript
const response = await fetch('YOUR_SUPABASE_URL/functions/v1/send-push-notification', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_SUPABASE_ANON_KEY',
  },
  body: JSON.stringify({
    deviceId: 'device-identifier',
    type: 'new_message', // or 'listing_approval' or 'listing_rejection'
    title: 'New Message',
    body: 'You have a new message from John',
    messageId: '12345' // optional, for navigation
  })
});
```

### Notification Types

#### 1. New Message
```json
{
  "deviceId": "user-device-id",
  "type": "new_message",
  "title": "New Message",
  "body": "You have a new message from John",
  "messageId": "12345"
}
```

When tapped, navigates to: `https://plixo.bg/messages/12345`

#### 2. Listing Approval
```json
{
  "deviceId": "user-device-id",
  "type": "listing_approval",
  "title": "Listing Approved",
  "body": "Your listing has been approved",
  "listingId": "67890"
}
```

When tapped, navigates to: `https://plixo.bg/listings/67890`

#### 3. Listing Rejection
```json
{
  "deviceId": "user-device-id",
  "type": "listing_rejection",
  "title": "Listing Rejected",
  "body": "Your listing needs revisions",
  "listingId": "67890"
}
```

When tapped, navigates to: `https://plixo.bg/listings/67890`

## Device ID Management

Each device automatically registers a unique identifier when the app launches. You need to associate this device ID with your users in your backend.

### Getting Device IDs

Device IDs are stored in the `push_tokens` table in Supabase. You can:

1. Add a user authentication step where users link their account
2. Have your web app (plixo.bg) detect when opened in the mobile app and send the device ID to your backend
3. Use a webhook or API endpoint to sync user IDs with device IDs

### Example: Linking Users to Devices

```javascript
// In your web app (plixo.bg), detect the mobile app
if (window.ReactNativeWebView) {
  // Send user info to the app
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'user_login',
    userId: currentUserId
  }));
}
```

## Badge Management

The app automatically:
- Increments badge count when new message notifications arrive
- Clears badge count when user opens the messages section
- Shows badge indicator on app icon (iOS)

## Pull-to-Refresh

Users can pull down on the WebView to refresh the current page. This:
- Reloads the current URL
- Preserves all session cookies
- Shows native loading indicator
- Works on both iOS and Android

## Testing Notifications

### 1. Build and Install the App

You must build the app for physical devices (notifications don't work in simulators):

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

### 2. Get a Device ID

After installing, the app registers its device ID in the `push_tokens` table. Query this table:

```sql
SELECT device_id, expo_push_token, platform, created_at
FROM push_tokens
WHERE active = true;
```

### 3. Send a Test Notification

Use the edge function to send a test:

```bash
curl -X POST YOUR_SUPABASE_URL/functions/v1/send-push-notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -d '{
    "deviceId": "DEVICE_ID_FROM_TABLE",
    "type": "new_message",
    "title": "Test Notification",
    "body": "This is a test message",
    "messageId": "test123"
  }'
```

## Database Schema

### push_tokens table
- `device_id` - Unique device identifier
- `expo_push_token` - Expo push notification token
- `platform` - ios/android/web
- `active` - Whether token is active

### notification_events table
- `device_id` - Target device
- `notification_type` - Type of notification
- `title` - Notification title
- `body` - Notification body
- `data` - JSON payload with navigation info
- `sent` - Whether notification was sent

## Integration with Your Backend

To integrate with your Plixo.bg backend:

1. **User Registration**: When users log in via the WebView, capture their device ID and link it to their user account in your database

2. **Send Notifications**: When an event occurs (new message, listing approval), call the edge function with the user's device ID

3. **Real-time Updates**: The app uses Supabase real-time subscriptions to instantly receive notifications

## Troubleshooting

### Notifications Not Appearing
- Ensure device has granted notification permissions
- Check that device has an active token in `push_tokens` table
- Verify the edge function was called successfully
- Check device isn't in Do Not Disturb mode

### Deep Links Not Working
- Ensure the URL scheme `plixo://` is properly configured
- Check the notification data includes correct IDs
- Verify WebView can navigate to the target URL

### Badge Count Issues
- Badge only works on iOS devices
- Ensure the WebView bridge is properly communicating
- Check that notifications include the correct type

## Security Notes

- Device IDs are automatically generated and anonymous
- Row Level Security (RLS) is enabled on all tables
- The edge function does not require authentication (public webhook)
- Store sensitive user mappings in your backend, not in Supabase

## Support

For issues or questions, check:
1. Expo notification documentation
2. Supabase real-time documentation
3. Your device logs for errors

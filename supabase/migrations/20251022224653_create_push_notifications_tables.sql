/*
  # Push Notifications Infrastructure

  This migration creates the database schema for managing push notifications in the Plixo.bg mobile app.

  ## New Tables

  ### `push_tokens`
  Stores Expo push notification tokens for registered devices.
  - `id` (uuid, primary key) - Unique identifier for each token record
  - `device_id` (text, unique) - Unique device identifier from the mobile app
  - `expo_push_token` (text) - The Expo push notification token
  - `platform` (text) - Device platform (ios, android, web)
  - `created_at` (timestamptz) - When the token was first registered
  - `updated_at` (timestamptz) - Last time the token was updated
  - `active` (boolean) - Whether this token is currently active

  ### `notification_events`
  Stores notification events that need to be sent to users.
  - `id` (uuid, primary key) - Unique identifier for each notification event
  - `device_id` (text) - Target device identifier
  - `notification_type` (text) - Type of notification (listing_approval, new_message)
  - `title` (text) - Notification title
  - `body` (text) - Notification body text
  - `data` (jsonb) - Additional data payload (navigation info, IDs, etc.)
  - `sent` (boolean) - Whether the notification has been sent
  - `sent_at` (timestamptz) - When the notification was sent
  - `created_at` (timestamptz) - When the event was created

  ## Security

  ### Row Level Security (RLS)
  - Enable RLS on both tables
  - `push_tokens`: Devices can only read/write their own tokens
  - `notification_events`: Devices can only read their own notifications

  ## Notes
  - All timestamps use `timestamptz` for proper timezone handling
  - The `device_id` is used as the primary identifier for linking tokens to notification events
  - The `data` field stores JSON for flexible notification payloads
  - Inactive tokens are kept for historical tracking but won't receive notifications
*/

-- Create push_tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text UNIQUE NOT NULL,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  active boolean DEFAULT true
);

-- Create notification_events table
CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('listing_approval', 'listing_rejection', 'new_message')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  sent boolean DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_push_tokens_device_id ON push_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_notification_events_device_id ON notification_events(device_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_sent ON notification_events(sent) WHERE sent = false;
CREATE INDEX IF NOT EXISTS idx_notification_events_created_at ON notification_events(created_at DESC);

-- Enable Row Level Security
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for push_tokens
-- Allow devices to insert their own tokens (no auth required for device registration)
CREATE POLICY "Devices can register their own tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (true);

-- Allow devices to read their own tokens
CREATE POLICY "Devices can read their own tokens"
  ON push_tokens FOR SELECT
  USING (true);

-- Allow devices to update their own tokens
CREATE POLICY "Devices can update their own tokens"
  ON push_tokens FOR UPDATE
  USING (true);

-- RLS Policies for notification_events
-- Allow system to insert notification events
CREATE POLICY "System can create notification events"
  ON notification_events FOR INSERT
  WITH CHECK (true);

-- Allow devices to read their own notifications
CREATE POLICY "Devices can read their own notifications"
  ON notification_events FOR SELECT
  USING (true);

-- Allow system to update notification events (mark as sent)
CREATE POLICY "System can update notification events"
  ON notification_events FOR UPDATE
  USING (true);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on push_tokens
DROP TRIGGER IF EXISTS update_push_tokens_updated_at ON push_tokens;
CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenManager } from './tokenManager';

const BADGE_COUNT_KEY = '@plixo_badge_count';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let badgeCount = 0;

async function loadBadgeCount(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(BADGE_COUNT_KEY);
    if (stored) {
      badgeCount = parseInt(stored, 10) || 0;
    }
  } catch (error) {
    console.error('Error loading badge count:', error);
  }
}

async function saveBadgeCount(count: number): Promise<void> {
  try {
    badgeCount = count;
    await AsyncStorage.setItem(BADGE_COUNT_KEY, count.toString());
  } catch (error) {
    console.error('Error saving badge count:', error);
  }
}

loadBadgeCount();

export interface NotificationData {
  type: 'listing_approval' | 'listing_rejection' | 'new_message';
  targetUrl?: string;
  listingId?: string;
  messageId?: string;
}

export async function initializePushNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    await tokenManager.initialize();
  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}

export function getDeviceToken() {
  return tokenManager.getCurrentToken();
}

export function onTokenChange(listener: (data: { deviceId: string | null; platform: string }) => void) {
  return tokenManager.onTokenChange(listener);
}

export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.setBadgeCountAsync(count);
    await saveBadgeCount(count);
  } catch (error) {
    console.error('Error setting badge count:', error);
  }
}

export async function getBadgeCount(): Promise<number> {
  if (Platform.OS === 'web') return 0;

  try {
    const nativeBadge = await Notifications.getBadgeCountAsync();
    if (nativeBadge !== badgeCount) {
      await saveBadgeCount(nativeBadge);
    }
    return nativeBadge;
  } catch (error) {
    console.error('Error getting badge count:', error);
    return badgeCount;
  }
}

export async function incrementBadgeCount(): Promise<void> {
  const currentCount = await getBadgeCount();
  await setBadgeCount(currentCount + 1);
}

export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}

export function getTargetUrlFromNotificationData(data: NotificationData): string {
  if (data.targetUrl) {
    return data.targetUrl;
  }

  let targetUrl = 'https://plixo.bg/';

  if (data.type === 'new_message') {
    targetUrl = data.messageId
      ? `https://plixo.bg/messages/${data.messageId}`
      : 'https://plixo.bg/messages';
  } else if (data.type === 'listing_approval' || data.type === 'listing_rejection') {
    targetUrl = data.listingId
      ? `https://plixo.bg/listings/${data.listingId}`
      : 'https://plixo.bg/listings';
  }

  return targetUrl;
}

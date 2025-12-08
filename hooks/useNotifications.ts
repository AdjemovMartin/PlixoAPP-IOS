import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  incrementBadgeCount,
  NotificationData,
  initializePushNotifications,
} from '@/services/notificationService';

export function useNotifications(onNotificationPress: (data: NotificationData) => void) {
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const isExpoGo = Constants.appOwnership === 'expo';

    async function setupNotifications() {
      if (!isExpoGo) {
        await initializePushNotifications();
      }

      notificationListener.current = Notifications.addNotificationReceivedListener(
        async (notification) => {
          const data = notification.request.content.data as unknown as NotificationData;

          if (data && data.type === 'new_message') {
            await incrementBadgeCount();
          }
        }
      );

      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as unknown as NotificationData;
          if (data && data.type) {
            onNotificationPress(data);
          }
        }
      );
    }

    setupNotifications();

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [onNotificationPress]);

  return {};
}

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { NotificationData } from '@/services/notificationService';

interface DeepLinkData {
  path?: string;
  queryParams?: Record<string, string>;
}

export function useDeepLinking(onDeepLink: (url: string) => void) {
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url, onDeepLink);
    });

    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url, onDeepLink);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [onDeepLink]);
}

function handleDeepLink(url: string, callback: (targetUrl: string) => void) {
  const parsed = Linking.parse(url);
  const { path, queryParams } = parsed;

  if (path === 'notification') {
    const type = queryParams?.type;
    let targetUrl = 'https://plixo.bg/';

    if (type === 'new_message') {
      const messageId = queryParams?.messageId;
      targetUrl = messageId
        ? `https://plixo.bg/messages/${messageId}`
        : 'https://plixo.bg/messages';
    } else if (type === 'listing_approval' || type === 'listing_rejection') {
      const listingId = queryParams?.listingId;
      targetUrl = listingId
        ? `https://plixo.bg/listings/${listingId}`
        : 'https://plixo.bg/listings';
    }

    callback(targetUrl);
  }
}

export function buildDeepLinkUrl(data: NotificationData): string {
  const baseUrl = Linking.createURL('notification');
  const params = new URLSearchParams();

  params.append('type', data.type);

  if (data.listingId) {
    params.append('listingId', data.listingId);
  }

  if (data.messageId) {
    params.append('messageId', data.messageId);
  }

  return `${baseUrl}?${params.toString()}`;
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

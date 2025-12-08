import { NotificationData } from './notificationService';

export function getNavigationPathFromNotification(data: NotificationData): string {
  if (data.targetUrl) {
    const url = new URL(data.targetUrl);
    return url.pathname + url.search;
  }

  let path = '/';

  if (data.type === 'new_message') {
    path = data.messageId
      ? `/messages/${data.messageId}`
      : '/messages';
  } else if (data.type === 'listing_approval' || data.type === 'listing_rejection') {
    path = data.listingId
      ? `/my-listings/${data.listingId}`
      : '/my-listings';
  }

  return path;
}

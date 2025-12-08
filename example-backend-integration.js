const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

async function sendPushNotification({ deviceId, type, title, body, listingId, messageId }) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        deviceId,
        type,
        title,
        body,
        listingId,
        messageId,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Notification sent successfully:', data);
      return data;
    } else {
      console.error('Failed to send notification:', data);
      throw new Error(data.error || 'Failed to send notification');
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
}

async function notifyNewMessage(deviceId, senderName, messageId) {
  return sendPushNotification({
    deviceId,
    type: 'new_message',
    title: 'New Message',
    body: `You have a new message from ${senderName}`,
    messageId,
  });
}

async function notifyListingApproval(deviceId, listingTitle, listingId) {
  return sendPushNotification({
    deviceId,
    type: 'listing_approval',
    title: 'Listing Approved',
    body: `Your listing "${listingTitle}" has been approved`,
    listingId,
  });
}

async function notifyListingRejection(deviceId, listingTitle, reason, listingId) {
  return sendPushNotification({
    deviceId,
    type: 'listing_rejection',
    title: 'Listing Needs Attention',
    body: `Your listing "${listingTitle}" needs revisions: ${reason}`,
    listingId,
  });
}

module.exports = {
  sendPushNotification,
  notifyNewMessage,
  notifyListingApproval,
  notifyListingRejection,
};

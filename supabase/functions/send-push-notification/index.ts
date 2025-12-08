import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotificationRequest {
  deviceId: string;
  type: 'listing_approval' | 'listing_rejection' | 'new_message';
  title: string;
  body: string;
  listingId?: string;
  messageId?: string;
}

interface ExpoPushMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data: any;
  badge?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: NotificationRequest = await req.json();
    const { deviceId, type, title, body, listingId, messageId } = payload;

    if (!deviceId || !type || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const notificationData: any = {
      type,
    };

    if (listingId) {
      notificationData.listingId = listingId;
    }

    if (messageId) {
      notificationData.messageId = messageId;
    }

    const { data: eventData, error: eventError } = await supabase
      .from('notification_events')
      .insert({
        device_id: deviceId,
        notification_type: type,
        title,
        body,
        data: notificationData,
        sent: false,
      })
      .select()
      .single();

    if (eventError) {
      console.error('Error creating notification event:', eventError);
      return new Response(
        JSON.stringify({ error: 'Failed to create notification event' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: tokenData, error: tokenError } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .eq('device_id', deviceId)
      .eq('active', true)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.error('No active push token found for device:', deviceId);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Notification event created but no active push token found',
          eventId: eventData.id 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const message: ExpoPushMessage = {
      to: tokenData.expo_push_token,
      sound: 'default',
      title,
      body,
      data: notificationData,
    };

    if (type === 'new_message') {
      message.badge = 1;
    }

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const expoData = await expoResponse.json();

    if (expoData.data && expoData.data.status === 'ok') {
      await supabase
        .from('notification_events')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('id', eventData.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Notification sent successfully',
          eventId: eventData.id,
          expoTicketId: expoData.data.id
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      console.error('Expo push notification failed:', expoData);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send push notification',
          details: expoData 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Error in send-push-notification function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
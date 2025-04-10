// Netlify serverless function to handle deploy-success webhook
import { schedule } from '@netlify/functions';

export const handler = async (event) => {
  try {
    // Verify the webhook signature
    const expectedToken = process.env.NETLIFY_WEBHOOK_SECRET;
    const authHeader = event.headers['x-webhook-signature'];
    
    if (!authHeader || authHeader !== expectedToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Schedule newsletter delivery for 2 minutes after deployment
    const twoMinutesFromNow = new Date(Date.now() + 2 * 60 * 1000);
    
    // Format the time for the schedule function
    const minutes = twoMinutesFromNow.getUTCMinutes();
    const hours = twoMinutesFromNow.getUTCHours();
    
    // Create a one-time schedule for newsletter delivery
    const scheduleExpression = `${minutes} ${hours} * * *`;
    
    // Schedule the newsletter delivery
    await schedule(scheduleExpression, async () => {
      const functionUrl = process.env.URL 
        ? `${process.env.URL}/.netlify/functions/newsletter-background`
        : 'http://localhost:8888/.netlify/functions/newsletter-background';

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NETLIFY_FUNCTION_SECRET || 'local-dev'}`
        }
      });

      if (!response.ok) {
        throw new Error(`Newsletter delivery failed: ${response.status}`);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Newsletter delivery scheduled successfully',
        scheduledTime: twoMinutesFromNow.toISOString()
      })
    };
  } catch (error) {
    console.error('Deploy webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
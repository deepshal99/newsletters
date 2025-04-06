import { sendDailyNewsletter } from './newsletter.js';

export const handler = async () => {
  try {
    console.log('TEST MODE: Starting newsletter background function');
    await sendDailyNewsletter({ testMode: true });
    console.log('TEST MODE: Newsletter sent successfully');
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, testMode: true })
    };
  } catch (error) {
    console.error('TEST MODE Background error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, testMode: true })
    };
  }
};
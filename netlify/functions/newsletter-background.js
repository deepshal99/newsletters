import { sendDailyNewsletter } from './newsletter.js';

export const handler = async () => {
  try {
    await sendDailyNewsletter();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Background newsletter error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
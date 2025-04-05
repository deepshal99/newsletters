import { schedule } from '@netlify/functions';
import { sendDailyNewsletter } from './newsletter.js';

// Schedule newsletter to run at 2:05 AM IST (20:35 UTC) daily
export const handler = schedule({
  name: 'scheduled-newsletter',
  schedule: '35 20 * * *' // UTC time (20:35 UTC = 2:05 AM IST)
}, async (event) => {
  try {
    await sendDailyNewsletter();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Newsletter sent successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
});
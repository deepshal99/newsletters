import 'dotenv/config';
import { sendDailyNewsletter } from './netlify/functions/newsletter.js';

(async () => {
  try {
    console.log('Starting newsletter test...');
    await sendDailyNewsletter();
    console.log('Newsletter executed successfully');
  } catch (error) {
    console.error('Error executing newsletter:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
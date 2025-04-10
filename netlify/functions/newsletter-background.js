import { schedule } from '@netlify/functions';
import { sendDailyNewsletter } from './newsletter.js';

// Schedule the function to run daily at 17:35
export const handler = schedule("35 17 * * *", async (event) => {
    try {
        console.log('Scheduled function triggered');
        const result = await sendDailyNewsletter();
        console.log('sendDailyNewsletter result:', result);
        return result;
    } catch (error) {
        console.error('Error in scheduled function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Scheduled function failed', details: error.message })
        };
    }
});

console.log("Scheduled function configured.");
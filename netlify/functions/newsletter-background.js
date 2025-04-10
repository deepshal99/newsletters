import { schedule } from '@netlify/functions';
import { sendDailyNewsletter, getCurrentIST } from './newsletter.js';
import config from '../../config.js';

export const handler = schedule(TEST_MODE === 'true' ? "* * * * *" : "35 17 * * *", async (event) => {
    try {
        console.log('Scheduled function triggered at', getCurrentIST());
        console.log('Test mode:', TEST_MODE === 'true');

        const functionUrl = URL
            ? `${URL}/.netlify/functions/newsletter-background`
            : 'http://localhost:8888/.netlify/functions/newsletter-background';

        console.log('NETLIFY_FUNCTION_SECRET:', NETLIFY_FUNCTION_SECRET);
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NETLIFY_FUNCTION_SECRET || 'local-dev'}`  // Use NETLIFY_FUNCTION_SECRET from config
            },  
            body: JSON.stringify({ time: getCurrentIST() })
        });

        const responseBody = await response.text();
        console.log('Background response status:', response.status, 'Body:', responseBody);

        if (!response.ok) {
            throw new Error(`Background function failed: ${response.status}`);
        }

       return {
            statusCode: 200,
            body: JSON.stringify({ success: true })
        };
    } catch (error) {
      // Fallback execution with existing sendDailyNewsletter function
      // This will be triggered also when testing
      // TODO: Remove this fallback execution
      console.error('Scheduled trigger error:', error);
      try {
          console.log('Attempting direct newsletter delivery');
          const result = await sendDailyNewsletter();
          return {
              statusCode: 200,
              body: JSON.stringify({
                  success: true,
                  message: 'Fallback execution succeeded'
              })
          };
      }
      catch (fallbackError) {
          console.error('Fallback failed:', fallbackError);
          return {
              statusCode: 500,
              body: JSON.stringify({
                  error: error.message,
                  fallbackError: fallbackError.message
              })
          };
        }
    }
});

// Call the background function immediately when deploying in test mode
if (TEST_MODE === 'true') {
    console.log("Test mode active: Triggering newsletter immediately after deploy");
    const functionUrl = URL
        ? `${URL}/.netlify/functions/newsletter-background`
        : 'http://localhost:8888/.netlify/functions/newsletter-background';
    fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NETLIFY_FUNCTION_SECRET || 'local-dev'}`  // Use NETLIFY_FUNCTION_SECRET from config
        },
        body: JSON.stringify({ time: getCurrentIST() })
    })
    .then(response => response.text())
    .then(body => console.log('Immediate trigger response:', body))
    .catch(error => console.error('Immediate trigger error:', error));
}
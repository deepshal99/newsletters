import { sendDailyNewsletter } from './newsletter.js';

export const handler = async (event) => {
  // Verify authorization header
  const expectedToken = process.env.NETLIFY_FUNCTION_SECRET || 'local-dev';
  const authHeader = event.headers.authorization;
  
  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return {
      statusCode: 401,
      body: 'Unauthorized'
    };
  }

  try {
    // Use existing sendDailyNewsletter function
    const result = await sendDailyNewsletter();
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Background error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
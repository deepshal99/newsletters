// Netlify serverless function to handle deploy-success webhook
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

    // Call the newsletter background function
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
      body: JSON.stringify({
        message: 'Newsletter delivery triggered successfully',
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Deploy webhook error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
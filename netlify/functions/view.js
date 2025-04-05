// Netlify serverless function for viewing database contents
import * as db from "../../database.js";

exports.handler = async (event, _context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get all active subscriptions
    const subscriptions = await db.getSubscriptions();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(subscriptions)
    };
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
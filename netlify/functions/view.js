// Netlify serverless function for viewing database contents
import * as db from "../../database.js";
import dotenv from 'dotenv';

// Try to load environment variables from .env file for local development
try {
  dotenv.config();
} catch (error) {
  console.log('No .env file found, using environment variables');
}

// Initialize logger
const log = (...args) => {
  console.log(`[${new Date().toISOString()}] VIEW:`, ...args);
};

export const handler = async (event, _context) => {
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
    log('Fetching all active subscriptions');
    const subscriptions = await db.getSubscriptions();
    
    log(`Successfully retrieved ${subscriptions.length} subscriptions`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(subscriptions)
    };
  } catch (error) {
    log('Error fetching subscriptions:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
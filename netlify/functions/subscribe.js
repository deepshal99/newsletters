// Netlify serverless function for handling subscriptions
import { Resend } from 'resend';
import * as db from "../../database.js";
import dotenv from 'dotenv';

// Try to load environment variables from .env file for local development
try {
  dotenv.config();
} catch (error) {
  console.log('No .env file found, using environment variables');
}

// Initialize Resend with API key from environment variable
const resend = new Resend(process.env.RESEND_API_KEY);

export const handler = async (event, _context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { email, handle } = JSON.parse(event.body);
    
    if (!email || !handle) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email and handle are required' })
      };
    }

    // Convert single handle to array if necessary
    const handles = Array.isArray(handle) ? handle : [handle];

    // Add subscription to database
    await db.addSubscription(email, handles);

    // Send confirmation email
    const confirmationEmail = {
      from: 'ByteSize <hello@autodm.in>',
      to: email,
      subject: 'Subscription Confirmation',
      text: `You are now subscribed to @${handles.join(', @')}.

You will receive your daily newsletter at ${process.env.SCHEDULE_TIME || '20:50'} IST.`
    };

    await resend.emails.send(confirmationEmail);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: `Successfully subscribed ${email} to @${handles.join(', @')}. Check your inbox for confirmation!` })
    };
  } catch (error) {
    console.error('Subscription error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
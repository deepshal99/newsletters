// Netlify serverless function for sending newsletters
import { Rettiwt } from 'rettiwt-api';
import { Resend } from 'resend';
import OpenAI from 'openai';
import * as db from "../../database.js";
import dotenv from 'dotenv';

// Configure dotenv
dotenv.config();

// Try to load environment variables from .env file for local development
try {
  dotenv.config();
} catch (error) {
  console.log('No .env file found, using environment variables');
}

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Rettiwt with API key
let rettiwt;

try {
    if (!process.env.RETTIWT_API_KEY) {
        throw new Error('RETTIWT_API_KEY environment variable is not set');
    }
    rettiwt = new Rettiwt({ apiKey: process.env.RETTIWT_API_KEY });
} catch (error) {
    console.error('Error initializing Rettiwt:', error.message);
}

// Function to get current time in IST
function getCurrentIST() {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
}

// Function to fetch tweets from last 24 hours
// Add pagination configuration
const LIMIT_PER_PAGE = 20;
const MAX_PAGES = 3;
const API_TIMEOUT = 5000; // 5 seconds

// Helper function with timeout handling
async function withTimeout(promise, timeout) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}

// Modified fetchRecentTweetsForHandles with pagination
async function fetchRecentTweetsForHandles(handles) {
  const allTweets = [];
  
  // Process handles in parallel
  await Promise.all(handles.map(async (handle) => {
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      try {
        const tweets = await withTimeout(
          rettiwt.tweet.search({
            fromUsers: [handle],
            words: [],
            limit: LIMIT_PER_PAGE,
            page: page
          }),
          API_TIMEOUT
        );

        const categorized = segregateTweet(tweets.list);
        allTweets.push(...categorized.mainTweets);
        
        hasMore = tweets.list.length === LIMIT_PER_PAGE;
        page++;

        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error fetching page ${page} for @${handle}:`, error.message);
        break;
      }
    }
  }));
  return allTweets;
}

// Function to segregate tweets into main tweets and replies
function segregateTweet(tweets) {
    const categorizedTweets = {
        mainTweets: [],
        replies: []
    };

    tweets.forEach(tweet => {
        if (tweet.replyTo === undefined) {
            // Categorize as main tweet
            categorizedTweets.mainTweets.push(tweet);
        } else {
            // Categorize as reply
            categorizedTweets.replies.push(tweet);
        }
    });

    return categorizedTweets;
}

// Function to summarize tweets using OpenAI
// Modified summarizeTweets with caching
const summaryCache = new Map();

async function summarizeTweets(tweets) {
  // Handle empty tweets case
  if (!tweets || tweets.length === 0) return '';

  try {
      // Group tweets by username
      const groupedTweets = {};
      tweets.forEach(tweet => {
          const username = tweet.tweetBy.userName;
          if (!groupedTweets[username]) {
              groupedTweets[username] = [];
          }
          groupedTweets[username].push(tweet);
      });

      let summary = 'Your daily personalized newsletter\n\n';

      // Generate summary for each user
      // Process all users in parallel
      const summaries = await Promise.all(
        Object.entries(groupedTweets).map(async ([username, userTweets]) => {
          const tweetTexts = userTweets.map(tweet => tweet.fullText).join('\n\n');
          
          // Generate cache key with date
          const cacheKey = `${username}-${new Date().toISOString().slice(0,10)}`;
          
          if (summaryCache.has(cacheKey)) {
            return summaryCache.get(cacheKey);
          }

          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `Generate concise HTML tweet summary in this structure:
<div style="background:white; border:1px solid #eee; border-radius:8px; padding:16px; margin-bottom:16px; box-shadow:0 2px 4px rgba(0,0,0,0.05)">
  <h2>📢 @${username}</h2>
  <ul>{{tweet_points}}</ul>
</div>`
              },
              {
                role: "user",
                content: `Summarize tweets from @${username} into a structured HTML block suitable for embedding in a modern email newsletter. Follow the style and structure exactly as described above. Use concise bullet points with <strong> emphasis, and wrap the entire summary in a styled <div>.\n\nTweets:\n${tweetTexts}`
              }
            ],
            temperature: 0.7,
            max_tokens: 300
          });

          const content = completion.choices[0].message.content;
          summaryCache.set(cacheKey, content);
          return content;
        })
      );

      summary = summaries.join('\n\n');
      return summary;
  } catch (error) {
      console.error('Error summarizing tweets:', error);
      throw error;
  }
}

// Helper function for exponential backoff retry
async function retryWithBackoff(operation, maxRetries = 3, initialDelay = 1000) {
    let retries = 0;
    while (true) {
        try {
            return await operation();
        } catch (error) {
            if (error?.statusCode === 429 && retries < maxRetries) {
                const delay = initialDelay * Math.pow(2, retries);
                console.log(`Rate limit hit. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
            } else {
                throw error;
            }
        }
    }
}

// Function to send daily newsletter
export async function sendDailyNewsletter(options = {}) {
    const testMode = options.testMode || false;
    try {
        console.log('Starting daily newsletter process at', getCurrentIST());
        console.log('Environment check - RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
        
        // Get all active subscriptions
        const subscriptions = await db.getSubscriptions();
        
        if (subscriptions.length === 0) {
            console.log('No active subscriptions found');
            return { message: 'No active subscriptions found' };
        }

        // Group subscriptions by email
        const groupedSubscriptions = {};
        subscriptions.forEach(sub => {
            if (!groupedSubscriptions[sub.email]) {
                groupedSubscriptions[sub.email] = [];
            }
            groupedSubscriptions[sub.email].push(sub.handle);
        });

        // Process each email's subscriptions
        // Process all emails in parallel
        await Promise.all(Object.entries(groupedSubscriptions).map(async ([email, handles]) => {
            console.log(`Processing newsletter for ${email}`);

            // Parallel fetch and process
            const [tweets, cachedSummary] = await Promise.all([
                fetchRecentTweetsForHandles(handles),
                summarizeTweets([]) // Get cached empty template
            ]);

            // Simplified email template
            const emailContent = `
                <div style="max-width:600px; margin:0 auto; padding:20px;">
                    <h1 style="color:#1DA1F2; margin-bottom:0;">ByteSized News</h1>
                    <p style="color:#657786; margin-top:0;">${new Date().toLocaleDateString('en-IN')} Digest</p>
                    ${tweets.length > 0 ? await summarizeTweets(tweets) : cachedSummary}
                </div>
            `;

            const emailData = {
                from: 'ByteSize <hello@autodm.in>',
                to: email,
                subject: 'Your Daily Twitter Digest',
                html: emailContent
            };

            try {
                console.log(`Attempting to send email to ${email} at ${getCurrentIST()}`);
                if (!testMode) {
                    // Add rate limiting delay between email sends
                    await new Promise(resolve => setTimeout(resolve, 500)); // Ensure we don't exceed 2 requests/second
                    
                    const { data, error } = await retryWithBackoff(
                        async () => await resend.emails.send(emailData)
                    );
                    
                    if (error) {
                        console.error('Resend API Error Details:', {
                            statusCode: error.statusCode,
                            name: error.name,
                            message: error.message,
                            headers: error.headers
                        });
                        throw new Error(`Failed to send email: ${error.message} (code ${error.statusCode})`);
                    }
                    
                    if (!data || !data.id) {
                        console.error('Unexpected Resend API response:', data);
                        throw new Error('Invalid response from Resend API');
                    }
                    
                    console.log(`Newsletter successfully sent to ${email} at ${getCurrentIST()}`);
                    console.log('Email ID:', data.id);
                } else {
                    console.log('TEST MODE: Would send email to', email);
                }
            } catch (error) {
                console.error('Email sending failed:', error);
                throw new Error(`Email delivery failed: ${error.message}`);
            }
        }));
        
        return { message: 'Newsletters sent successfully' };
    } catch (error) {
        console.error('Error in daily newsletter:', error);
        throw error;
    }
}

import { schedule } from '@netlify/functions';

export const handler = schedule("35 17 * * *", async (event) => { // 17:35 UTC = 11:05 PM IST
  try {
    console.log('Scheduled function triggered at', getCurrentIST());
    
    // Added environment check
    const functionUrl = process.env.URL 
      ? `${process.env.URL}/.netlify/functions/newsletter-background`
      : 'http://localhost:8888/.netlify/functions/newsletter-background';

    console.log('Attempting to trigger background function at:', functionUrl);
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NETLIFY_FUNCTION_SECRET || 'local-dev'}`
      }
    });

    // Added response body logging
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
    console.error('Scheduled trigger error:', error);
    
    // Fallback execution with existing sendDailyNewsletter function
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
    } catch (fallbackError) {
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

// Remove the stray text at the end of the file
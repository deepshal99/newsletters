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

// Get current file path and directory in ES modules


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
async function fetchRecentTweetsForHandles(handles) {
    try {
        console.log(`Fetching tweets for ${handles.length} handles`);
        const allTweets = [];
    
        // Helper function to segregate tweets into main tweets and replies
        // deno-lint-ignore no-inner-declarations
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

        for (const handle of handles) {
            console.log(`Fetching tweets for handle: @${handle}`);
            const tweets = await rettiwt.tweet.search({
                fromUsers: [handle],
                words: [],
                limit: 100
            });

            const categorizedTweets = segregateTweet(tweets.list);
            console.log(`Found ${categorizedTweets.mainTweets.length} main tweets and ${categorizedTweets.replies.length} replies for @${handle}`);
            allTweets.push(...categorizedTweets.mainTweets);
        }

        return allTweets;
    } catch (error) {
        console.error('Error fetching tweets:', error);
        throw error;
    }
}

// Function to summarize tweets using OpenAI
async function summarizeTweets(tweets) {
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
        for (const [username, userTweets] of Object.entries(groupedTweets)) {
            const tweetTexts = userTweets.map(tweet => tweet.fullText).join('\n\n');

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                      role: "system",
                      content: `You are an assistant that summarizes tweets from a Twitter user and formats them into modern, clean HTML suitable for embedding in an email newsletter. 
                  
                  Follow this structure strictly:
                  - Do NOT include <html>, <head>, or <body> tags.
                  - Wrap each summary in a <div> block with:
                    - white background
                    - light border
                    - border-radius
                    - padding and subtle shadow
                  - Use an <h2> tag for the Twitter handle header with an emoji (📢).
                  - Use <ul> with <li> for bullet points.
                  - Use <strong> to highlight key phrases or ideas.
                  - If applicable, include links using <a> tags with a blue color.
                  - Return only the single block for one Twitter handle—do not combine multiple handles or return plain text.`
                    },
                    {
                      role: "user",
                      content: `Summarize tweets from @${username} into a structured HTML block suitable for embedding in a modern email newsletter. Follow the style and structure exactly as described above. Use concise bullet points with <strong> emphasis, and wrap the entire summary in a styled <div>.\n\nTweets:\n${tweetTexts}`
                    }
                  ],
                temperature: 0.7,
                max_tokens: 300
            });

            summary += `Updates from @${username}\n`;
            summary += completion.choices[0].message.content + '\n\n';
        }

        return summary;
    } catch (error) {
        console.error('Error summarizing tweets:', error);
        throw error;
    }
}

// Function to send daily newsletter
export async function sendDailyNewsletter() {
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
        for (const [email, handles] of Object.entries(groupedSubscriptions)) {
            console.log(`Processing newsletter for ${email} with handles: ${handles.join(', ')}`);

            // Fetch tweets for all handles
            const tweets = await fetchRecentTweetsForHandles(handles);
            console.log(`Found ${tweets.length} tweets for ${email}`);

            // Summarize tweets
            const summary = await summarizeTweets(tweets);

            // Send email
            const emailContent = `
                <html>
                    <body style="font-family: Arial, sans-serif;">
                        <h1 style="color: #1DA1F2; text-align: center;">ByteSized News</h1>
                        <p style="text-align: center; color: #657786;">Your daily tech digest from 4:30 PM IST:</p>
                        
                        <div style="max-width: 800px; margin: 0 auto;">
                            ${summary}
                        </div>
                    </body>
                </html>
            `;

            const emailData = {
                from: 'ByteSize <hello@autodm.in>',
                to: email,
                subject: 'Your Daily Twitter Digest',
                html: emailContent
            };

            try {
                console.log(`Attempting to send email to ${email} at ${getCurrentIST()}`);
                const { data, error } = await resend.emails.send(emailData);
                
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
            } catch (error) {
                console.error('Email sending failed:', error);
                throw new Error(`Email delivery failed: ${error.message}`);
            }
        }
        
        return { message: 'Newsletters sent successfully' };
    } catch (error) {
        console.error('Error in daily newsletter:', error);
        throw error;
    }
}

import { schedule } from '@netlify/functions';

export const handler = schedule("0 11 * * *", async () => {
  try {
    await sendDailyNewsletter();
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Scheduled newsletter error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
});
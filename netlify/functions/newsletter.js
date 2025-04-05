// Netlify serverless function for sending newsletters
import { Rettiwt } from 'rettiwt-api';
import { Resend } from 'resend';
import OpenAI from 'openai';
import * as db from "../../database.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Use different variable names to avoid conflicts with imported modules
const functionFilePath = fileURLToPath(import.meta.url);
const functionDirPath = dirname(functionFilePath);

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
async function sendDailyNewsletter() {
    try {
        console.log('Starting daily newsletter process at', getCurrentIST());
        
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
                        <p style="text-align: center; color: #657786;">Your Daily Twitter Digest</p>
                        
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

            await resend.emails.send(emailData);
            console.log(`Newsletter sent to ${email} at ${getCurrentIST()}`);
        }
        
        return { message: 'Newsletters sent successfully' };
    } catch (error) {
        console.error('Error in daily newsletter:', error);
        throw error;
    }
}

exports.handler = async (event, _context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const result = await sendDailyNewsletter();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Newsletter error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
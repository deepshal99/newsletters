import process from "node:process";
import { Rettiwt } from 'rettiwt-api';
import { Resend } from 'resend';
import OpenAI from 'openai';
import http from 'http';
import url from 'url';
import * as db from "./database.js";
import fs from 'fs';
import { OPENAI_API_KEY, RETTIWT_API_KEY, RESEND_API_KEY } from './config.js';

// Initialize OpenAI with API key
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});

// Initialize Resend with your API key
const resend = new Resend(RESEND_API_KEY);

// Initialize Rettiwt with API key
let rettiwt;

try {
    console.log('Initializing Rettiwt...');
  
    if (!RETTIWT_API_KEY) {
        throw new Error('RETTIWT_API_KEY environment variable is not set');
    }

    rettiwt = new Rettiwt({ apiKey: RETTIWT_API_KEY });
} catch (error) {
    console.error('Error initializing Rettiwt:', error.message);
    throw new Error(`Failed to initialize Rettiwt API: ${error.message}. Please check your API key configuration.`);
}

// Function to get current time in IST
function getCurrentIST() {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
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

        // Predefined HTML newsletter style
        let summary = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 10px;">
                <h1 style="text-align: center; color: #333;">Your Daily Twitter Digest</h1>
                <p style="text-align: center; color: #555;">Here are the latest updates from your favorite Twitter handles:</p>
        `;

        // Generate summary for each user
        for (const [username, userTweets] of Object.entries(groupedTweets)) {
            const tweetTexts = userTweets.map(tweet => tweet.fullText).join('\n\n');

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an assistant that summarizes tweets into concise bullet points. Return each point as a separate line.`
                    },
                    {
                        role: "user",
                        content: `Summarize the following tweets from @${username}:\n\n${tweetTexts}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 300
            });

            // Convert raw text into HTML bullet points
            const bulletPoints = completion.choices[0].message.content
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => `<li>${line.trim()}</li>`)
                .join('');

            summary += `
                <div style="background-color: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <h2 style="color: #007bff;">📢 Updates from @${username}</h2>
                    <ul style="color: #333; line-height: 1.6;">
                        ${bulletPoints}
                    </ul>
                </div>
            `;
        }

        summary += `
            <p style="text-align: center; color: #777; font-size: 12px;">Thank you for subscribing to ByteSize!</p>
            </div>
        `;

        return summary;
    } catch (error) {
        console.error('Error summarizing tweets:', error);
        throw error;
    }
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

async function sendDailyNewsletter() {
    try {
        console.log('[Newsletter] Starting newsletter process');
        const startTime = Date.now();
        
        // 1. Get all subscriptions
        console.time('[Newsletter] Database query');
        const subscriptions = await db.getSubscriptions();
        console.timeEnd('[Newsletter] Database query');
        console.log(`[Newsletter] Found ${subscriptions.length} subscriptions`);

        // 2. Process each subscription
        for (const [index, sub] of subscriptions.entries()) {
            const subStart = Date.now();
            console.log(`[Newsletter] Processing ${index + 1}/${subscriptions.length}: ${sub.email} (${sub.handles.length} handles)`);
            
            try {
                // 3. Fetch tweets
                console.time(`[Newsletter] Tweet fetch ${sub.email}`);
                const tweets = await fetchRecentTweetsForHandles(sub.handles);
                console.timeEnd(`[Newsletter] Tweet fetch ${sub.email}`);
                console.log(`[Newsletter] Fetched ${tweets.length} tweets for ${sub.email}`);

                // 4. Summarize tweets
                console.time(`[Newsletter] Summarization ${sub.email}`);
                const summary = await summarizeTweets(tweets);
                console.timeEnd(`[Newsletter] Summarization ${sub.email}`);
                console.log(`[Newsletter] Generated summary for ${sub.email}`);

                // 5. Send email
                console.time(`[Newsletter] Email send ${sub.email}`);
                const emailData = {
                    from: 'ByteSize <hello@autodm.in>',
                    to: sub.email,
                    subject: `Your Twitter Digest - ${new Date().toLocaleDateString('en-IN')}`,
                    html: summary
                };
                
                const emailResponse = await resend.emails.send(emailData);
                console.timeEnd(`[Newsletter] Email send ${sub.email}`);
                console.log(`[Newsletter] Email sent to ${sub.email}`, emailResponse.id);
                
                // 6. Update last sent time
                await db.updateLastSent(sub.user_id);
                
            } catch (error) {
                console.error(`[Newsletter] Failed processing ${sub.email}:`, error);
                await db.logError(sub.user_id, `Delivery failed: ${error.message}`);
                continue; // Continue with next subscription
            }
            
            console.log(`[Newsletter] Completed ${sub.email} in ${Date.now() - subStart}ms`);
        }
        
        console.log(`[Newsletter] Completed all subscriptions in ${Date.now() - startTime}ms`);
    } catch (error) {
        console.error('[Newsletter] Critical failure:', error);
        throw error;
    }
}

// Schedule daily newsletter at 10:50 PM IST
import cron from 'node-cron';
cron.schedule('50 17 * * *', () => { // 17:50 UTC = 11:20 PM IST
    console.log('Cron: Starting scheduled newsletter delivery');
    sendDailyNewsletter().catch(error => {
        console.error('Cron: Newsletter job failed:', error);
    });
}, {
    timezone: 'Asia/Kolkata'
});

// Function to subscribe email to handles
async function subscribeEmailToHandles(email, handle) {
    try {
        // Input validation
        if (!email || !handle) {
            throw new Error('Email and handle are required');
        }

        // Ensure database connection is established
        await db.getDb();
        // Convert single handle to array if necessary
        const handles = Array.isArray(handle) ? handle : [handle];

        // Add subscription to database
        const userId = await db.addSubscription(email, handles);
        if (!userId) {
            throw new Error('Failed to add subscription to database');
        }

        // Send confirmation email
        const confirmationEmail = {
            from: 'ByteSize <hello@autodm.in>',
            to: email,
            subject: 'Subscription Confirmation',
            text: `You are now subscribed to @${handles.join(', @')}.

You will receive your daily newsletter at 2:10 AM IST.`  // You can modify this time here
        };

        const emailResponse = await resend.emails.send(confirmationEmail);
        if (!emailResponse) {
            console.error('Warning: Email confirmation may not have been sent');
        }
        console.log('Subscription successful:', { email, handles, userId });

        return `Successfully subscribed ${email} to @${handles.join(', @')}. Check your inbox for confirmation!`;
    } catch (error) {
        console.error('Subscription error:', error);
        throw error;
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/subscribe') {
        try {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', async () => {
                const { email, handle } = JSON.parse(body);
                const result = await subscribeEmailToHandles(email, handle);
                
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ message: result }));
            });
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else if (parsedUrl.pathname === '/') {
        // Serve the main HTML file from public directory
        fs.readFile('public/index.html', (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading page');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
                res.end(content);
            }
        });
    } else if (parsedUrl.pathname === '/view') {
        // View database contents
        try {
            const subscriptions = await db.getSubscriptions();
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(subscriptions));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Listen on port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('View database at http://localhost:3000/view');
});
// Netlify serverless function for sending newsletters
import { Resend } from 'resend';
import OpenAI from 'openai';
import { OPENAI_API_KEY, RESEND_API_KEY, getCurrentIST } from '../../config.js';
import { getSubscriptions } from '../../database.js';
import { fetchRecentTweetsForHandles } from './tweetService.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const resend = new Resend(RESEND_API_KEY);
const summaryCache = new Map();

async function summarizeTweets(tweets) {
  // Handle empty tweets case
  if (!tweets || tweets.length === 0) return '';

  try {
      const groupedTweets = {};
      tweets.forEach(tweet => {
        const username = tweet.tweetBy.userName;
        if (!groupedTweets[username]) {
          groupedTweets[username] = [];
        }
        groupedTweets[username].push(tweet);
      });

      let summary = 'Your daily personalized newsletter\n\n';
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

export async function sendDailyNewsletter(options = {}) {
    const testMode = options.testMode || false;
    try {
        console.log('Starting daily newsletter process at', getCurrentIST());
        console.log('Environment check - RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
        
        // Get all active subscriptions
        let subscriptions;
        try {
          subscriptions = await retryWithBackoff(getSubscriptions);
          console.log(`subscriptions: ${JSON.stringify(subscriptions)}`);
          if (subscriptions.length === 0) {
            return { message: 'No active subscriptions found' };
          }
        } catch (error) {
          console.error('Error getting subscriptions', error);
          throw error;
        }
        const groupedSubscriptions = subscriptions.reduce((groups, sub) => ({ ...groups, [sub.email]: [...(groups[sub.email] || []), sub.handle] }), {});
    
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
                        console.error(`Resend API Error Details for ${email}:`, {
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
        
        return { message: 'Newsletters sent successfully', sentCount: Object.keys(groupedSubscriptions).length };
    } catch (error) {
        throw new Error(`Error in daily newsletter: ${error.message}`);
    }
}
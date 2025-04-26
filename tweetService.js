import { Rettiwt } from 'rettiwt-api';
import config from './config.js';

const { RETTIWT_API_KEY } = config;

// Add pagination configuration

let rettiwt;

try {
    rettiwt = new Rettiwt({ apiKey: RETTIWT_API_KEY });
} catch (error) {
    console.error('Error initializing Rettiwt:', error.message);
}


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
  const RATE_LIMIT_DELAY = 2000; // 2 seconds between handles

  // Process handles sequentially
  for (const handle of handles) {
    let page = 1;
    let hasMore = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY = 5000;

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

        // Add delay between pages for same handle
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error fetching page ${page} for @${handle}:`, error.message);
        
        // Handle rate limits with exponential backoff
        if (error.message.includes('rate limit') && retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.log(`Rate limit hit, waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }
        break;
      }
    }
    
    // Add delay between different handles
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
  }
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

export { fetchRecentTweetsForHandles, segregateTweet, rettiwt };
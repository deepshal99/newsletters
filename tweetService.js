import { Rettiwt } from 'rettiwt-api';

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
async function fetchRecentTweetsForHandles(handles, rettiwt) {
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

export { fetchRecentTweetsForHandles, segregateTweet };
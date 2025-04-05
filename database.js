import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

// Variable to store connection status
let isConnected = false;

// Connect to the Supabase database
async function connectToDatabase() {
  if (isConnected) return supabase;
  
  try {
    // Check if URL and KEY are available
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Supabase connection credentials are not configured');
    }

    // Test connection with a simple query
    const { error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    
    if (error) {
      throw new Error(`Failed to connect to Supabase: ${error.message}`);
    }
    
    console.log('Connected to Supabase successfully');
    isConnected = true;
    return supabase;
  } catch (error) {
    console.error('Failed to connect to Supabase:', error);
    isConnected = false;
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

// Helper function to get database connection
const getDb = async () => {
  return await connectToDatabase();
};

// Get handles by email
const getHandlesByEmail = async (email) => {
  try {
    const db = await connectToDatabase();
    
    // First get the user
    const { data: user, error: userError } = await db
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (userError || !user) {
      return [];
    }
    
    // Then get the subscriptions for this user
    const { data: subscriptions, error: subError } = await db
      .from('subscriptions')
      .select('handle')
      .eq('user_id', user.id)
      .eq('is_active', true);
    
    if (subError) {
      throw subError;
    }
    
    return subscriptions.map(sub => sub.handle);
  } catch (error) {
    console.error('Error getting handles by email:', error);
    throw error;
  }
};

// Add subscription
const addSubscription = async (email, handle) => {
  // Input validation
  if (!email || !handle) {
    throw new Error('Email and handle are required');
  }
  
  // Convert single handle to array if necessary
  const handles = Array.isArray(handle) ? handle : [handle];
  
  try {
    const db = await connectToDatabase();
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }
    
    // First get or create the user
    let { data: user, error: userError } = await db
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (userError && userError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw userError;
    }
    
    if (!user) {
      // User doesn't exist, create new user
      const { data: newUser, error: insertError } = await db
        .from('users')
        .insert({
          email,
          preferences: '',
          created_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        })
        .select('id')
        .single();
      
      if (insertError) {
        throw insertError;
      }
      
      user = newUser;
    }
    
    // Process each handle
    for (const h of handles) {
      // Check if subscription already exists
      const { data: existingSub, error: subError } = await db
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('handle', h)
        .single();
      
      if (subError && subError.code !== 'PGRST116') { // Not a "not found" error
        throw subError;
      }
      
      if (existingSub) {
        // Subscription exists, update it to active
        const { error: updateError } = await db
          .from('subscriptions')
          .update({ is_active: true })
          .eq('id', existingSub.id);
        
        if (updateError) {
          throw updateError;
        }
      } else {
        // Create new subscription
        const { error: insertError } = await db
          .from('subscriptions')
          .insert({
            user_id: user.id,
            handle: h,
            is_active: true
          });
        
        if (insertError) {
          throw insertError;
        }
      }
    }
    
    return user.id;
  } catch (error) {
    console.error('Error adding subscription:', error);
    throw error;
  }
};

// Save tweets
const saveTweets = async (tweets, email, handle) => {
  try {
    const db = await connectToDatabase();
    
    if (!tweets || tweets.length === 0) {
      return 0;
    }
    
    // Prepare tweets for insertion
    const tweetsToInsert = tweets.map(tweet => ({
      tweet_id: tweet.id,
      handle: handle,
      content: JSON.stringify(tweet),
      processed: false,
      created_at: new Date().toISOString()
    }));
    
    // Supabase doesn't have a direct equivalent to MongoDB's bulkWrite with upsert
    // We'll need to handle this differently
    
    // First, get existing tweet IDs to avoid duplicates
    const tweetIds = tweets.map(tweet => tweet.id);
    const { data: existingTweets, error: selectError } = await db
      .from('tweets')
      .select('tweet_id')
      .in('tweet_id', tweetIds);
    
    if (selectError) {
      throw selectError;
    }
    
    // Filter out tweets that already exist
    const existingIds = existingTweets.map(t => t.tweet_id);
    const newTweets = tweetsToInsert.filter(t => !existingIds.includes(t.tweet_id));
    
    if (newTweets.length === 0) {
      return 0;
    }
    
    // Insert new tweets
    const { error: insertError, count } = await db
      .from('tweets')
      .insert(newTweets);
    
    if (insertError) {
      throw insertError;
    }
    
    return newTweets.length;
  } catch (error) {
    console.error('Error saving tweets:', error);
    throw error;
  }
};

// Get all active subscriptions
const getSubscriptions = async () => {
  try {
    const db = await connectToDatabase();
    
    const { data: subscriptions, error } = await db
      .from('subscriptions')
      .select('handle, users!inner(email)')
      .eq('is_active', true);
    
    if (error) {
      throw error;
    }
    
    return subscriptions.map(sub => ({
      email: sub.users.email,
      handle: sub.handle
    }));
  } catch (error) {
    console.error('Error getting subscriptions:', error);
    throw error;
  }
};

export {
    getDb,
    getHandlesByEmail,
    addSubscription,
    saveTweets,
    getSubscriptions
};

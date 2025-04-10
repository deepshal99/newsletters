import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Try to load environment variables from .env file for local development
try {
  dotenv.config();
} catch (error) {
  console.log('No .env file found, using environment variables');
}

// Get Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

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
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
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
        .select('id, is_active')
        .eq('user_id', user.id)
        .eq('handle', h)
        .single();
      
      if (subError && subError.code !== 'PGRST116') { // Not a "not found" error
        throw subError;
      }
      
      if (existingSub && existingSub.is_active) {
        // Subscription already exists and is active, no action needed
        console.log(`Subscription for ${email} to ${h} already exists and is active.`);
      } else if (existingSub) {
        // Subscription exists but is inactive, update it to active
        const { error: updateError } = await retryWithBackoff(\n            async () => await db\n              .from('subscriptions')\n              .update({ is_active: true })\n              .eq('id', existingSub.id)\n          );\n          \n          if (updateError) {\n            throw updateError;\n          }\n          console.log(`Reactivated subscription for ${email} to ${h}`);
      } else {
        // Subscription does not exist, create new subscription
        const { error: insertError } = await retryWithBackoff(\n          async () => await db\n            .from('subscriptions')\n            .insert({\n              user_id: user.id,\n              handle: h,\n              is_active: true\n            })\n        );\n\n        if (insertError) {\n          // Check for unique constraint violation\n          if (insertError.code === '23505') {\n              console.error(`Unique constraint violation for user ${user.id} and handle ${h}:`, insertError.message);\n          } else {\n              // Other database error, rethrow\n              throw insertError;\n          }\n        }\n\n        if (insertError) {\n          throw insertError;\n        }\n        console.log(`Created new subscription for ${email} to ${h}`);
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

// Helper function for exponential backoff retry\nasync function retryWithBackoff(operation, maxRetries = 3, initialDelay = 1000) {\n  let retries = 0;\n  while (true) {\n      try {\n          return await operation();\n      } catch (error) {\n          if (retries < maxRetries) {\n              const delay = initialDelay * Math.pow(2, retries);\n              console.log(`Database operation failed. Retrying in ${delay}ms...`);\n              await new Promise(resolve => setTimeout(resolve, delay));\n              retries++;\n          } else {\n              throw error;\n          }\n      }\n  }\n}

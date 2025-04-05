-- Supabase Schema for Twitter Newsletter Application
-- This schema replaces the MongoDB collections with Supabase tables

-- Users table (replaces MongoDB users collection)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  preferences TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscriptions table (replaces MongoDB subscriptions collection)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(user_id, handle)
);

-- Tweets table (replaces MongoDB tweets collection)
CREATE TABLE IF NOT EXISTS tweets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tweet_id TEXT UNIQUE NOT NULL,
  handle TEXT NOT NULL,
  content JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_handle ON subscriptions(handle);
CREATE INDEX IF NOT EXISTS idx_subscriptions_is_active ON subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_tweets_handle ON tweets(handle);
CREATE INDEX IF NOT EXISTS idx_tweets_processed ON tweets(processed);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tweets ENABLE ROW LEVEL SECURITY;

-- Create policies for secure access
-- These policies can be adjusted based on your application's security requirements
CREATE POLICY "Users are viewable by authenticated users" ON users FOR SELECT USING (true);
CREATE POLICY "Subscriptions are viewable by authenticated users" ON subscriptions FOR SELECT USING (true);
CREATE POLICY "Tweets are viewable by authenticated users" ON tweets FOR SELECT USING (true);
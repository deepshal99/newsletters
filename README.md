# ByteSize - Twitter Summary App

ByteSize is an application that fetches tweets using Rettiwt API, summarizes them using OpenAI's GPT-3.5, and sends email summaries to users.

## Features

- Fetch tweets from any Twitter user using Rettiwt API
- Automatically summarize tweets using GPT-3.5
- Send email summaries with "ByteSize" as the sender name
- Save tweets to a local database

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your API keys:
```
RETTIWT_API_KEY=your_rettiwt_api_key
OPENAI_API_KEY=your_openai_api_key
RESEND_API_KEY=your_resend_api_key
```

3. Start the server:
```bash
node fetchTweets.js
```

## API Keys

- Rettiwt API key for fetching tweets
- OpenAI API key for tweet summarization
- Resend API key for sending emails

## Usage

The server runs on `http://localhost:3000` and provides endpoints for:
- Fetching tweets
- Viewing database contents
- Sending email summaries

## Deployment

To deploy this application to Vercel:

1. Create a GitHub repository and push your code
2. Create a Vercel account if you don't have one
3. Connect your GitHub account to Vercel
4. Import your repository
5. Set up environment variables in Vercel dashboard:
   - RETTIWT_API_KEY
   - OPENAI_API_KEY
   - RESEND_API_KEY

The application will be automatically deployed and started on Vercel.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your API keys:
```bash
cp .env.example .env
```

3. Start the application:
```bash
npm start
```

The application will be running at `http://localhost:3000`

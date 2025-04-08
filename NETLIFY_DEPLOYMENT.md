# Deploying ByteSize to Netlify

This guide explains how to deploy the ByteSize Twitter Summary application to Netlify.

## Prerequisites

- A Netlify account
- Your API keys for:
  - Rettiwt API
  - OpenAI API
  - Resend API
  - Supabase URL and Key

## Deployment Steps

### 1. Push Your Code to a Git Repository

First, push your code to a Git repository (GitHub, GitLab, or Bitbucket).

### 2. Connect to Netlify

1. Log in to your Netlify account
2. Click "New site from Git"
3. Select your Git provider and repository
4. Configure build settings:
   - Build command: `npm install`
   - Publish directory: `public`

### 3. Configure Environment Variables

Add these required environment variables in Netlify's UI:
- RETTIWT_API_KEY
- RESEND_API_KEY
- OPENAI_API_KEY

### 4. Deploy Your Site

Click "Deploy site" in the Netlify dashboard. Netlify will build and deploy your application.

### 5. Set Up Scheduled Functions (Optional)

To run the newsletter function on a schedule:

1. Install Netlify CLI: `npm install -g netlify-cli`
2. Create a scheduled function in your `netlify.toml` file:

```toml
[functions]
  newsletter-background = { 
    source = "netlify/functions/newsletter-background.js",
    timeout = 900, 
    background = true,
    schedule = "10 17 * * *" # 10:40 PM IST
  }
```



Add environment variable in Netlify dashboard:

3. Deploy the updated configuration: `netlify deploy --prod`

## Testing Your Deployment

1. Visit your Netlify site URL
2. Test the subscription form
3. Check the database view at `https://your-site-name.netlify.app/view`
4. Manually trigger the newsletter function at `https://your-site-name.netlify.app/.netlify/functions/newsletter`

## Troubleshooting

- Check Netlify function logs in the Netlify dashboard under Functions > Your function name
- Verify environment variables are correctly set
- Ensure your Supabase database is accessible from Netlify's servers

## Additional Resources

- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Netlify Environment Variables](https://docs.netlify.com/configure-builds/environment-variables/)
- [Scheduled Functions with Netlify](https://docs.netlify.com/functions/scheduled-functions/)
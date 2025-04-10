import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config();

const requiredVariables = [
    'NETLIFY_FUNCTION_SECRET',
    'OPENAI_API_KEY',
    'RESEND_API_KEY',
    'RETTIWT_API_KEY',
    'SUPABASE_KEY',
    'SUPABASE_URL',
    'TEST_MODE',
    'URL'
];

const config = {};

for (const variable of requiredVariables) {
    const value = process.env[variable];
    if (value === undefined) {
        throw new Error(`Environment variable ${variable} is not set.`);
    }
    config[variable] = value;
}

export default config;
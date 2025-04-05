import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from "node:process";
import dotenv from 'dotenv';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, '.env') });

// Export environment variables
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const RETTIWT_API_KEY = process.env.RETTIWT_API_KEY;
export const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Supabase configuration
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;
import 'dotenv/config';
import { Rettiwt } from 'rettiwt-api';

// Utility function to safely log API keys (showing only first few chars)
function safeLogKey(key, label) {
  if (!key) return `${label}: Not found`;
  const firstChars = key.substring(0, 10);
  const lastChars = key.length > 20 ? key.substring(key.length - 5) : '';
  const length = key.length;
  return `${label}: ${firstChars}...${lastChars} (length: ${length})`;
}

// Validate API key format
function validateApiKeyFormat(key) {
  if (!key) return { valid: false, reason: 'API key is missing' };
  
  // Check for common format issues
  if (key.includes('\n')) return { valid: false, reason: 'Contains newline character' };
  if (key.includes(' ')) return { valid: false, reason: 'Contains spaces' };
  if (key.startsWith('"') || key.endsWith('"')) return { valid: false, reason: 'Contains quotes' };
  
  // Check for expected patterns in Rettiwt API key
  // The key should contain certain segments separated by semicolons
  const hasExpectedFormat = key.includes(';') && 
                          (key.includes('auth_token=') || 
                           key.includes('kdt='));
  
  if (!hasExpectedFormat) {
    return { valid: false, reason: 'Does not match expected Rettiwt key format' };
  }
  
  return { valid: true };
}

// Test Rettiwt API connection with detailed error reporting
async function testRettiwt() {
  console.log('\n=== RETTIWT API CONNECTION TEST ===');
  
  // 1. Check if API key exists
  const apiKey = process.env.RETTIWT_API_KEY;
  console.log('API Key present:', !!apiKey);
  
  // 2. Validate API key format
  const validation = validateApiKeyFormat(apiKey);
  console.log('API Key format validation:', validation.valid ? 'PASSED' : 'FAILED');
  if (!validation.valid) {
    console.log('Validation failure reason:', validation.reason);
    console.log(safeLogKey(apiKey, 'Current key'));
    return false;
  }
  
  // 3. Test initialization
  let rettiwt;
  try {
    console.log('Attempting to initialize Rettiwt client...');
    rettiwt = new Rettiwt({ apiKey });
    console.log('Rettiwt client initialized successfully');
  } catch (error) {
    console.error('INITIALIZATION ERROR:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
    return false;
  }
  
  // 4. Test API call
  try {
    console.log('Testing API with a simple query...');
    const testUser = 'twitter'; // A known user that should exist
    const result = await rettiwt.user.details(testUser);
    console.log(`API TEST SUCCESSFUL: Retrieved data for @${testUser}`);
    console.log('User ID:', result.userId);
    console.log('Username:', result.userName);
    return true;
  } catch (error) {
    console.error('API CALL ERROR:', error.message);
    
    // Categorize error
    if (error.message.includes('authenticate') || error.message.includes('auth')) {
      console.error('AUTHENTICATION ERROR: The API key appears to be invalid or expired');
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      console.error('RATE LIMIT ERROR: Too many requests');
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      console.error('NETWORK ERROR: Check your internet connection');
    }
    
    // Log detailed error information
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    if (error.stack) {
      console.error('Stack trace:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
    
    return false;
  }
}

// Run the test
(async () => {
  try {
    const success = await testRettiwt();
    if (success) {
      console.log('\n✅ Rettiwt API authentication test PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ Rettiwt API authentication test FAILED');
      process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error during test:', error);
    process.exit(1);
  }
})();
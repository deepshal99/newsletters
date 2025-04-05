import { schedule } from '@netlify/functions';
import { sendDailyNewsletter } from './newsletter.js';

// Convert HH:MM format to cron expression for IST
function scheduleAt(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) {
    throw new Error('Invalid IST time format. Use HH:MM');
  }
  
  // Convert IST to UTC (IST is UTC+5:30)
  let totalMinutes = hours * 60 + minutes;
  totalMinutes -= 330; // Subtract 5h30m for UTC conversion
  if (totalMinutes < 0) totalMinutes += 1440; // Handle day wrap-around
  
  const utcHours = Math.floor(totalMinutes / 60);
  const utcMinutes = totalMinutes % 60;
  
  return `${utcMinutes} ${utcHours} * * *`;
}

// Schedule newsletter to run at 20:47 IST daily
export const handler = schedule({
  name: 'scheduled-newsletter',
  schedule: scheduleAt(process.env.SCHEDULE_TIME || '20:50')
}, async (event) => { // Uses SCHEDULE_TIME env variable in HH:MM IST format
  try {
    await sendDailyNewsletter();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Newsletter sent successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
});
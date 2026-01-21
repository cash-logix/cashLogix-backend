const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// ============================================
// EMAIL PROVIDER CONFIGURATION
// ============================================
// Change this variable to switch between email providers:
// 'gmail' - Use Gmail SMTP (smtp.gmail.com)
// 'private' - Use Private Email (mail.privateemail.com)
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'gmail'; // Default to Gmail
// ============================================

// Simple in-memory email queue for failed emails
let emailQueue = [];
let isProcessingQueue = false; // Flag to prevent concurrent processing
const QUEUE_FILE = path.join(__dirname, '../data/email_queue.json');

// Load email queue from file on startup
const loadEmailQueue = async () => {
  try {
    const data = await fs.readFile(QUEUE_FILE, 'utf8');
    emailQueue = JSON.parse(data);
    console.log(`Loaded ${emailQueue.length} emails from queue`);
  } catch (error) {
    console.log('No existing email queue found, starting fresh');
    emailQueue = [];
  }
};

// Save email queue to file
const saveEmailQueue = async () => {
  try {
    await fs.mkdir(path.dirname(QUEUE_FILE), { recursive: true });
    await fs.writeFile(QUEUE_FILE, JSON.stringify(emailQueue, null, 2));
  } catch (error) {
    console.error('Failed to save email queue:', error);
  }
};

// Add email to queue for retry
const addToQueue = async (mailOptions) => {
  const emailItem = {
    id: Date.now() + Math.random(),
    mailOptions,
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttempt: new Date().toISOString()
  };

  emailQueue.push(emailItem);
  await saveEmailQueue();
  console.log(`Added email to queue: ${mailOptions.to}`);
};

// Process email queue
const processEmailQueue = async () => {
  // Prevent concurrent processing
  if (isProcessingQueue || emailQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  try {
    console.log(`Processing ${emailQueue.length} emails from queue`);

    // Create transporter once for all emails to avoid multiple log messages
    const transporter = createEmailTransport();

    for (let i = emailQueue.length - 1; i >= 0; i--) {
      const emailItem = emailQueue[i];

      try {
        await transporter.sendMail(emailItem.mailOptions);

        console.log(`Successfully sent queued email to ${emailItem.mailOptions.to}`);
        emailQueue.splice(i, 1); // Remove from queue

      } catch (error) {
        emailItem.attempts++;
        emailItem.lastAttempt = new Date().toISOString();

        console.error(`Failed to send queued email (attempt ${emailItem.attempts}):`, error.message);

        // Remove from queue after 5 attempts
        if (emailItem.attempts >= 5) {
          console.error(`Removing email from queue after 5 failed attempts: ${emailItem.mailOptions.to}`);
          emailQueue.splice(i, 1);
        }
      }
    }

    await saveEmailQueue();
  } finally {
    isProcessingQueue = false;
  }
};

// Initialize queue processing
loadEmailQueue();

// Process queue every 1 minute (faster processing)
setInterval(processEmailQueue, 1 * 60 * 1000);

// Email transport configurations optimized for fast failure detection
const createEmailTransport = () => {
  const provider = EMAIL_PROVIDER.toLowerCase();

  let configs = [];

  if (provider === 'gmail') {
    // Gmail SMTP configurations
    configs = [
      // Configuration 1: Gmail SMTP with STARTTLS (recommended)
      {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use STARTTLS
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
        },
        connectionTimeout: 3000,
        greetingTimeout: 2000,
        socketTimeout: 5000,
        pool: false,
        maxConnections: 1,
        maxMessages: 1,
        tls: {
          rejectUnauthorized: false
        }
      },
      // Configuration 2: Gmail SMTP with SSL
      {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // Use SSL
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
        },
        connectionTimeout: 3000,
        greetingTimeout: 2000,
        socketTimeout: 5000,
        pool: false,
        maxConnections: 1,
        maxMessages: 1,
        tls: {
          rejectUnauthorized: false
        }
      },
      // Configuration 3: Gmail service (fallback)
      {
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
        },
        connectionTimeout: 3000,
        greetingTimeout: 2000,
        socketTimeout: 5000,
        pool: false,
        maxConnections: 1,
        maxMessages: 1,
        tls: {
          rejectUnauthorized: false
        }
      }
    ];
  } else if (provider === 'private') {
    // Private Email configurations
    configs = [
      // Configuration 1: Private Email SMTP with STARTTLS
      {
        host: 'mail.privateemail.com',
        port: 587,
        secure: false, // Use STARTTLS
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
        },
        connectionTimeout: 3000,
        greetingTimeout: 2000,
        socketTimeout: 5000,
        pool: false,
        maxConnections: 1,
        maxMessages: 1,
        tls: {
          rejectUnauthorized: false,
          ciphers: 'SSLv3'
        }
      },
      // Configuration 2: Private Email SMTP with SSL
      {
        host: 'mail.privateemail.com',
        port: 465,
        secure: true, // Use SSL
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
        },
        connectionTimeout: 3000,
        greetingTimeout: 2000,
        socketTimeout: 5000,
        pool: false,
        maxConnections: 1,
        maxMessages: 1,
        tls: {
          rejectUnauthorized: false,
          ciphers: 'SSLv3'
        }
      }
    ];
  } else {
    throw new Error(`Unknown email provider: ${EMAIL_PROVIDER}. Use 'gmail' or 'private'.`);
  }

  // Try configurations in order
  for (let i = 0; i < configs.length; i++) {
    try {
      const transporter = nodemailer.createTransport(configs[i]);
      console.log(`Using ${provider.toUpperCase()} email provider (config ${i + 1})`);
      return transporter;
    } catch (error) {
      // Only log error if this is the last config attempt
      if (i === configs.length - 1) {
        console.error(`All ${provider.toUpperCase()} configurations failed. Last error: ${error.message}`);
        throw error;
      }
    }
  }
};

// Send email with email provider optimized for fast failure
const sendEmailWithFallback = async (mailOptions, retryCount = 0) => {
  const maxRetries = 1; // Reduced from 3 to 1

  try {
    const transporter = createEmailTransport();

    // Skip connection test in production to avoid timeouts
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) {
      // Ultra-quick connection test with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), 2000); // 2 seconds (was 5)
      });

      try {
        await Promise.race([transporter.verify(), timeoutPromise]);
        console.log(`${EMAIL_PROVIDER.toUpperCase()} connection verified successfully`);
      } catch (verifyError) {
        console.log(`${EMAIL_PROVIDER.toUpperCase()} connection verification skipped:`, verifyError.message);
        // Continue anyway - sometimes verification fails but sending works
      }
    }

    const result = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${mailOptions.to}`);
    return result;

  } catch (error) {
    console.error(`Email sending failed (attempt ${retryCount + 1}/${maxRetries}):`, error.message);

    if (retryCount < maxRetries - 1) {
      console.log(`Retrying email send in 3 seconds...`); // Reduced from 10 to 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      return sendEmailWithFallback(mailOptions, retryCount + 1);
    } else {
      console.error('Email sending failed after all retries, adding to queue');
      // Add to queue for later retry
      await addToQueue(mailOptions);
      throw error;
    }
  }
};

// Test email connection
const testEmailConnection = async () => {
  try {
    const transporter = createEmailTransport();

    // Quick connection test
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection test timeout')), 10000);
    });

    await Promise.race([transporter.verify(), timeoutPromise]);
    console.log(`${EMAIL_PROVIDER.toUpperCase()} connection test successful`);
    return true;

  } catch (error) {
    console.error(`${EMAIL_PROVIDER.toUpperCase()} connection test failed:`, error.message);
    return false;
  }
};

// Get email account info
const getEmailAccountInfo = async () => {
  try {
    console.log(`${EMAIL_PROVIDER.toUpperCase()} Account Info:`, {
      provider: EMAIL_PROVIDER,
      email: process.env.EMAIL_USER,
      hasPassword: !!process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
    });

    return {
      provider: EMAIL_PROVIDER,
      email: process.env.EMAIL_USER,
      hasPassword: !!process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
    };

  } catch (error) {
    console.error(`Error getting ${EMAIL_PROVIDER.toUpperCase()} account info:`, error.message);
    return null;
  }
};

module.exports = {
  // New function names
  createEmailTransport,
  sendEmailWithFallback,
  addToQueue,
  processEmailQueue,
  loadEmailQueue,
  testEmailConnection,
  getEmailAccountInfo,
  // Backward compatibility (deprecated - use new names)
  createGmailTransport: createEmailTransport,
  testGmailConnection: testEmailConnection,
  getGmailAccountInfo: getEmailAccountInfo
};
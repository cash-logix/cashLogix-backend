const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// Simple in-memory email queue for failed emails
let emailQueue = [];
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
  if (emailQueue.length === 0) return;

  console.log(`Processing ${emailQueue.length} emails from queue`);

  for (let i = emailQueue.length - 1; i >= 0; i--) {
    const emailItem = emailQueue[i];

    try {
      const transporter = createGmailTransporter();
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
};

// Initialize queue processing
loadEmailQueue();

// Process queue every 5 minutes
setInterval(processEmailQueue, 5 * 60 * 1000);

// Gmail SMTP configurations optimized for Railway (free)
const createGmailTransporter = () => {
  // Try different Gmail configurations optimized for Railway
  const configs = [
    // Configuration 1: Gmail SMTP with minimal settings (best for Railway)
    {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use STARTTLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 15000, // 15 seconds
      greetingTimeout: 5000,    // 5 seconds
      socketTimeout: 15000,     // 15 seconds
      pool: false,              // Disable pooling
      maxConnections: 1,        // Single connection
      maxMessages: 1,           // One message per connection
      tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      }
    },
    // Configuration 2: Gmail SMTP with SSL
    {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // Use SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 15000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
      pool: false,
      maxConnections: 1,
      maxMessages: 1,
      tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      }
    },
    // Configuration 3: Gmail service with minimal settings
    {
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 15000,
      greetingTimeout: 5000,
      socketTimeout: 15000,
      pool: false,
      maxConnections: 1,
      maxMessages: 1,
      tls: {
        rejectUnauthorized: false
      }
    }
  ];

  // Try configurations in order
  for (let i = 0; i < configs.length; i++) {
    try {
      const transporter = nodemailer.createTransport(configs[i]);
      console.log(`Gmail configuration ${i + 1} created successfully`);
      return transporter;
    } catch (error) {
      console.error(`Gmail configuration ${i + 1} failed:`, error.message);
      if (i === configs.length - 1) {
        throw error;
      }
    }
  }
};

// Send email with Gmail SMTP optimized for Railway
const sendEmailWithFallback = async (mailOptions, retryCount = 0) => {
  const maxRetries = 3;

  try {
    const transporter = createGmailTransporter();

    // Skip connection test in production to avoid timeouts
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) {
      // Quick connection test with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), 5000); // 5 seconds
      });

      try {
        await Promise.race([transporter.verify(), timeoutPromise]);
        console.log('Gmail connection verified successfully');
      } catch (verifyError) {
        console.log('Gmail connection verification skipped:', verifyError.message);
        // Continue anyway - sometimes verification fails but sending works
      }
    }

    const result = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${mailOptions.to}`);
    return result;

  } catch (error) {
    console.error(`Email sending failed (attempt ${retryCount + 1}/${maxRetries}):`, error.message);

    if (retryCount < maxRetries - 1) {
      console.log(`Retrying email send in 10 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      return sendEmailWithFallback(mailOptions, retryCount + 1);
    } else {
      console.error('Email sending failed after all retries, adding to queue');
      // Add to queue for later retry
      await addToQueue(mailOptions);
      throw error;
    }
  }
};

module.exports = {
  createGmailTransporter,
  sendEmailWithFallback,
  addToQueue,
  processEmailQueue,
  loadEmailQueue
};
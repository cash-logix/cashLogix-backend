const nodemailer = require('nodemailer');

// Alternative email configurations for production
const createProductionTransporter = () => {
  // Try different configurations based on environment
  const configs = [
    // Configuration 1: Gmail with enhanced settings
    {
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      rateDelta: 20000,
      rateLimit: 3,
      secure: true,
      tls: {
        rejectUnauthorized: false
      }
    },
    // Configuration 2: SMTP with explicit settings
    {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      rateDelta: 20000,
      rateLimit: 3,
      tls: {
        rejectUnauthorized: false
      }
    },
    // Configuration 3: SMTP with SSL
    {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      rateDelta: 20000,
      rateLimit: 3,
      tls: {
        rejectUnauthorized: false
      }
    }
  ];

  // Try configurations in order
  for (let i = 0; i < configs.length; i++) {
    try {
      const transporter = nodemailer.createTransport(configs[i]);
      console.log(`Email configuration ${i + 1} created successfully`);
      return transporter;
    } catch (error) {
      console.error(`Email configuration ${i + 1} failed:`, error.message);
      if (i === configs.length - 1) {
        throw error;
      }
    }
  }
};

// Test email connection
const testEmailConnection = async (transporter) => {
  try {
    await transporter.verify();
    console.log('Email connection verified successfully');
    return true;
  } catch (error) {
    console.error('Email connection verification failed:', error.message);
    return false;
  }
};

// Send email with multiple transporter fallback
const sendEmailWithFallback = async (mailOptions, retryCount = 0) => {
  const maxRetries = 3;

  try {
    const transporter = createProductionTransporter();

    // Test connection first
    const isConnected = await testEmailConnection(transporter);
    if (!isConnected) {
      throw new Error('Email connection verification failed');
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
      console.error('Email sending failed after all retries:', error);
      throw error;
    }
  }
};

module.exports = {
  createProductionTransporter,
  testEmailConnection,
  sendEmailWithFallback
};
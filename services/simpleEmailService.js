const nodemailer = require('nodemailer');

// Ultra-simple Gmail service optimized for Railway
const createSimpleEmailService = () => {
  // Minimal Gmail configuration that works best in Railway
  const config = {
    host: 'mail.privateemail.com',
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    // Ultra-fast configuration for Railway
    connectionTimeout: 2000, // 2 seconds (was 10)
    greetingTimeout: 1000,   // 1 second (was 3)
    socketTimeout: 3000,     // 3 seconds (was 10)
    // Disable everything that might cause issues
    pool: false,
    maxConnections: 1,
    maxMessages: 1,
    // Minimal TLS settings
    tls: {
      rejectUnauthorized: false,
      ciphers: 'SSLv3'
    }
  };

  return nodemailer.createTransport(config);
};

// Send email with ultra-simple configuration
const sendSimpleEmail = async (mailOptions) => {
  try {
    const transporter = createSimpleEmailService();

    // No verification, just send directly
    const result = await transporter.sendMail(mailOptions);
    console.log(`Simple email sent successfully to ${mailOptions.to}`);
    return result;

  } catch (error) {
    console.error('Simple email sending failed:', error.message);
    throw error;
  }
};

module.exports = {
  createSimpleEmailService,
  sendSimpleEmail
};
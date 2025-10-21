const nodemailer = require('nodemailer');

// Ultra-simple email service optimized for Railway
const createSimpleEmailService = () => {
  // Minimal configuration that works best in Railway
  const config = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    // Ultra-minimal configuration for Railway
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 3000,    // 3 seconds
    socketTimeout: 10000,     // 10 seconds
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

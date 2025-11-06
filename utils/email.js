const nodemailer = require('nodemailer');

// Check if email credentials are configured
const isEmailConfigured = process.env.EMAIL_USER && process.env.EMAIL_PASSWORD;

const transporter = isEmailConfigured ? nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
}) : null;

// Send email verification
exports.sendVerificationEmail = async (email, token, lang = 'en', type = 'user') => {
  const verificationUrl = `${process.env.CLIENT_URL}/${type}/verify-email?token=${token}`;

  if (!isEmailConfigured) {
    console.log('\n⚠️  EMAIL NOT CONFIGURED - Skipping email send');
    console.log(`📧 Verification link for ${email} (${type}):`);
    console.log(`${verificationUrl}\n`);
    return;
  }

  const subject = lang === 'ar' ? 'تأكيد البريد الإلكتروني' : 'Email Verification';
  const message = lang === 'ar'
    ? `مرحباً،\n\nيرجى النقر على الرابط التالي لتأكيد بريدك الإلكتروني:\n\n${verificationUrl}\n\nإذا لم تقم بإنشاء حساب، يرجى تجاهل هذا البريد.`
    : `Hello,\n\nPlease click the following link to verify your email:\n\n${verificationUrl}\n\nIf you didn't create an account, please ignore this email.`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Email send error:', error.message);
    console.log(`📧 Verification link for ${email} (${type}):`);
    console.log(`${verificationUrl}\n`);
  }
};

// Send password reset email
exports.sendPasswordResetEmail = async (email, token, lang = 'en', type = 'user') => {
  const resetUrl = `${process.env.CLIENT_URL}/${type}/reset-password?token=${token}`;

  if (!isEmailConfigured) {
    console.log('\n⚠️  EMAIL NOT CONFIGURED - Skipping email send');
    console.log(`📧 Password reset link for ${email} (${type}):`);
    console.log(`${resetUrl}\n`);
    return;
  }

  const subject = lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Password Reset';
  const message = lang === 'ar'
    ? `مرحباً،\n\nلقد طلبت إعادة تعيين كلمة المرور. يرجى النقر على الرابط التالي:\n\n${resetUrl}\n\nإذا لم تطلب ذلك، يرجى تجاهل هذا البريد.`
    : `Hello,\n\nYou requested a password reset. Please click the following link:\n\n${resetUrl}\n\nIf you didn't request this, please ignore this email.`;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Email send error:', error.message);
    console.log(`📧 Password reset link for ${email} (${type}):`);
    console.log(`${resetUrl}\n`);
  }
};


const nodemailer = require('nodemailer');

// Email configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // You can use other services like SendGrid, Mailgun, etc.
    auth: {
      user: process.env.EMAIL_USER || 'your-email@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-app-password'
    }
  });
};

// Send invitation email
const sendInvitationEmail = async (email, invitationData) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@cashlogix.com',
      to: email,
      subject: `Invitation to join ${invitationData.companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Cash Logix</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Financial Management Platform</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">You're Invited!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              You have been invited to join <strong>${invitationData.companyName}</strong> as a <strong>${invitationData.role}</strong>.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h3 style="color: #333; margin-top: 0;">Invitation Details:</h3>
              <ul style="color: #666; padding-left: 20px;">
                <li><strong>Company:</strong> ${invitationData.companyName}</li>
                <li><strong>Role:</strong> ${invitationData.role}</li>
                <li><strong>Department:</strong> ${invitationData.department}</li>
                <li><strong>Position:</strong> ${invitationData.position}</li>
                <li><strong>Invited by:</strong> ${invitationData.invitedBy}</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${invitationData.invitationLink}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;">
                Accept Invitation
              </a>
            </div>
            
            <p style="color: #999; font-size: 14px; text-align: center;">
              This invitation will expire in 7 days.<br>
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
            
            <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                This email was sent by Cash Logix. If you have any questions, please contact your company administrator.
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Invitation email sent:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending invitation email:', error);
    throw error;
  }
};

// Send notification email to company admin
const sendNotificationEmail = async (adminEmail, notificationData) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@cashlogix.com',
      to: adminEmail,
      subject: `Employee ${notificationData.action} - ${notificationData.employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Cash Logix</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Notification</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <h2 style="color: #333; margin-bottom: 20px;">Employee ${notificationData.action}</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              <strong>${notificationData.employeeName}</strong> has ${notificationData.action.toLowerCase()} the invitation to join your company.
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h3 style="color: #333; margin-top: 0;">Details:</h3>
              <ul style="color: #666; padding-left: 20px;">
                <li><strong>Employee:</strong> ${notificationData.employeeName}</li>
                <li><strong>Email:</strong> ${notificationData.employeeEmail}</li>
                <li><strong>Role:</strong> ${notificationData.role}</li>
                <li><strong>Department:</strong> ${notificationData.department}</li>
                <li><strong>Action:</strong> ${notificationData.action}</li>
                <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/companies/${notificationData.companyId}/employees" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 30px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;">
                View Employee Management
              </a>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Notification email sent:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending notification email:', error);
    throw error;
  }
};

module.exports = {
  sendInvitationEmail,
  sendNotificationEmail
};

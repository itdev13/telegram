const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');

// Configure multer for support attachments
const upload = multer({
  dest: 'uploads/support/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed (JPEG, PNG, GIF, WebP)'));
    }
  },
});

// Simple HTML escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createSupportRouter(ssoMiddleware) {
  const router = express.Router();

  // Email transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SUPPORT_EMAIL_USER,
      pass: process.env.SUPPORT_EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  // Verify email configuration on startup
  transporter.verify((error) => {
    if (error) {
      console.warn('⚠️  Email configuration issue:', error.message);
      console.warn('Support tickets will fail until email is properly configured');
      console.info('💡 Gmail users: Generate App Password at https://myaccount.google.com/apppasswords');
    } else {
      console.log('✅ Support email service ready');
    }
  });

  /**
   * @route POST /support/ticket
   * @desc Submit support ticket via email
   */
  router.post('/ticket', ssoMiddleware, upload.array('images', 5), async (req, res) => {
    try {
      const { name, email, subject, message, locationId, userId } = req.body;

      // Validation
      if (!email || !subject || !message) {
        return res.status(400).json({
          success: false,
          error: 'Email, subject, and message are required',
        });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format',
        });
      }

      console.log('Support ticket received', {
        email: escapeHtml(email),
        subject: escapeHtml(subject),
        locationId,
      });

      // Prepare email content
      const emailHtml = `
        <h2>New Support Ticket - TeleSync</h2>
        <hr/>
        <p><strong>From:</strong> ${escapeHtml(name || 'Not provided')}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Location ID:</strong> ${escapeHtml(locationId || 'Not provided')}</p>
        <p><strong>User ID:</strong> ${escapeHtml(userId || 'Not provided')}</p>
        <hr/>
        <h3>Message:</h3>
        <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
        ${req.files && req.files.length > 0 ? '<hr/><p><strong>Attachments:</strong> ' + req.files.length + ' image(s) attached</p>' : ''}
      `;

      // Prepare attachments
      const attachments = req.files
        ? req.files.map((file) => ({
            filename: file.originalname,
            path: file.path,
          }))
        : [];

      // Send email
      await transporter.sendMail({
        from: email,
        to: 'support@vaultsuite.store',
        subject: `[TeleSync Support] ${subject}`,
        html: emailHtml,
        attachments,
      });

      // Clean up uploaded files
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      console.log('✅ Support ticket sent successfully', { email });

      res.json({
        success: true,
        message: 'Support ticket submitted successfully. We will get back to you soon!',
      });
    } catch (error) {
      console.error('Support ticket error:', error);

      // Clean up files on error
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to submit support ticket',
        message: error.message || 'Failed to send email',
      });
    }
  });

  return router;
}

module.exports = { createSupportRouter };

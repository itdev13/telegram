const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const MEDIA_DIR = path.join(process.cwd(), 'tmp', 'media');
const MEDIA_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function createMediaRouter() {
  const router = Router();

  // Rate limiting to prevent abuse
  const mediaLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  router.use(mediaLimiter);

  // GET /media/:filename — serves temporary media files
  router.get('/:filename', (req, res) => {
    const { filename } = req.params;

    // Sanitize filename to prevent path traversal
    const sanitized = path.basename(filename);
    const filePath = path.join(MEDIA_DIR, sanitized);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    // Determine content type from extension
    const ext = path.extname(sanitized).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });

  return router;
}

// Clean up expired media files (called on startup and every 30 minutes)
function cleanupExpiredMedia() {
  if (!fs.existsSync(MEDIA_DIR)) return;

  const now = Date.now();
  try {
    const files = fs.readdirSync(MEDIA_DIR);
    for (const file of files) {
      const filePath = path.join(MEDIA_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > MEDIA_MAX_AGE_MS) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.warn('Media cleanup error:', err.message);
  }
}

module.exports = { createMediaRouter, cleanupExpiredMedia };

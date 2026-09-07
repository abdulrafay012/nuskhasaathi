const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const DASHSCOPE_BASE_URL = (
  process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
).replace(/\/+$/, '');

// Multer config for local uploads (fallback when OSS not configured)
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only image files (jpg, png, webp) are allowed.'));
  },
});

// POST /upload — Upload prescription image and run OCR
router.post('/', verifyToken, upload.single('prescription'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const imagePath = req.file.path;
    const imageUrl = `/uploads/${req.file.filename}`;

    // Call Qwen-VL for OCR, or use realistic demo data when no API key is configured
    let rawOcrText = '';
    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      console.log('Running in demo mode (no DASHSCOPE_API_KEY): using sample OCR text.');
      rawOcrText = `Dr. M. Ahmed, MBBS
Pt: Test Patient   Date: 04/09/26
Rx:
1. Tab Panado1 500 mg - 1 tab TDS x 5/7 (after meals)
2. Tab Augmentin 625mg - 1 BD x 7 days
3. Tab Brufan? 400 mg - 1 BD PC x 3 days
Review after one week.`;
    } else {
      // Read image as base64 for Qwen-VL
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const imageDataUrl = `data:image/${path.extname(req.file.originalname).slice(1)};base64,${base64Image}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(
          `${DASHSCOPE_BASE_URL}/chat/completions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'qwen-vl-plus',
              messages: [
                {
                  role: 'system',
                  content:
                    'You are an OCR assistant specialized in reading handwritten doctor prescriptions, which are often written quickly and in a mix of Urdu, English, and medical shorthand/abbreviations (e.g., "bd" = twice daily, "od" = once daily, "tds" = three times daily). Extract all visible text exactly as written, preserving line breaks. Do not interpret or translate yet — this step is extraction only. If a word is genuinely illegible, mark it as [unclear].',
                },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Extract all text from this prescription.' },
                    { type: 'image_url', image_url: { url: imageDataUrl } },
                  ],
                },
              ],
            }),
          }
        );

        const data = await response.json();
        rawOcrText = data.choices?.[0]?.message?.content || '';
      } catch (ocrErr) {
        if (ocrErr.name === 'AbortError') {
          console.error('OCR API error: AI service request timed out.');
        } else {
          console.error('OCR API error:', ocrErr);
        }
        rawOcrText = '[OCR service unavailable]';
      } finally {
        clearTimeout(timeout);
      }
    }

    // Save prescription to database
    const result = await pool.query(
      'INSERT INTO prescriptions (id, user_id, image_url, raw_ocr_text) VALUES ($1, $2, $3, $4) RETURNING *',
      [uuidv4(), req.user.id, imageUrl, rawOcrText]
    );

    const prescription = result.rows[0];

    res.json({
      message: 'Prescription uploaded and OCR completed',
      prescription: {
        id: prescription.id,
        image_url: prescription.image_url,
        raw_ocr_text: prescription.raw_ocr_text,
        uploaded_at: prescription.uploaded_at,
      },
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

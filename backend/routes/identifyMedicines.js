const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();
const DASHSCOPE_BASE_URL = (
  process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
).replace(/\/+$/, '');

// POST /identify-medicines — Structure OCR text into medicine list
router.post('/', verifyToken, async (req, res) => {
  try {
    const { prescription_id } = req.body;

    if (!prescription_id) {
      return res.status(400).json({ error: 'prescription_id is required.' });
    }

    // Fetch the prescription
    const prescriptionResult = await pool.query(
      'SELECT * FROM prescriptions WHERE id = $1 AND user_id = $2',
      [prescription_id, req.user.id]
    );

    if (prescriptionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    const prescription = prescriptionResult.rows[0];
    const rawOcrText = prescription.raw_ocr_text;

    if (!rawOcrText || rawOcrText === '[OCR service unavailable]') {
      return res.status(400).json({ error: 'No OCR text available for this prescription.' });
    }

    // Call Qwen to identify and structure medicines, or use demo data without an API key
    let medicines = [];
    const hasDashScopeKey = Boolean(process.env.DASHSCOPE_API_KEY?.trim());

    if (!hasDashScopeKey) {
      console.log('Running in demo mode (no DASHSCOPE_API_KEY): using sample medicines.');
      medicines = [
        {
          name: 'Panadol',
          dosage: '500mg',
          frequency: 'three times a day',
          duration: '5 days',
          confidence: 'confident',
        },
        {
          name: 'Augmentin',
          dosage: '625mg',
          frequency: 'twice a day',
          duration: '7 days',
          confidence: 'confident',
        },
        {
          name: 'Brufen',
          dosage: '400mg',
          frequency: 'twice a day',
          duration: '3 days',
          confidence: 'uncertain',
        },
      ];
    } else {
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
              model: 'qwen-plus',
              messages: [
                {
                  role: 'system',
                  content: `You are a medical assistant helping structure a handwritten prescription's raw OCR text into a clean list of medicines. You have general knowledge of common medicine names used in Pakistan (e.g., Panadol, Augmentin, Brufen, Disprin, Paracetamol, Amoxicillin).

For each medicine mentioned, output a JSON object with:
- "name": corrected medicine name (fix likely OCR misreads against common medicine names, e.g. "Paracetmol" → "Paracetamol")
- "dosage": e.g. "500mg" if mentioned, else null
- "frequency": plain description, e.g. "twice a day" (convert shorthand like "bd"/"od"/"tds")
- "duration": e.g. "5 days" if mentioned, else null
- "confidence": "confident" or "uncertain" — mark "uncertain" if the OCR text was unclear or the medicine name doesn't clearly match a known drug

Rules:
- Do not invent a medicine that isn't referenced in the text
- If truly unreadable, still include it with confidence "uncertain" and name as best guess, rather than silently dropping it
- Output ONLY a valid JSON array, no explanation, no markdown formatting`,
                },
                {
                  role: 'user',
                  content: `Here is the raw prescription text:\n"""\n${rawOcrText}\n"""`,
                },
              ],
            }),
          }
        );

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '[]';

        // Parse JSON from response (handle possible markdown code blocks)
        let cleanedContent = content.trim();
        if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        medicines = JSON.parse(cleanedContent);
      } catch (llmErr) {
        console.error('Medicine identification error:', llmErr);
        if (llmErr.name === 'AbortError') {
          return res.status(500).json({ error: 'AI service request timed out.' });
        }
        return res.status(500).json({ error: 'Failed to identify medicines from prescription text.' });
      } finally {
        clearTimeout(timeout);
      }
    }

    // Insert all medicines atomically in a single batch
    const client = await pool.connect();
    let insertedMedicines = [];
    try {
      await client.query('BEGIN');

      for (const med of medicines) {
        const result = await client.query(
          `INSERT INTO medicines (id, prescription_id, name, dosage, frequency, duration, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            uuidv4(),
            prescription_id,
            med.name,
            med.dosage || null,
            med.frequency || null,
            med.duration || null,
            med.confidence || 'uncertain',
          ]
        );
        insertedMedicines.push(result.rows[0]);
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    res.json({
      message: 'Medicines identified successfully',
      prescription_id,
      medicines: insertedMedicines,
    });
  } catch (err) {
    console.error('Identify medicines error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

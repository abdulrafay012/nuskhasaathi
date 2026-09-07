const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
const { buildSchedule } = require('./schedule');

const router = express.Router();

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

// GET /caregiver/token — authenticated patient gets their share token (creates one if missing)
router.get('/token', verifyToken, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT caregiver_token FROM users WHERE id = $1', [
      req.user.id,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let token = userResult.rows[0].caregiver_token;
    if (!token) {
      token = generateToken();
      await pool.query('UPDATE users SET caregiver_token = $1 WHERE id = $2', [
        token,
        req.user.id,
      ]);
    }

    res.json({
      token,
      sharePath: `/caregiver/${token}`,
    });
  } catch (err) {
    console.error('Error fetching caregiver token:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /caregiver/token/regenerate — authenticated patient invalidates old link and generates a fresh one
router.post('/token/regenerate', verifyToken, async (req, res) => {
  try {
    const newToken = generateToken();
    const result = await pool.query(
      'UPDATE users SET caregiver_token = $1 WHERE id = $2 RETURNING caregiver_token',
      [newToken, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      message: 'Caregiver share link regenerated successfully.',
      token: newToken,
      sharePath: `/caregiver/${newToken}`,
    });
  } catch (err) {
    console.error('Error regenerating caregiver token:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /caregiver/view/:token — PUBLIC ENDPOINT: Family member/caregiver views schedule & warnings without login
router.get('/view/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(404).json({ error: 'Caregiver link is invalid or expired.' });
    }

    const userResult = await pool.query(
      'SELECT id, name, age FROM users WHERE caregiver_token = $1',
      [token.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Caregiver link is invalid or expired.' });
    }

    const patient = userResult.rows[0];

    // Get the patient's most recent active prescription
    const prescriptionResult = await pool.query(
      'SELECT * FROM prescriptions WHERE user_id = $1 ORDER BY uploaded_at DESC LIMIT 1',
      [patient.id]
    );

    if (prescriptionResult.rows.length === 0) {
      return res.json({
        patient: {
          name: patient.name,
          age: patient.age,
        },
        prescription: null,
        slots: buildSchedule(null, []),
        medicines: [],
        interactionWarnings: [],
      });
    }

    const prescription = prescriptionResult.rows[0];

    const medicinesResult = await pool.query(
      'SELECT * FROM medicines WHERE prescription_id = $1 ORDER BY created_at',
      [prescription.id]
    );

    const interactionsResult = await pool.query(
      'SELECT * FROM interaction_flags WHERE prescription_id = $1 ORDER BY created_at',
      [prescription.id]
    );

    // Mock Adherence Score for Hackathon Demo
    const mockAdherenceScore = patient.id % 2 === 0 ? 94 : 88;
    const mockStreak = patient.id % 2 === 0 ? 7 : 3;

    res.json({
      patient: {
        name: patient.name,
        age: patient.age,
      },
      prescription: {
        id: prescription.id,
        image_url: prescription.image_url,
        uploaded_at: prescription.uploaded_at,
      },
      slots: buildSchedule(prescription, medicinesResult.rows),
      medicines: medicinesResult.rows,
      interactionWarnings: interactionsResult.rows,
      adherence: {
        score: mockAdherenceScore,
        streak: mockStreak,
        trend: '+2% from last week'
      }
    });
  } catch (err) {
    console.error('Error fetching caregiver view:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

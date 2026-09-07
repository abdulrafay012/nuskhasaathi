const express = require('express');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
const { checkCrossPrescriptionInteractions } = require('./instructions');

const router = express.Router();

// GET /history/cross-interactions — Scans for dangerous pairs across all active prescriptions
router.get('/cross-interactions', verifyToken, async (req, res) => {
  try {
    const prescriptionsResult = await pool.query(
      'SELECT id, uploaded_at FROM prescriptions WHERE user_id = $1 ORDER BY uploaded_at DESC',
      [req.user.id]
    );

    const prescriptions = prescriptionsResult.rows;
    if (prescriptions.length < 2) {
      return res.json({ cross_prescription_warnings: [] });
    }

    const prescriptionIds = prescriptions.map((p) => p.id);
    const placeholders = prescriptionIds.map(() => '?').join(', ');
    const medicinesResult = await pool.query(
      `SELECT id, prescription_id, name, dosage, frequency, duration FROM medicines WHERE prescription_id IN (${placeholders})`,
      prescriptionIds
    );

    const medsByRx = new Map();
    for (const med of medicinesResult.rows) {
      const list = medsByRx.get(med.prescription_id) || [];
      list.push(med);
      medsByRx.set(med.prescription_id, list);
    }

    const rxWithMeds = prescriptions.map((p) => ({
      ...p,
      medicines: medsByRx.get(p.id) || [],
    }));

    const warnings = checkCrossPrescriptionInteractions(rxWithMeds);
    res.json({ cross_prescription_warnings: warnings });
  } catch (err) {
    console.error('Cross-interactions error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /history — Return user's past prescriptions with medicines and interaction flags
router.get('/', verifyToken, async (req, res) => {
  try {
    // Fetch all prescriptions for this user
    const prescriptionsResult = await pool.query(
      'SELECT * FROM prescriptions WHERE user_id = $1 ORDER BY uploaded_at DESC',
      [req.user.id]
    );

    const prescriptions = prescriptionsResult.rows;
    const prescriptionIds = prescriptions.map((prescription) => prescription.id);

    // Batch-fetch all related rows to avoid per-prescription queries
    let medicinesResult = { rows: [] };
    let flagsResult = { rows: [] };

    if (prescriptionIds.length > 0) {
      const placeholders = prescriptionIds.map(() => '?').join(', ');
      [medicinesResult, flagsResult] = await Promise.all([
        pool.query(
          `SELECT * FROM medicines WHERE prescription_id IN (${placeholders}) ORDER BY created_at`,
          prescriptionIds
        ),
        pool.query(
          `SELECT * FROM interaction_flags WHERE prescription_id IN (${placeholders})`,
          prescriptionIds
        ),
      ]);
    }

    const medicinesByPrescription = new Map();
    for (const medicine of medicinesResult.rows) {
      const medicines = medicinesByPrescription.get(medicine.prescription_id) || [];
      medicines.push(medicine);
      medicinesByPrescription.set(medicine.prescription_id, medicines);
    }

    const flagsByPrescription = new Map();
    for (const flag of flagsResult.rows) {
      const flags = flagsByPrescription.get(flag.prescription_id) || [];
      flags.push(flag);
      flagsByPrescription.set(flag.prescription_id, flags);
    }

    const result = prescriptions.map((prescription) => ({
      id: prescription.id,
      image_url: prescription.image_url,
      raw_ocr_text: prescription.raw_ocr_text,
      uploaded_at: prescription.uploaded_at,
      medicines: medicinesByPrescription.get(prescription.id) || [],
      interaction_warnings: flagsByPrescription.get(prescription.id) || [],
    }));

    const crossWarnings = checkCrossPrescriptionInteractions(result);

    res.json({
      prescriptions: result,
      cross_prescription_warnings: crossWarnings,
    });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

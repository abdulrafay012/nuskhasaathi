const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');
// Reuses the interaction table and matcher that /instructions already owns, so
// there is exactly one definition of "dangerous pair" in the codebase.
const { checkInteractions } = require('./instructions');

const router = express.Router();

const EDITABLE_FIELDS = ['name', 'dosage', 'frequency'];
const FIELD_LABELS = { name: 'Medicine name', dosage: 'Dosage', frequency: 'Frequency' };

// Reads one editable field off the request body.
//   - key absent      -> undefined (leave the column alone)
//   - explicit null   -> null      (clear the column; not allowed for name)
//   - whitespace only -> validation error
function readField(body, key) {
  if (!(key in body)) return { value: undefined };

  const raw = body[key];

  if (raw === null) {
    if (key === 'name') {
      return { error: `${FIELD_LABELS[key]} cannot be empty.` };
    }
    return { value: null };
  }

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { error: `${FIELD_LABELS[key]} cannot be empty.` };
  }

  return { value: raw.trim() };
}

// PATCH /medicines/:id — patient corrects a medicine, or confirms it was read
// correctly. Either way the medicine becomes 'confident': the patient looking
// at the paper is a better authority than the model's own hedge.
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const body = req.body || {};

    // Ownership: join through prescriptions so a medicine belonging to another
    // patient is indistinguishable from one that does not exist — same uniform
    // 404 the /identify-medicines and /instructions routes use.
    const owned = await pool.query(
      `SELECT m.* FROM medicines m
       JOIN prescriptions p ON p.id = m.prescription_id
       WHERE m.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Medicine not found.' });
    }

    const medicine = owned.rows[0];

    const updates = {};
    for (const key of EDITABLE_FIELDS) {
      const field = readField(body, key);
      if (field.error) return res.status(400).json({ error: field.error });
      if (field.value !== undefined) updates[key] = field.value;
    }

    const changedFields = Object.keys(updates).filter(
      (key) => (updates[key] ?? null) !== (medicine[key] ?? null)
    );

    // A stored Urdu explanation describes the medicine as it was READ. Once the
    // patient corrects the name, dosage or frequency it no longer matches, and
    // reading it aloud would be worse than saying nothing. Regenerating it would
    // mean another AI call, so it is cleared instead and the UI says so. The
    // English read-aloud is unaffected — it is built from the structured fields,
    // which are now correct.
    const explanationIsStale = changedFields.length > 0;

    const setClauses = [];
    const params = [];
    for (const [key, value] of Object.entries(updates)) {
      params.push(value);
      setClauses.push(`${key} = $${params.length}`);
    }
    if (explanationIsStale) {
      setClauses.push('purpose_explanation = NULL');
    }
    params.push('confident');
    setClauses.push(`confidence = $${params.length}`);
    params.push(medicine.id);

    const client = await pool.connect();
    let updatedMedicine = medicine;
    let interactionFlags = [];

    try {
      await client.query('BEGIN');

      const updateResult = await client.query(
        `UPDATE medicines SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      updatedMedicine = updateResult.rows[0] || medicine;

      // Re-check interactions across the prescription's FULL medicine list: a
      // corrected name can create a dangerous pair that did not exist when the
      // list was first read, or clear one that was based on a misread.
      const currentMedicines = await client.query(
        'SELECT * FROM medicines WHERE prescription_id = $1',
        [medicine.prescription_id]
      );
      interactionFlags = checkInteractions(currentMedicines.rows);

      await client.query('DELETE FROM interaction_flags WHERE prescription_id = $1', [
        medicine.prescription_id,
      ]);

      for (const flag of interactionFlags) {
        await client.query(
          `INSERT INTO interaction_flags (id, prescription_id, medicine_a, medicine_b, warning_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), medicine.prescription_id, flag.medicine_a, flag.medicine_b, flag.warning_text]
        );
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    res.json({
      message: changedFields.length > 0 ? 'Medicine corrected' : 'Medicine confirmed',
      medicine: updatedMedicine,
      changed_fields: changedFields,
      explanation_cleared: explanationIsStale,
      interaction_warnings: interactionFlags,
    });
  } catch (err) {
    console.error('Medicine correction error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;

// Tests for PATCH /medicines/:id — the patient correction workflow.
//
// Covers three things the feature has to get right:
//   1. Ownership — a medicine on someone else's prescription is untouchable,
//      and indistinguishable from one that does not exist (uniform 404).
//   2. Validation — a correction cannot blank out the medicine name.
//   3. The interaction re-check — correcting a name can CREATE a dangerous
//      pair that was not there before, or CLEAR one that rested on a misread.
//      Getting this wrong is a safety bug, not a cosmetic one.
//
// The route makes no AI calls, so these run against demo mode like the rest
// of the suite.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const helpers = require('./helpers');
const { request, createUser, rawDb } = helpers;

before(async () => {
  await helpers.startServer();
});

after(async () => {
  await helpers.stopServer();
});

beforeEach(() => {
  helpers.clearAllTables();
});

// insertMedicines() in helpers always writes the same confident row; these
// tests need specific names, confidences and explanations.
function insertMedicine(prescriptionId, medicine) {
  const id = crypto.randomUUID();
  rawDb
    .prepare(
      `INSERT INTO medicines
         (id, prescription_id, name, dosage, frequency, duration, confidence, purpose_explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      prescriptionId,
      medicine.name,
      medicine.dosage ?? null,
      medicine.frequency ?? null,
      medicine.duration ?? null,
      medicine.confidence || 'uncertain',
      medicine.purpose_explanation ?? null
    );
  return id;
}

function readMedicine(id) {
  return rawDb.prepare('SELECT * FROM medicines WHERE id = ?').get(id);
}

function readFlags(prescriptionId) {
  return rawDb
    .prepare('SELECT * FROM interaction_flags WHERE prescription_id = ?')
    .all(prescriptionId);
}

async function setupPatient(medicines) {
  const user = await createUser({ email: helpers.uniqueEmail('patient') });
  const prescriptionId = helpers.createPrescription(user.id);
  const ids = medicines.map((medicine) => insertMedicine(prescriptionId, medicine));
  return { user, prescriptionId, ids };
}

describe('PATCH /medicines/:id — access control', () => {
  it('rejects an unauthenticated request', async () => {
    const { ids } = await setupPatient([{ name: 'Panadol' }]);

    const res = await request('PATCH', `/medicines/${ids[0]}`, { body: { name: 'Paracetamol' } });

    assert.equal(res.status, 401);
    assert.equal(readMedicine(ids[0]).name, 'Panadol');
  });

  it("rejects another patient's medicine with a uniform 404", async () => {
    const { ids } = await setupPatient([{ name: 'Panadol' }]);
    const intruder = await createUser({ email: helpers.uniqueEmail('intruder') });

    const foreign = await request('PATCH', `/medicines/${ids[0]}`, {
      token: intruder.token,
      body: { name: 'Warfarin' },
    });
    const missing = await request('PATCH', `/medicines/${crypto.randomUUID()}`, {
      token: intruder.token,
      body: { name: 'Warfarin' },
    });

    assert.equal(foreign.status, 404);
    assert.equal(missing.status, 404);
    // Identical responses: never leak whether the medicine exists.
    assert.deepEqual(foreign.data, missing.data);
  });

  it("does not modify another patient's medicine", async () => {
    const { ids } = await setupPatient([
      { name: 'Panadol', dosage: '500mg', confidence: 'uncertain' },
    ]);
    const intruder = await createUser({ email: helpers.uniqueEmail('intruder') });

    await request('PATCH', `/medicines/${ids[0]}`, {
      token: intruder.token,
      body: { name: 'Warfarin', dosage: '5mg' },
    });

    const row = readMedicine(ids[0]);
    assert.equal(row.name, 'Panadol');
    assert.equal(row.dosage, '500mg');
    assert.equal(row.confidence, 'uncertain', 'a rejected request must not confirm the medicine');
  });
});

describe('PATCH /medicines/:id — confirming and editing', () => {
  it('confirms an uncertain medicine as-is without changing its fields', async () => {
    const { user, ids } = await setupPatient([
      {
        name: 'Panadol',
        dosage: '500mg',
        frequency: 'three times a day',
        confidence: 'uncertain',
        purpose_explanation: 'اردو ہدایت',
      },
    ]);

    const res = await request('PATCH', `/medicines/${ids[0]}`, { token: user.token, body: {} });

    assert.equal(res.status, 200);
    assert.equal(res.data.medicine.confidence, 'confident');
    assert.deepEqual(res.data.changed_fields, []);
    assert.equal(res.data.explanation_cleared, false);

    const row = readMedicine(ids[0]);
    assert.equal(row.name, 'Panadol');
    assert.equal(row.dosage, '500mg');
    assert.equal(row.confidence, 'confident');
    assert.equal(row.purpose_explanation, 'اردو ہدایت', 'a pure confirmation keeps the explanation');
  });

  it('applies an edit and marks the medicine confident', async () => {
    const { user, ids } = await setupPatient([
      { name: 'Panadoll', dosage: '50mg', frequency: 'once a day', confidence: 'uncertain' },
    ]);

    const res = await request('PATCH', `/medicines/${ids[0]}`, {
      token: user.token,
      body: { name: 'Panadol', dosage: '500mg', frequency: 'three times a day' },
    });

    assert.equal(res.status, 200);
    const row = readMedicine(ids[0]);
    assert.equal(row.name, 'Panadol');
    assert.equal(row.dosage, '500mg');
    assert.equal(row.frequency, 'three times a day');
    assert.equal(row.confidence, 'confident');
    assert.deepEqual(res.data.changed_fields.sort(), ['dosage', 'frequency', 'name']);
  });

  it('clears the stale Urdu explanation when the reading actually changed', async () => {
    const { user, ids } = await setupPatient([
      {
        name: 'Panadoll',
        dosage: '500mg',
        confidence: 'uncertain',
        purpose_explanation: 'یہ دوا بخار کے لیے ہے۔',
      },
    ]);

    const res = await request('PATCH', `/medicines/${ids[0]}`, {
      token: user.token,
      body: { name: 'Augmentin' },
    });

    assert.equal(res.data.explanation_cleared, true);
    assert.equal(
      readMedicine(ids[0]).purpose_explanation,
      null,
      'an explanation describing the old reading must not survive the correction'
    );
  });

  it('leaves an unedited field untouched when it is not sent', async () => {
    const { user, ids } = await setupPatient([
      { name: 'Panadol', dosage: '500mg', frequency: 'twice a day', confidence: 'uncertain' },
    ]);

    await request('PATCH', `/medicines/${ids[0]}`, {
      token: user.token,
      body: { frequency: 'three times a day' },
    });

    const row = readMedicine(ids[0]);
    assert.equal(row.dosage, '500mg');
    assert.equal(row.name, 'Panadol');
    assert.equal(row.frequency, 'three times a day');
  });

  it('clears an optional field when it is explicitly set to null', async () => {
    const { user, ids } = await setupPatient([
      { name: 'Panadol', dosage: '500mg', confidence: 'uncertain' },
    ]);

    const res = await request('PATCH', `/medicines/${ids[0]}`, {
      token: user.token,
      body: { dosage: null },
    });

    assert.equal(res.status, 200);
    assert.equal(readMedicine(ids[0]).dosage, null);
  });
});

describe('PATCH /medicines/:id — validation', () => {
  const invalidBodies = [
    ['an empty name', { name: '' }],
    ['a whitespace-only name', { name: '   ' }],
    ['a null name', { name: null }],
    ['a whitespace-only dosage', { dosage: '  ' }],
    ['a whitespace-only frequency', { frequency: '\t' }],
    ['a non-string name', { name: 42 }],
  ];

  for (const [label, body] of invalidBodies) {
    it(`rejects ${label}`, async () => {
      const { user, ids } = await setupPatient([
        { name: 'Panadol', dosage: '500mg', frequency: 'twice a day', confidence: 'uncertain' },
      ]);

      const res = await request('PATCH', `/medicines/${ids[0]}`, { token: user.token, body });

      assert.equal(res.status, 400);
      assert.ok(res.data.error);
      const row = readMedicine(ids[0]);
      assert.equal(row.name, 'Panadol');
      assert.equal(
        row.confidence,
        'uncertain',
        'a rejected correction must not mark the medicine confident'
      );
    });
  }

  it('trims surrounding whitespace rather than storing it', async () => {
    const { user, ids } = await setupPatient([{ name: 'Panadol', confidence: 'uncertain' }]);

    await request('PATCH', `/medicines/${ids[0]}`, {
      token: user.token,
      body: { name: '  Augmentin  ', dosage: ' 625mg ' },
    });

    const row = readMedicine(ids[0]);
    assert.equal(row.name, 'Augmentin');
    assert.equal(row.dosage, '625mg');
  });
});

describe('PATCH /medicines/:id — interaction re-check', () => {
  it('raises a warning when the correction creates a dangerous pair', async () => {
    const { user, prescriptionId, ids } = await setupPatient([
      { name: 'Aspirin', confidence: 'confident' },
      { name: 'Panadol', confidence: 'uncertain' },
    ]);

    assert.equal(readFlags(prescriptionId).length, 0, 'no interaction before the correction');

    // The second medicine was actually Warfarin — dangerous alongside Aspirin.
    const res = await request('PATCH', `/medicines/${ids[1]}`, {
      token: user.token,
      body: { name: 'Warfarin' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.interaction_warnings.length, 1);

    const flags = readFlags(prescriptionId);
    assert.equal(flags.length, 1);
    assert.deepEqual([flags[0].medicine_a, flags[0].medicine_b].sort(), ['Aspirin', 'Warfarin']);
    assert.match(flags[0].warning_text, /bleeding/i);
  });

  it('withdraws a warning that rested on a misread name', async () => {
    const { user, prescriptionId, ids } = await setupPatient([
      { name: 'Aspirin', confidence: 'confident' },
      { name: 'Warfarin', confidence: 'uncertain' },
    ]);

    // Seed the flag the original /instructions run would have written.
    rawDb
      .prepare(
        `INSERT INTO interaction_flags (id, prescription_id, medicine_a, medicine_b, warning_text)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), prescriptionId, 'Aspirin', 'Warfarin', 'Increased bleeding risk');
    assert.equal(readFlags(prescriptionId).length, 1);

    const res = await request('PATCH', `/medicines/${ids[1]}`, {
      token: user.token,
      body: { name: 'Panadol' },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.data.interaction_warnings, []);
    assert.equal(
      readFlags(prescriptionId).length,
      0,
      'a warning based on a misread must not outlive the correction'
    );
  });

  it('does not duplicate an interaction that still applies', async () => {
    const { user, prescriptionId, ids } = await setupPatient([
      { name: 'Aspirin', confidence: 'confident' },
      { name: 'Warfarin', dosage: '5mg', confidence: 'uncertain' },
    ]);

    rawDb
      .prepare(
        `INSERT INTO interaction_flags (id, prescription_id, medicine_a, medicine_b, warning_text)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), prescriptionId, 'Aspirin', 'Warfarin', 'Increased bleeding risk');

    // Correcting only the dosage leaves the pair intact.
    await request('PATCH', `/medicines/${ids[1]}`, {
      token: user.token,
      body: { dosage: '3mg' },
    });

    assert.equal(readFlags(prescriptionId).length, 1, 'the flag is replaced, not appended');
  });

  it('leaves other prescriptions\' flags alone', async () => {
    const { user, prescriptionId, ids } = await setupPatient([
      { name: 'Aspirin', confidence: 'confident' },
      { name: 'Panadol', confidence: 'uncertain' },
    ]);

    // A second, unrelated prescription for the same patient.
    const otherPrescriptionId = helpers.createPrescription(user.id);
    rawDb
      .prepare(
        `INSERT INTO interaction_flags (id, prescription_id, medicine_a, medicine_b, warning_text)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), otherPrescriptionId, 'Lithium', 'Ibuprofen', 'Toxicity risk');

    await request('PATCH', `/medicines/${ids[1]}`, {
      token: user.token,
      body: { name: 'Warfarin' },
    });

    assert.equal(readFlags(prescriptionId).length, 1);
    assert.equal(
      readFlags(otherPrescriptionId).length,
      1,
      'the re-check must be scoped to the edited prescription'
    );
  });
});

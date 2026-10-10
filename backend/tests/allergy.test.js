// Tests for the allergy check.
//
// The matcher is deliberately a keyword match, not a clinical allergy
// database. These tests pin what that means in both directions: it must catch
// the obvious cases a patient would expect ("penicillin" vs "Penicillin V"),
// and it must NOT fire on unrelated medicines, because a warning the patient
// learns to ignore is worse than no warning at all.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const helpers = require('./helpers');
const { request, createUser, rawDb } = helpers;
const { checkAllergies, parseAllergies } = require('../routes/instructions');

before(async () => {
  await helpers.startServer();
});

after(async () => {
  await helpers.stopServer();
});

beforeEach(() => {
  helpers.clearAllTables();
});

const meds = (...names) => names.map((name) => ({ name }));

function readAllergyFlags(prescriptionId) {
  return rawDb.prepare('SELECT * FROM allergy_flags WHERE prescription_id = ?').all(prescriptionId);
}

async function patientAllergicTo(allergies) {
  const user = await createUser({ email: helpers.uniqueEmail('allergic') });
  rawDb.prepare('UPDATE users SET allergies = ? WHERE id = ?').run(allergies, user.id);
  return user;
}

describe('parseAllergies', () => {
  it('splits and tidies a comma-separated list', () => {
    assert.deepEqual(parseAllergies('penicillin, aspirin ,  sulfa'), [
      'penicillin',
      'aspirin',
      'sulfa',
    ]);
  });

  it('drops fragments too short to match meaningfully', () => {
    // A stray "a" would otherwise match nearly every medicine name.
    assert.deepEqual(parseAllergies('a, penicillin, x'), ['penicillin']);
  });

  it('de-duplicates case-insensitively', () => {
    assert.deepEqual(parseAllergies('Penicillin, penicillin, PENICILLIN'), ['Penicillin']);
  });

  it('returns nothing for an empty or missing list', () => {
    assert.deepEqual(parseAllergies(null), []);
    assert.deepEqual(parseAllergies(''), []);
    assert.deepEqual(parseAllergies('   '), []);
    assert.deepEqual(parseAllergies(undefined), []);
  });
});

describe('checkAllergies — matching', () => {
  it('matches regardless of case', () => {
    const flags = checkAllergies(meds('ASPIRIN'), 'aspirin');
    assert.equal(flags.length, 1);
    assert.equal(flags[0].medicine_name, 'ASPIRIN');
    assert.equal(flags[0].allergy_text, 'aspirin');
  });

  it('matches when the medicine name contains the allergy', () => {
    const flags = checkAllergies(meds('Penicillin V'), 'penicillin');
    assert.equal(flags.length, 1);
    assert.equal(flags[0].medicine_name, 'Penicillin V');
  });

  it('matches when the allergy text contains the medicine name', () => {
    const flags = checkAllergies(meds('Aspirin'), 'aspirin and other NSAIDs');
    assert.equal(flags.length, 1);
  });

  it('does not fire on an unrelated medicine', () => {
    const flags = checkAllergies(meds('Metformin', 'Panadol'), 'penicillin, sulfa');
    assert.deepEqual(flags, []);
  });

  it('flags only the offending medicine in a longer list', () => {
    const flags = checkAllergies(meds('Panadol', 'Amoxicillin', 'Metformin'), 'amoxicillin');
    assert.equal(flags.length, 1);
    assert.equal(flags[0].medicine_name, 'Amoxicillin');
  });

  it('reports each matching allergy entry once', () => {
    const flags = checkAllergies(meds('Aspirin'), 'aspirin, Aspirin, ASPIRIN');
    assert.equal(flags.length, 1);
  });

  it('returns nothing when the patient recorded no allergies', () => {
    assert.deepEqual(checkAllergies(meds('Aspirin'), null), []);
    assert.deepEqual(checkAllergies(meds('Aspirin'), ''), []);
  });

  it('survives medicines with a missing name', () => {
    assert.deepEqual(checkAllergies([{ name: null }, { name: '  ' }], 'aspirin'), []);
  });

  it('writes a warning the patient can act on', () => {
    const [flag] = checkAllergies(meds('Amoxicillin'), 'penicillin, amoxicillin');
    assert.match(flag.warning_text, /allergic to "amoxicillin"/i);
    assert.match(flag.warning_text, /Amoxicillin/);
    assert.match(flag.warning_text, /doctor or pharmacist/i);
  });
});

describe('allergies on the account', () => {
  it('stores an allergy list given at signup', async () => {
    const res = await request('POST', '/auth/signup', {
      body: {
        name: 'Allergic Patient',
        email: helpers.uniqueEmail('signup'),
        password: 'password123',
        allergies: ' penicillin , aspirin ',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.allergies, 'penicillin, aspirin');
  });

  it('treats a blank allergy list as none recorded', async () => {
    const res = await request('POST', '/auth/signup', {
      body: {
        name: 'No Allergies',
        email: helpers.uniqueEmail('blank'),
        password: 'password123',
        allergies: '   ,  ',
      },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.allergies, null);
  });

  it('signup still works without the field at all', async () => {
    const res = await request('POST', '/auth/signup', {
      body: { name: 'Plain', email: helpers.uniqueEmail('plain'), password: 'password123' },
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.user.allergies, null);
  });
});

describe('GET/PATCH /auth/profile', () => {
  it('requires authentication', async () => {
    assert.equal((await request('GET', '/auth/profile')).status, 401);
    assert.equal((await request('PATCH', '/auth/profile', { body: { allergies: 'x' } })).status, 401);
  });

  it('returns the profile without ever exposing the password hash', async () => {
    const user = await patientAllergicTo('penicillin');

    const res = await request('GET', '/auth/profile', { token: user.token });

    assert.equal(res.status, 200);
    assert.equal(res.data.user.allergies, 'penicillin');
    assert.equal(res.data.user.password_hash, undefined);
  });

  it('updates the allergy list', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('update') });

    const res = await request('PATCH', '/auth/profile', {
      token: user.token,
      body: { allergies: 'sulfa,  penicillin ' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.user.allergies, 'sulfa, penicillin');
    assert.equal(
      rawDb.prepare('SELECT allergies FROM users WHERE id = ?').get(user.id).allergies,
      'sulfa, penicillin'
    );
  });

  it('clears the list when the patient empties it', async () => {
    const user = await patientAllergicTo('penicillin');

    const res = await request('PATCH', '/auth/profile', {
      token: user.token,
      body: { allergies: '' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.user.allergies, null);
  });

  it('rejects a non-text allergy value', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('bad') });

    const res = await request('PATCH', '/auth/profile', {
      token: user.token,
      body: { allergies: 42 },
    });

    assert.equal(res.status, 400);
  });

  it('rejects a request that updates nothing', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('empty') });

    const res = await request('PATCH', '/auth/profile', { token: user.token, body: {} });

    assert.equal(res.status, 400);
  });

  it('only ever touches the caller\'s own row', async () => {
    const alice = await patientAllergicTo('penicillin');
    const bob = await patientAllergicTo('sulfa');

    await request('PATCH', '/auth/profile', { token: bob.token, body: { allergies: 'latex' } });

    assert.equal(
      rawDb.prepare('SELECT allergies FROM users WHERE id = ?').get(alice.id).allergies,
      'penicillin'
    );
  });
});

describe('POST /instructions — allergy warnings', () => {
  it('warns when the prescription contains something the patient reacts to', async () => {
    const user = await patientAllergicTo('amoxicillin');
    const prescriptionId = helpers.createPrescription(user.id);
    helpers.insertMedicines(prescriptionId, ['Panadol', 'Amoxicillin']);

    const res = await request('POST', '/instructions', {
      token: user.token,
      body: { prescription_id: prescriptionId },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.allergy_warnings.length, 1);
    assert.equal(res.data.allergy_warnings[0].medicine_name, 'Amoxicillin');

    const rows = readAllergyFlags(prescriptionId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].allergy_text, 'amoxicillin');
  });

  it('stays silent for a patient with no allergies recorded', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('none') });
    const prescriptionId = helpers.createPrescription(user.id);
    helpers.insertMedicines(prescriptionId, ['Panadol', 'Amoxicillin']);

    const res = await request('POST', '/instructions', {
      token: user.token,
      body: { prescription_id: prescriptionId },
    });

    assert.deepEqual(res.data.allergy_warnings, []);
    assert.equal(readAllergyFlags(prescriptionId).length, 0);
  });

  it('does not duplicate warnings when run twice', async () => {
    const user = await patientAllergicTo('amoxicillin');
    const prescriptionId = helpers.createPrescription(user.id);
    helpers.insertMedicines(prescriptionId, ['Amoxicillin']);

    await request('POST', '/instructions', {
      token: user.token,
      body: { prescription_id: prescriptionId },
    });
    await request('POST', '/instructions', {
      token: user.token,
      body: { prescription_id: prescriptionId },
    });

    assert.equal(readAllergyFlags(prescriptionId).length, 1);
  });

  it('keeps allergy warnings separate from interaction warnings', async () => {
    const user = await patientAllergicTo('aspirin');
    const prescriptionId = helpers.createPrescription(user.id);
    helpers.insertMedicines(prescriptionId, ['Aspirin', 'Warfarin']);

    const res = await request('POST', '/instructions', {
      token: user.token,
      body: { prescription_id: prescriptionId },
    });

    assert.equal(res.data.interaction_warnings.length, 1, 'Aspirin + Warfarin is still flagged');
    assert.equal(res.data.allergy_warnings.length, 1, 'and the aspirin allergy is flagged too');
    assert.equal(res.data.allergy_warnings[0].medicine_name, 'Aspirin');
  });
});

describe('allergy warnings after a correction', () => {
  it('appear when the corrected name turns out to be an allergen', async () => {
    const user = await patientAllergicTo('penicillin');
    const prescriptionId = helpers.createPrescription(user.id);

    const medicineId = crypto.randomUUID();
    rawDb
      .prepare(
        `INSERT INTO medicines (id, prescription_id, name, dosage, confidence)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(medicineId, prescriptionId, 'Penicilln', '500mg', 'uncertain');

    assert.equal(readAllergyFlags(prescriptionId).length, 0, 'the misread hid the allergy');

    const res = await request('PATCH', `/medicines/${medicineId}`, {
      token: user.token,
      body: { name: 'Penicillin V' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.allergy_warnings.length, 1);
    assert.equal(readAllergyFlags(prescriptionId).length, 1);
  });

  it('are withdrawn when the correction clears the match', async () => {
    const user = await patientAllergicTo('penicillin');
    const prescriptionId = helpers.createPrescription(user.id);

    const medicineId = crypto.randomUUID();
    rawDb
      .prepare(
        `INSERT INTO medicines (id, prescription_id, name, dosage, confidence)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(medicineId, prescriptionId, 'Penicillin V', '500mg', 'uncertain');
    rawDb
      .prepare(
        `INSERT INTO allergy_flags (id, prescription_id, medicine_name, allergy_text)
         VALUES (?, ?, ?, ?)`
      )
      .run(crypto.randomUUID(), prescriptionId, 'Penicillin V', 'penicillin');

    const res = await request('PATCH', `/medicines/${medicineId}`, {
      token: user.token,
      body: { name: 'Panadol' },
    });

    assert.deepEqual(res.data.allergy_warnings, []);
    assert.equal(
      readAllergyFlags(prescriptionId).length,
      0,
      'a warning based on a misread must not outlive the correction'
    );
  });
});

describe('GET /history — allergy warnings', () => {
  it('returns stored allergy warnings alongside each prescription', async () => {
    const user = await patientAllergicTo('amoxicillin');
    const prescriptionId = helpers.createPrescription(user.id);
    helpers.insertMedicines(prescriptionId, ['Amoxicillin']);

    await request('POST', '/instructions', {
      token: user.token,
      body: { prescription_id: prescriptionId },
    });

    const res = await request('GET', '/history', { token: user.token });

    assert.equal(res.status, 200);
    assert.equal(res.data.prescriptions[0].allergy_warnings.length, 1);
    assert.equal(res.data.prescriptions[0].allergy_warnings[0].medicine_name, 'Amoxicillin');
  });

  it('returns an empty list rather than omitting the field', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('clean') });
    const prescriptionId = helpers.createPrescription(user.id);
    helpers.insertMedicines(prescriptionId, ['Panadol']);

    const res = await request('GET', '/history', { token: user.token });

    assert.deepEqual(res.data.prescriptions[0].allergy_warnings, []);
  });
});

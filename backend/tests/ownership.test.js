// Ownership enforcement tests: /identify-medicines and /instructions must
// not let one user process another user's prescription.
//
// Current behavior (pinned by these tests): both routes return 404 with the
// same "Prescription not found." error for a foreign prescription_id as for
// a nonexistent one — deliberately uniform, so the response never leaks
// whether the prescription exists. If you later switch to 403, update these
// expectations intentionally.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const helpers = require('./helpers');
const { request, createUser } = helpers;

before(async () => {
  await helpers.startServer();
});

after(async () => {
  await helpers.stopServer();
});

beforeEach(() => {
  helpers.clearAllTables();
});

// Two different accounts: alice owns the prescription, bob is the intruder.
async function setupAliceAndBob() {
  const alice = await createUser({ email: helpers.uniqueEmail('alice') });
  const bob = await createUser({ email: helpers.uniqueEmail('bob') });

  const alicePrescriptionId = helpers.createPrescription(alice.id);
  helpers.insertMedicines(alicePrescriptionId, ['Panadol', 'Amoxicillin']);

  return { alice, bob, alicePrescriptionId };
}

describe('POST /identify-medicines — ownership', () => {
  it('rejects another user\'s prescription_id (uniform 404, no existence leak)', async () => {
    const { bob, alicePrescriptionId } = await setupAliceAndBob();

    const foreign = await request('POST', '/identify-medicines', {
      token: bob.token,
      body: { prescription_id: alicePrescriptionId },
    });

    // Same status and message as a nonexistent id, so bob learns nothing.
    const nonexistent = await request('POST', '/identify-medicines', {
      token: bob.token,
      body: { prescription_id: crypto.randomUUID() },
    });

    assert.equal(foreign.status, 404, 'foreign prescription must be rejected');
    assert.equal(nonexistent.status, 404);
    assert.equal(foreign.data.error, nonexistent.data.error);
    assert.match(foreign.data.error, /not found/i);
  });

  it('does not insert medicines for a foreign prescription', async () => {
    const { bob, alicePrescriptionId } = await setupAliceAndBob();

    await request('POST', '/identify-medicines', {
      token: bob.token,
      body: { prescription_id: alicePrescriptionId },
    });

    const count = helpers.rawDb
      .prepare('SELECT COUNT(*) AS c FROM medicines WHERE prescription_id = ?')
      .get(alicePrescriptionId).c;
    assert.equal(
      count,
      2,
      'the two fixture medicines only — bob\'s rejected call must not add rows'
    );
  });

  it('lets the actual owner process their own prescription (control case)', async () => {
    const { alice, alicePrescriptionId } = await setupAliceAndBob();

    const res = await request('POST', '/identify-medicines', {
      token: alice.token,
      body: { prescription_id: alicePrescriptionId },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.medicines));
    assert.ok(res.data.medicines.length > 0);
  });
});

describe('POST /instructions — ownership', () => {
  it('rejects another user\'s prescription_id (uniform 404, no existence leak)', async () => {
    const { bob, alicePrescriptionId } = await setupAliceAndBob();

    const foreign = await request('POST', '/instructions', {
      token: bob.token,
      body: { prescription_id: alicePrescriptionId },
    });

    const nonexistent = await request('POST', '/instructions', {
      token: bob.token,
      body: { prescription_id: crypto.randomUUID() },
    });

    assert.equal(foreign.status, 404, 'foreign prescription must be rejected');
    assert.equal(nonexistent.status, 404);
    assert.equal(foreign.data.error, nonexistent.data.error);
    assert.match(foreign.data.error, /not found/i);
  });

  it('does not write interaction flags or explanations for a foreign prescription', async () => {
    const { bob, alicePrescriptionId } = await setupAliceAndBob();

    await request('POST', '/instructions', {
      token: bob.token,
      body: { prescription_id: alicePrescriptionId },
    });

    const flagCount = helpers.rawDb
      .prepare('SELECT COUNT(*) AS c FROM interaction_flags WHERE prescription_id = ?')
      .get(alicePrescriptionId).c;
    assert.equal(flagCount, 0, "bob's rejected call must not write interaction flags");

    const explained = helpers.rawDb
      .prepare('SELECT COUNT(*) AS c FROM medicines WHERE prescription_id = ? AND purpose_explanation IS NOT NULL')
      .get(alicePrescriptionId).c;
    assert.equal(explained, 0, "bob's rejected call must not write explanations");
  });

  it('lets the actual owner generate instructions (control case)', async () => {
    const { alice, alicePrescriptionId } = await setupAliceAndBob();

    const res = await request('POST', '/instructions', {
      token: alice.token,
      body: { prescription_id: alicePrescriptionId },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.medicines));
    // Demo mode guarantees a non-empty Urdu explanation per medicine.
    for (const medicine of res.data.medicines) {
      assert.ok(medicine.purpose_explanation, 'demo mode fills purpose_explanation');
    }
  });
});

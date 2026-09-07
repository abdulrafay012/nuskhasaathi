const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  startServer,
  stopServer,
  request,
  createUser,
  createPrescription,
  insertMedicines,
  clearAllTables,
  rawDb,
} = require('./helpers');

describe('Caregiver Link system', () => {
  before(async () => {
    await startServer();
  });

  after(async () => {
    await stopServer();
  });

  beforeEach(() => {
    clearAllTables();
  });

  it('GET /caregiver/token requires authentication', async () => {
    const res = await request('GET', '/caregiver/token');
    assert.equal(res.status, 401);
  });

  it('GET /caregiver/token generates and persists a share token for the user', async () => {
    const user = await createUser({ name: 'Amina Bibi' });

    const res = await request('GET', '/caregiver/token', { token: user.token });
    assert.equal(res.status, 200);
    assert.ok(res.data.token, 'Expected token to be returned');
    assert.equal(res.data.sharePath, `/caregiver/${res.data.token}`);

    // Persisted in DB
    const dbRow = rawDb.prepare('SELECT caregiver_token FROM users WHERE id = ?').get(user.id);
    assert.equal(dbRow.caregiver_token, res.data.token);

    // Repeated call returns the same token
    const res2 = await request('GET', '/caregiver/token', { token: user.token });
    assert.equal(res2.status, 200);
    assert.equal(res2.data.token, res.data.token);
  });

  it('POST /caregiver/token/regenerate invalidates old token and issues a new one', async () => {
    const user = await createUser({ name: 'Rashid Khan' });

    const initial = await request('GET', '/caregiver/token', { token: user.token });
    const oldToken = initial.data.token;

    const regenerated = await request('POST', '/caregiver/token/regenerate', { token: user.token });
    assert.equal(regenerated.status, 200);
    assert.notEqual(regenerated.data.token, oldToken);
    assert.equal(regenerated.data.sharePath, `/caregiver/${regenerated.data.token}`);

    // Old token should now be 404 in public view
    const oldView = await request('GET', `/caregiver/view/${oldToken}`);
    assert.equal(oldView.status, 404);

    // New token works
    const newView = await request('GET', `/caregiver/view/${regenerated.data.token}`);
    assert.equal(newView.status, 200);
  });

  it('GET /caregiver/view/:token is publicly accessible without any auth token', async () => {
    const user = await createUser({ name: 'Mohammad Ali', age: 68 });
    const tokenRes = await request('GET', '/caregiver/token', { token: user.token });
    const caregiverToken = tokenRes.data.token;

    const rxId = createPrescription(user.id);
    insertMedicines(rxId, ['Panadol', 'Augmentin']);

    // Call public endpoint without Authorization header
    const res = await request('GET', `/caregiver/view/${caregiverToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.patient.name, 'Mohammad Ali');
    assert.equal(res.data.patient.age, 68);
    assert.ok(Array.isArray(res.data.slots), 'Expected slots array');
    assert.equal(res.data.medicines.length, 2);
  });

  it('GET /caregiver/view/:token returns 404 for unknown or forged token', async () => {
    const res = await request('GET', '/caregiver/view/definitely-fake-token-12345');
    assert.equal(res.status, 404);
    assert.match(res.data.error, /invalid or expired/i);
  });

  it('GET /caregiver/view/:token includes drug interaction warnings if present', async () => {
    const user = await createUser({ name: 'Zahra Begum' });
    const tokenRes = await request('GET', '/caregiver/token', { token: user.token });
    const caregiverToken = tokenRes.data.token;

    const rxId = createPrescription(user.id);
    insertMedicines(rxId, ['Aspirin', 'Warfarin']);

    // Insert interaction warning
    rawDb
      .prepare(
        `INSERT INTO interaction_flags (id, prescription_id, medicine_a, medicine_b, warning_text)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        'warn-1',
        rxId,
        'Aspirin',
        'Warfarin',
        'Severe bleeding risk when Aspirin and Warfarin are taken together.'
      );

    const res = await request('GET', `/caregiver/view/${caregiverToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.interactionWarnings.length, 1);
    assert.equal(res.data.interactionWarnings[0].medicine_a, 'Aspirin');
    assert.equal(res.data.interactionWarnings[0].medicine_b, 'Warfarin');
  });
});

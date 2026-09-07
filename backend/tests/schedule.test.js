// Tests for GET /schedule — turning a flat medicine list into "what do I take
// right now".
//
// The risky parts are not the HTTP plumbing:
//   1. Bucketing. Putting a medicine in a slot the prescription never named
//      would instruct a patient to take a dose at the wrong time.
//   2. The end-date maths. SQLite stores timestamps as UTC without a zone
//      marker, so a careless parse shifts "ending soon" by a day.
//   3. Vague durations. Guessing an end date is worse than showing none.

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const helpers = require('./helpers');
const { request, createUser, rawDb } = helpers;
const {
  slotsForFrequency,
  parseDurationDays,
  courseWindow,
  buildSchedule,
} = require('../routes/schedule');

before(async () => {
  await helpers.startServer();
});

after(async () => {
  await helpers.stopServer();
});

beforeEach(() => {
  helpers.clearAllTables();
});

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
      medicine.confidence || 'confident',
      medicine.purpose_explanation ?? null
    );
  return id;
}

function slotNamed(slots, key) {
  return slots.find((slot) => slot.key === key);
}

function namesIn(slots, key) {
  return slotNamed(slots, key).medicines.map((medicine) => medicine.name);
}

describe('slotsForFrequency — bucketing', () => {
  it('maps the standard shorthand to the right number of doses', () => {
    assert.deepEqual(slotsForFrequency('once a day'), ['morning']);
    assert.deepEqual(slotsForFrequency('twice a day'), ['morning', 'evening']);
    assert.deepEqual(slotsForFrequency('three times a day'), ['morning', 'afternoon', 'evening']);
    assert.deepEqual(slotsForFrequency('four times a day'), [
      'morning',
      'afternoon',
      'evening',
      'night',
    ]);
  });

  it('understands the abbreviations doctors actually write', () => {
    assert.deepEqual(slotsForFrequency('OD'), slotsForFrequency('once a day'));
    assert.deepEqual(slotsForFrequency('BD'), slotsForFrequency('twice a day'));
    assert.deepEqual(slotsForFrequency('TDS'), slotsForFrequency('three times a day'));
    assert.deepEqual(slotsForFrequency('QDS'), slotsForFrequency('four times a day'));
    assert.deepEqual(slotsForFrequency('every 8 hours'), ['morning', 'afternoon', 'evening']);
  });

  it('moves a once-daily medicine to night when the text says so', () => {
    assert.deepEqual(slotsForFrequency('once a day at night'), ['night']);
    assert.deepEqual(slotsForFrequency('once a day', 'رات کو ایک گولی لیں۔'), ['night']);
    assert.deepEqual(slotsForFrequency('OD at bedtime'), ['night']);
  });

  it('never schedules an as-needed medicine, even when it states a frequency', () => {
    // "BD as needed" is a ceiling, not an instruction to take two doses today.
    assert.deepEqual(slotsForFrequency('twice a day as needed'), ['as_needed']);
    assert.deepEqual(slotsForFrequency('as needed'), ['as_needed']);
    assert.deepEqual(slotsForFrequency('PRN'), ['as_needed']);
    assert.deepEqual(slotsForFrequency('SOS'), ['as_needed']);
  });

  it('refuses to guess a time it cannot read', () => {
    assert.deepEqual(slotsForFrequency(null), ['as_needed']);
    assert.deepEqual(slotsForFrequency(''), ['as_needed']);
    assert.deepEqual(slotsForFrequency('as directed by doctor'), ['as_needed']);
    assert.deepEqual(slotsForFrequency('[unclear]'), ['as_needed']);
  });
});

describe('parseDurationDays — only clear durations count', () => {
  it('reads a plain number of days', () => {
    assert.equal(parseDurationDays('5 days'), 5);
    assert.equal(parseDurationDays('x 5 days'), 5);
    assert.equal(parseDurationDays('1 day'), 1);
    assert.equal(parseDurationDays('10d'), 10);
    assert.equal(parseDurationDays('7'), 7);
  });

  it('converts weeks and the "5/7" shorthand', () => {
    assert.equal(parseDurationDays('1 week'), 7);
    assert.equal(parseDurationDays('2 weeks'), 14);
    assert.equal(parseDurationDays('5/7'), 5);
  });

  it('returns null for a vague duration rather than guessing', () => {
    assert.equal(parseDurationDays(null), null);
    assert.equal(parseDurationDays(''), null);
    assert.equal(parseDurationDays('as directed'), null);
    assert.equal(parseDurationDays('until finished'), null);
    assert.equal(parseDurationDays('continue long term'), null);
  });
});

describe('courseWindow — refill awareness', () => {
  // Uploaded at noon UTC so the assertions do not sit on a midnight boundary.
  const uploadedAt = '2026-09-01 12:00:00';

  it('projects the end date from the upload date plus the duration', () => {
    const window = courseWindow(uploadedAt, '5 days', new Date('2026-09-01T12:00:00Z'));
    assert.equal(window.ends_on, '2026-09-06');
    assert.equal(window.days_remaining, 5);
    assert.equal(window.ending_soon, false);
    assert.equal(window.finished, false);
  });

  it('flags a course ending within two days', () => {
    const window = courseWindow(uploadedAt, '5 days', new Date('2026-09-05T09:00:00Z'));
    assert.equal(window.days_remaining, 1);
    assert.equal(window.ending_soon, true);
  });

  it('treats the final day as ending soon, not finished', () => {
    const window = courseWindow(uploadedAt, '5 days', new Date('2026-09-06T09:00:00Z'));
    assert.equal(window.days_remaining, 0);
    assert.equal(window.ending_soon, true);
    assert.equal(window.finished, false);
  });

  it('marks a course that already ran out', () => {
    const window = courseWindow(uploadedAt, '5 days', new Date('2026-09-10T09:00:00Z'));
    assert.equal(window.finished, true);
    assert.equal(window.ending_soon, false);
  });

  it('stays silent when the duration is vague', () => {
    const window = courseWindow(uploadedAt, 'as directed', new Date('2026-09-05T09:00:00Z'));
    assert.deepEqual(window, {
      ends_on: null,
      days_remaining: null,
      ending_soon: false,
      finished: false,
    });
  });

  it('reads the SQLite timestamp as UTC, not local time', () => {
    // A naive `new Date('2026-09-01 12:00:00')` is parsed in local time, which
    // shifts the end date by a day for most of the world.
    const fromSqlite = courseWindow('2026-09-01 12:00:00', '5 days', new Date('2026-09-01T12:00:00Z'));
    const fromIso = courseWindow('2026-09-01T12:00:00Z', '5 days', new Date('2026-09-01T12:00:00Z'));
    assert.equal(fromSqlite.ends_on, fromIso.ends_on);
  });
});

describe('buildSchedule — assembling the day', () => {
  const prescription = { uploaded_at: '2026-09-01 12:00:00' };
  const now = new Date('2026-09-02T09:00:00Z');

  it('places a three-times-daily medicine in three slots', () => {
    const slots = buildSchedule(
      prescription,
      [{ id: '1', name: 'Panadol', dosage: '500mg', frequency: 'three times a day', duration: '5 days' }],
      now
    );

    assert.deepEqual(namesIn(slots, 'morning'), ['Panadol']);
    assert.deepEqual(namesIn(slots, 'afternoon'), ['Panadol']);
    assert.deepEqual(namesIn(slots, 'evening'), ['Panadol']);
    assert.deepEqual(namesIn(slots, 'night'), []);
  });

  it('always returns every slot, even when empty', () => {
    const slots = buildSchedule(prescription, [], now);
    assert.deepEqual(
      slots.map((slot) => slot.key),
      ['morning', 'afternoon', 'evening', 'night', 'as_needed']
    );
    assert.ok(slots.every((slot) => slot.medicines.length === 0));
  });

  it('carries the refill flags onto each entry', () => {
    const slots = buildSchedule(
      prescription,
      [{ id: '1', name: 'Augmentin', dosage: '625mg', frequency: 'twice a day', duration: '2 days' }],
      now
    );

    const entry = slotNamed(slots, 'morning').medicines[0];
    assert.equal(entry.ends_on, '2026-09-03');
    assert.equal(entry.ending_soon, true);
  });
});

describe('GET /schedule — route', () => {
  it('requires authentication', async () => {
    const res = await request('GET', '/schedule');
    assert.equal(res.status, 401);
  });

  it('returns empty slots for a patient with no prescriptions', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('empty') });

    const res = await request('GET', '/schedule', { token: user.token });

    assert.equal(res.status, 200);
    assert.equal(res.data.prescription, null);
    assert.equal(res.data.slots.length, 5);
    assert.ok(res.data.slots.every((slot) => slot.medicines.length === 0));
  });

  it('builds the schedule from the most recent prescription only', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('patient') });

    const older = helpers.createPrescription(user.id);
    insertMedicine(older, { name: 'OldMedicine', frequency: 'once a day' });

    // Force a later timestamp so ordering is unambiguous.
    const newer = helpers.createPrescription(user.id);
    rawDb
      .prepare('UPDATE prescriptions SET uploaded_at = ? WHERE id = ?')
      .run('2099-01-01 00:00:00', newer);
    insertMedicine(newer, { name: 'Panadol', dosage: '500mg', frequency: 'three times a day' });

    const res = await request('GET', '/schedule', { token: user.token });

    assert.equal(res.status, 200);
    assert.equal(res.data.prescription.id, newer);
    assert.deepEqual(namesIn(res.data.slots, 'morning'), ['Panadol']);
    assert.ok(
      !JSON.stringify(res.data.slots).includes('OldMedicine'),
      'an older prescription must not leak into today'
    );
  });

  it("never exposes another patient's prescription", async () => {
    const alice = await createUser({ email: helpers.uniqueEmail('alice') });
    const bob = await createUser({ email: helpers.uniqueEmail('bob') });

    const alicePrescription = helpers.createPrescription(alice.id);
    insertMedicine(alicePrescription, { name: 'Warfarin', frequency: 'once a day' });

    const res = await request('GET', '/schedule', { token: bob.token });

    assert.equal(res.status, 200);
    assert.equal(res.data.prescription, null);
    assert.ok(!JSON.stringify(res.data.slots).includes('Warfarin'));
  });

  it('sorts an as-needed medicine away from the timed slots', async () => {
    const user = await createUser({ email: helpers.uniqueEmail('mixed') });
    const prescriptionId = helpers.createPrescription(user.id);
    insertMedicine(prescriptionId, { name: 'Amoxicillin', frequency: 'three times a day' });
    insertMedicine(prescriptionId, { name: 'Ibuprofen', frequency: 'twice a day as needed' });

    const res = await request('GET', '/schedule', { token: user.token });

    assert.deepEqual(namesIn(res.data.slots, 'morning'), ['Amoxicillin']);
    assert.deepEqual(namesIn(res.data.slots, 'as_needed'), ['Ibuprofen']);
  });
});

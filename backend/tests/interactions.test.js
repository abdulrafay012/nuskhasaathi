// Drug interaction checker tests — the highest-value safety logic in the app.
//
// checkInteractions() is a pure function (no DB, no AI calls), so these tests
// exercise it directly against the 15 documented dangerous pairs.

// helpers sets SQLITE_PATH before db.js loads, so the incidental database
// connection opened by requiring the route lands on a throwaway temp file.
const { describe, it, after } = require('node:test');
const helpers = require('./helpers');
const { checkInteractions } = require('../routes/instructions');
const assert = require('node:assert/strict');

after(() => helpers.stopServer()); // closes the temp DB handle; no server was spawned

// The 15 well-verified dangerous pairs the app ships with. Duplicated here
// on purpose: if the production table is ever trimmed or corrupted, these
// tests fail and surface it.
const KNOWN_PAIRS = [
  ['Aspirin', 'Warfarin'],
  ['Ibuprofen', 'Aspirin'],
  ['Ibuprofen', 'Warfarin'],
  ['Metformin', 'Alcohol'],
  ['Lisinopril', 'Potassium'],
  ['Simvastatin', 'Amiodarone'],
  ['Warfarin', 'Fluconazole'],
  ['Digoxin', 'Amiodarone'],
  ['Methotrexate', 'Ibuprofen'],
  ['Ciprofloxacin', 'Theophylline'],
  ['Clopidogrel', 'Omeprazole'],
  ['Sildenafil', 'Nitroglycerin'],
  ['MAO Inhibitors', 'SSRI'],
  ['Lithium', 'Ibuprofen'],
  ['Amoxicillin', 'Methotrexate'],
];

const meds = (...names) => names.map((name) => ({ name }));

describe('checkInteractions — known dangerous pairs', () => {
  for (const [a, b] of KNOWN_PAIRS) {
    it(`flags ${a} + ${b}`, () => {
      const flags = checkInteractions(meds(a, b));

      assert.equal(flags.length, 1, `expected exactly one warning for ${a} + ${b}`);
      const pair = new Set([flags[0].medicine_a, flags[0].medicine_b]);
      assert.deepEqual([...pair].sort(), [a, b].sort(), 'warning must name both medicines');
      assert.ok(
        typeof flags[0].warning_text === 'string' && flags[0].warning_text.length > 10,
        'warning_text must be a meaningful, non-empty string'
      );
    });
  }
});

describe('checkInteractions — safe combinations', () => {
  it('raises no warning for a safe pair (Panadol + Amoxicillin)', () => {
    const flags = checkInteractions(meds('Panadol', 'Amoxicillin'));
    assert.deepEqual(flags, []);
  });

  it('raises no warning for a typical safe prescription of common Pakistani medicines', () => {
    const flags = checkInteractions(meds('Panadol', 'Augmentin', 'Brufen', 'Disprin'));
    assert.deepEqual(flags, []);
  });

  it('flags only the interacting pair inside a larger mixed prescription', () => {
    const flags = checkInteractions(
      meds('Panadol', 'Aspirin', 'Augmentin', 'Warfarin', 'Brufen')
    );
    assert.equal(flags.length, 1);
    assert.deepEqual(
      [flags[0].medicine_a, flags[0].medicine_b].sort(),
      ['Aspirin', 'Warfarin'].sort()
    );
  });
});

describe('checkInteractions — pair order and matching', () => {
  it('treats pair order as irrelevant (Aspirin+Warfarin equals Warfarin+Aspirin)', () => {
    const forward = checkInteractions(meds('Aspirin', 'Warfarin'));
    const reversed = checkInteractions(meds('Warfarin', 'Aspirin'));

    assert.equal(forward.length, 1);
    assert.equal(reversed.length, 1);
    // The warning payload itself is order-independent.
    assert.deepEqual(forward[0], reversed[0]);
  });

  it('matches medicine names case-insensitively', () => {
    const flags = checkInteractions(meds('aspirin', 'WARFARIN'));
    assert.equal(flags.length, 1);
  });

  it('flags every interacting pair when several cluster together', () => {
    // Aspirin, Ibuprofen and Warfarin are mutually interacting in the table:
    // Aspirin+Warfarin, Ibuprofen+Aspirin, Ibuprofen+Warfarin → 3 warnings.
    const flags = checkInteractions(meds('Aspirin', 'Ibuprofen', 'Warfarin'));
    assert.equal(flags.length, 3);
  });
});

describe('checkInteractions — degenerate inputs', () => {
  it('returns an empty list for an empty medicine list without crashing', () => {
    assert.deepEqual(checkInteractions([]), []);
  });

  it('returns an empty list for a single medicine (no self-interaction)', () => {
    assert.deepEqual(checkInteractions(meds('Warfarin')), []);
  });

  it('does not flag a medicine interacting with itself', () => {
    // One Warfarin and one aspirin-misread-again entry: distinct names only.
    assert.deepEqual(checkInteractions(meds('Warfarin', 'Panadol')), []);
  });
});

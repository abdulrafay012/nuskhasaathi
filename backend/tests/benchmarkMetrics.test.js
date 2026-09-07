// Tests for the benchmark scorer itself.
//
// A benchmark that reports 100% is only meaningful if it can also report
// failure. These feed the scorer deliberately WRONG pipeline output and
// assert that each kind of mistake is caught and counted in the right bucket.
//
// Pure functions only — no server, no database, no API calls.

const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreCase, aggregate } = require('../benchmark/lib/metrics');
const {
  normalizeDosage,
  normalizeFrequency,
  normalizeDuration,
  canonicalName,
} = require('../benchmark/lib/normalize');

const GROUND_TRUTH = {
  id: 'fixture',
  medicines: [
    {
      name: 'Panadol',
      aliases: ['Paracetamol'],
      dosage: '500mg',
      frequency: 'three times a day',
      duration: '5 days',
    },
    { name: 'Aspirin', aliases: ['Disprin'], dosage: '75mg', frequency: 'once a day', duration: null },
    { name: 'Ibuprofen', aliases: ['Brufen'], dosage: '400mg', frequency: 'twice a day', duration: null },
  ],
  expected_interactions: [['Aspirin', 'Ibuprofen']],
};

const perfectPrediction = () => ({
  medicines: [
    { name: 'Panadol', dosage: '500mg', frequency: 'three times a day', duration: '5 days', confidence: 'confident' },
    { name: 'Aspirin', dosage: '75mg', frequency: 'once a day', duration: null, confidence: 'confident' },
    { name: 'Ibuprofen', dosage: '400mg', frequency: 'twice a day', duration: null, confidence: 'confident' },
  ],
  interaction_warnings: [{ medicine_a: 'Aspirin', medicine_b: 'Ibuprofen' }],
});

test('normalizers collapse formatting differences, not meaning', () => {
  assert.equal(normalizeDosage('500 mg'), normalizeDosage('500mg'));
  assert.equal(normalizeDosage('0.5 g'), '500mg');
  assert.notEqual(normalizeDosage('500mg'), normalizeDosage('50mg'));

  assert.equal(normalizeFrequency('TDS'), normalizeFrequency('three times a day'));
  assert.equal(normalizeFrequency('BD'), normalizeFrequency('twice a day'));
  assert.notEqual(normalizeFrequency('BD'), normalizeFrequency('TDS'));

  assert.equal(normalizeDuration('5/7'), 5);
  assert.equal(normalizeDuration('x 5 days'), 5);
  assert.equal(normalizeDuration('1 week'), 7);
  assert.equal(normalizeDuration('as directed'), null);

  assert.equal(canonicalName('Brufen'), canonicalName('Ibuprofen'));
  assert.notEqual(canonicalName('Aspirin'), canonicalName('Ibuprofen'));
});

test('a perfect prediction scores 100% everywhere', () => {
  const score = scoreCase(GROUND_TRUTH, perfectPrediction());

  assert.equal(score.medicines.matched, 3);
  assert.equal(score.medicines.missed, 0);
  assert.equal(score.medicines.invented, 0);
  assert.equal(score.fields.dosage_correct.correct, 3);
  assert.equal(score.confidence.confidently_wrong, 0);
  assert.equal(score.interactions.true_positive, 1);
  assert.equal(score.interactions.false_negative, 0);
});

test('a dropped medicine is counted as missed, not silently ignored', () => {
  const prediction = perfectPrediction();
  prediction.medicines = prediction.medicines.slice(0, 2); // Ibuprofen gone
  prediction.interaction_warnings = [];

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.medicines.matched, 2);
  assert.equal(score.medicines.missed, 1);
  assert.deepEqual(score.medicines.missed_names, ['Ibuprofen']);
  assert.equal(aggregate([score]).rates.capture_rate, 2 / 3);
});

test('a medicine that was never prescribed is counted as invented', () => {
  const prediction = perfectPrediction();
  prediction.medicines.push({
    name: 'Warfarin',
    dosage: '5mg',
    frequency: 'once a day',
    duration: null,
    confidence: 'confident',
  });

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.medicines.invented, 1);
  assert.deepEqual(score.medicines.invented_names, ['Warfarin']);
  assert.equal(score.confidence.invented_as_confident, 1);
  assert.equal(aggregate([score]).rates.invention_rate, 1 / 4);
});

test('a wrong dosage is caught and counted as confidently wrong', () => {
  const prediction = perfectPrediction();
  prediction.medicines[0].dosage = '50mg'; // 10x under-dose, still "confident"

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.fields.dosage_correct.correct, 2);
  assert.equal(score.details[0].dosage.correct, false);
  assert.equal(score.confidence.confidently_wrong, 1);
  assert.equal(aggregate([score]).rates.confidently_wrong_rate, 1 / 3);
});

test('a wrong frequency is caught', () => {
  const prediction = perfectPrediction();
  prediction.medicines[0].frequency = 'once a day'; // truth is three times a day

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.fields.frequency_correct.correct, 2);
  assert.equal(score.confidence.confidently_wrong, 1);
});

test('a hallucinated duration is penalised the same as a dropped one', () => {
  const withExtra = perfectPrediction();
  withExtra.medicines[1].duration = '30 days'; // truth is null
  assert.equal(scoreCase(GROUND_TRUTH, withExtra).fields.duration_correct.correct, 2);

  const withMissing = perfectPrediction();
  withMissing.medicines[0].duration = null; // truth is 5 days
  assert.equal(scoreCase(GROUND_TRUTH, withMissing).fields.duration_correct.correct, 2);
});

test('generic-for-brand is acceptable but not scored as an exact match', () => {
  const prediction = perfectPrediction();
  prediction.medicines[0].name = 'Paracetamol'; // truth says Panadol

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.medicines.matched, 3, 'alias should still align to the right medicine');
  assert.equal(score.fields.name_exact.correct, 2);
  assert.equal(score.fields.name_acceptable.correct, 3);
});

test('an unrelated name is an invention, not a misspelling', () => {
  const prediction = perfectPrediction();
  prediction.medicines[0].name = 'Metformin';

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.medicines.invented, 1);
  assert.equal(score.medicines.missed, 1);
  assert.deepEqual(score.medicines.missed_names, ['Panadol']);
});

test('a close OCR misspelling still aligns to the intended medicine', () => {
  const prediction = perfectPrediction();
  prediction.medicines[0].name = 'Panadoll';

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.medicines.matched, 3);
  assert.equal(score.medicines.invented, 0);
  assert.equal(score.fields.name_exact.correct, 2);
});

test('a missed drug interaction drives recall down', () => {
  const prediction = perfectPrediction();
  prediction.interaction_warnings = [];

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.interactions.true_positive, 0);
  assert.equal(score.interactions.false_negative, 1);
  assert.equal(aggregate([score]).rates.interaction_recall, 0);
});

test('a false-alarm interaction drives precision down', () => {
  const prediction = perfectPrediction();
  prediction.interaction_warnings.push({ medicine_a: 'Panadol', medicine_b: 'Aspirin' });

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.interactions.true_positive, 1);
  assert.equal(score.interactions.false_positive, 1);
  assert.equal(aggregate([score]).rates.interaction_precision, 1 / 2);
});

test('interaction matching is order- and brand-insensitive', () => {
  const prediction = perfectPrediction();
  // Same pair, reversed, and using the brand name.
  prediction.interaction_warnings = [{ medicine_a: 'Brufen', medicine_b: 'Disprin' }];

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.interactions.true_positive, 1);
  assert.equal(score.interactions.false_positive, 0);
});

test('an "uncertain" flag on a genuinely wrong read counts as useful uncertainty', () => {
  const prediction = perfectPrediction();
  prediction.medicines[0].dosage = '50mg';
  prediction.medicines[0].confidence = 'uncertain';

  const score = scoreCase(GROUND_TRUTH, prediction);

  assert.equal(score.confidence.confidently_wrong, 0, 'the model hedged, so this is not confidently wrong');
  assert.equal(score.confidence.uncertain_wrong, 1);
  assert.equal(aggregate([score]).rates.uncertainty_usefulness, 1);
});

test('frequency_alt accepts a second defensible reading', () => {
  const groundTruth = {
    id: 'alt',
    medicines: [
      {
        name: 'Ibuprofen',
        dosage: '400mg',
        frequency: 'twice a day',
        frequency_alt: ['as needed'],
        duration: null,
      },
    ],
    expected_interactions: [],
  };
  const prediction = {
    medicines: [
      { name: 'Ibuprofen', dosage: '400mg', frequency: 'as needed', duration: null, confidence: 'confident' },
    ],
    interaction_warnings: [],
  };

  assert.equal(scoreCase(groundTruth, prediction).fields.frequency_correct.correct, 1);
});

test('aggregate sums counts across cases rather than averaging per-case rates', () => {
  const smallCase = scoreCase(
    { id: 'a', medicines: [{ name: 'Panadol', dosage: '500mg', frequency: 'once a day' }], expected_interactions: [] },
    {
      medicines: [{ name: 'Panadol', dosage: '999mg', frequency: 'once a day', confidence: 'confident' }],
      interaction_warnings: [],
    }
  );
  const bigCase = scoreCase(GROUND_TRUTH, perfectPrediction());

  const summary = aggregate([smallCase, bigCase]);

  // 3 of 4 dosages correct overall — NOT the 50% a naive per-case average gives.
  assert.equal(summary.fields.dosage_correct.scored, 4);
  assert.equal(summary.fields.dosage_correct.correct, 3);
  assert.equal(summary.rates.dosage_correct, 3 / 4);
});

test('rates are null rather than NaN when nothing was scored', () => {
  const summary = aggregate([
    scoreCase({ id: 'empty', medicines: [], expected_interactions: [] }, { medicines: [], interaction_warnings: [] }),
  ]);

  assert.equal(summary.rates.capture_rate, null);
  assert.equal(summary.rates.interaction_recall, null);
  assert.equal(summary.rates.confidence_precision, null);
});

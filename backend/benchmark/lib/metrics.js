// Pure scoring logic for the benchmark. No I/O, no network — everything here
// takes a ground-truth case plus a pipeline result and returns numbers, so it
// can be unit-tested without spending API calls.

const {
  normalizeName,
  normalizeDosage,
  normalizeFrequency,
  normalizeDuration,
  canonicalName,
  similarity,
} = require('./normalize');

// A predicted medicine below this name-similarity is treated as a different
// drug entirely (an invention) rather than a misspelling of a real one.
const MATCH_THRESHOLD = 0.55;

function aliasGroupsFrom(groundTruthMedicines) {
  return groundTruthMedicines.map((medicine) => [medicine.name, ...(medicine.aliases || [])]);
}

// Greedy highest-similarity-first alignment between ground truth and
// prediction. Greedy is sufficient here (prescriptions hold a handful of
// clearly distinct drugs) and keeps the pairing explainable in the report.
function alignMedicines(expected, predicted) {
  const aliasGroups = aliasGroupsFrom(expected);
  const candidates = [];

  expected.forEach((truth, truthIndex) => {
    predicted.forEach((guess, guessIndex) => {
      const truthCanonical = canonicalName(truth.name, aliasGroups);
      const sameCanonical =
        truthCanonical !== null && truthCanonical === canonicalName(guess.name, aliasGroups);

      const aliasHit = [truth.name, ...(truth.aliases || [])].some(
        (alias) => normalizeName(alias) === normalizeName(guess.name)
      );

      const score = sameCanonical || aliasHit ? 1 : similarity(truth.name, guess.name);
      if (score >= MATCH_THRESHOLD) {
        candidates.push({ truthIndex, guessIndex, score });
      }
    });
  });

  candidates.sort((a, b) => b.score - a.score);

  const usedTruth = new Set();
  const usedGuess = new Set();
  const pairs = [];

  for (const candidate of candidates) {
    if (usedTruth.has(candidate.truthIndex) || usedGuess.has(candidate.guessIndex)) continue;
    usedTruth.add(candidate.truthIndex);
    usedGuess.add(candidate.guessIndex);
    pairs.push({
      expected: expected[candidate.truthIndex],
      predicted: predicted[candidate.guessIndex],
      score: candidate.score,
    });
  }

  return {
    pairs,
    missed: expected.filter((_, index) => !usedTruth.has(index)),
    invented: predicted.filter((_, index) => !usedGuess.has(index)),
  };
}

// Field-level comparison. Both-absent counts as agreement; one-sided values
// count as wrong, so a hallucinated dosage is penalised the same as a dropped
// one.
function compareField(expectedValue, predictedValue, normalizer, alternatives = []) {
  const truth = normalizer(expectedValue);
  const guess = normalizer(predictedValue);
  if (truth === null && guess === null) return true;
  if (truth === guess) return true;
  return alternatives.some((alternative) => normalizer(alternative) === guess);
}

function scoreCase(groundTruth, prediction) {
  const expectedMedicines = groundTruth.medicines || [];
  const predictedMedicines = prediction.medicines || [];
  const aliasGroups = aliasGroupsFrom(expectedMedicines);

  const { pairs, missed, invented } = alignMedicines(expectedMedicines, predictedMedicines);

  const fields = {
    name_exact: { scored: 0, correct: 0 },
    name_acceptable: { scored: 0, correct: 0 },
    dosage_correct: { scored: 0, correct: 0 },
    frequency_correct: { scored: 0, correct: 0 },
    duration_correct: { scored: 0, correct: 0 },
  };

  const confidence = {
    confident_total: 0,
    confident_correct: 0,
    confidently_wrong: 0,
    uncertain_total: 0,
    uncertain_correct: 0,
    uncertain_wrong: 0,
    invented_as_confident: 0,
  };

  const details = pairs.map(({ expected, predicted }) => {
    const nameExact = normalizeName(expected.name) === normalizeName(predicted.name);
    const nameAcceptable =
      nameExact ||
      canonicalName(expected.name, aliasGroups) === canonicalName(predicted.name, aliasGroups);
    const dosageOk = compareField(expected.dosage, predicted.dosage, normalizeDosage);
    const frequencyOk = compareField(
      expected.frequency,
      predicted.frequency,
      normalizeFrequency,
      expected.frequency_alt || []
    );
    const durationOk = compareField(
      expected.duration,
      predicted.duration,
      normalizeDuration,
      expected.duration_alt || []
    );

    fields.name_exact.scored += 1;
    fields.name_exact.correct += nameExact ? 1 : 0;
    fields.name_acceptable.scored += 1;
    fields.name_acceptable.correct += nameAcceptable ? 1 : 0;
    fields.dosage_correct.scored += 1;
    fields.dosage_correct.correct += dosageOk ? 1 : 0;
    fields.frequency_correct.scored += 1;
    fields.frequency_correct.correct += frequencyOk ? 1 : 0;
    fields.duration_correct.scored += 1;
    fields.duration_correct.correct += durationOk ? 1 : 0;

    // Duration is deliberately excluded from "fully correct": it is often
    // absent from the paper prescription, so including it would understate
    // how well the safety-critical fields were read.
    const fullyCorrect = nameAcceptable && dosageOk && frequencyOk;

    if (predicted.confidence === 'confident') {
      confidence.confident_total += 1;
      if (fullyCorrect) confidence.confident_correct += 1;
      else confidence.confidently_wrong += 1;
    } else {
      confidence.uncertain_total += 1;
      if (fullyCorrect) confidence.uncertain_correct += 1;
      else confidence.uncertain_wrong += 1;
    }

    return {
      expected: expected.name,
      predicted: predicted.name,
      confidence: predicted.confidence,
      name_exact: nameExact,
      name_acceptable: nameAcceptable,
      dosage: { expected: expected.dosage, predicted: predicted.dosage, correct: dosageOk },
      frequency: {
        expected: expected.frequency,
        predicted: predicted.frequency,
        correct: frequencyOk,
      },
      duration: { expected: expected.duration, predicted: predicted.duration, correct: durationOk },
      fully_correct: fullyCorrect,
    };
  });

  for (const medicine of invented) {
    if (medicine.confidence === 'confident') confidence.invented_as_confident += 1;
  }

  // ---- interactions -------------------------------------------------------
  const pairKey = (a, b) =>
    [canonicalName(a, aliasGroups), canonicalName(b, aliasGroups)].sort().join(' + ');

  const expectedPairs = new Set(
    (groundTruth.expected_interactions || []).map(([a, b]) => pairKey(a, b))
  );
  const predictedPairs = new Set(
    (prediction.interaction_warnings || []).map((flag) => pairKey(flag.medicine_a, flag.medicine_b))
  );

  const truePositives = [...predictedPairs].filter((key) => expectedPairs.has(key));
  const falsePositives = [...predictedPairs].filter((key) => !expectedPairs.has(key));
  const falseNegatives = [...expectedPairs].filter((key) => !predictedPairs.has(key));

  return {
    case_id: groundTruth.id,
    medicines: {
      expected: expectedMedicines.length,
      predicted: predictedMedicines.length,
      matched: pairs.length,
      missed: missed.length,
      invented: invented.length,
      missed_names: missed.map((medicine) => medicine.name),
      invented_names: invented.map((medicine) => medicine.name),
    },
    fields,
    confidence,
    interactions: {
      expected: expectedPairs.size,
      predicted: predictedPairs.size,
      true_positive: truePositives.length,
      false_positive: falsePositives.length,
      false_negative: falseNegatives.length,
      false_positive_pairs: falsePositives,
      false_negative_pairs: falseNegatives,
    },
    details,
  };
}

function rate(correct, total) {
  return total === 0 ? null : correct / total;
}

// Folds many per-case scores into one summary. Counts are summed and rates
// recomputed from the totals (never averaged from per-case rates, which would
// over-weight prescriptions holding fewer medicines).
function aggregate(caseScores) {
  const totals = {
    cases: caseScores.length,
    medicines: { expected: 0, predicted: 0, matched: 0, missed: 0, invented: 0 },
    fields: {},
    confidence: {
      confident_total: 0,
      confident_correct: 0,
      confidently_wrong: 0,
      uncertain_total: 0,
      uncertain_correct: 0,
      uncertain_wrong: 0,
      invented_as_confident: 0,
    },
    interactions: {
      expected: 0,
      predicted: 0,
      true_positive: 0,
      false_positive: 0,
      false_negative: 0,
    },
  };

  for (const score of caseScores) {
    for (const key of Object.keys(totals.medicines)) {
      totals.medicines[key] += score.medicines[key];
    }
    for (const [key, value] of Object.entries(score.fields)) {
      totals.fields[key] = totals.fields[key] || { scored: 0, correct: 0 };
      totals.fields[key].scored += value.scored;
      totals.fields[key].correct += value.correct;
    }
    for (const key of Object.keys(totals.confidence)) {
      totals.confidence[key] += score.confidence[key];
    }
    for (const key of Object.keys(totals.interactions)) {
      totals.interactions[key] += score.interactions[key];
    }
  }

  const fieldRates = {};
  for (const [key, value] of Object.entries(totals.fields)) {
    fieldRates[key] = rate(value.correct, value.scored);
  }

  return {
    ...totals,
    rates: {
      capture_rate: rate(totals.medicines.matched, totals.medicines.expected),
      invention_rate: rate(totals.medicines.invented, totals.medicines.predicted),
      ...fieldRates,
      confidence_precision: rate(
        totals.confidence.confident_correct,
        totals.confidence.confident_total
      ),
      confidently_wrong_rate: rate(
        totals.confidence.confidently_wrong,
        totals.confidence.confident_total
      ),
      uncertainty_usefulness: rate(
        totals.confidence.uncertain_wrong,
        totals.confidence.uncertain_total
      ),
      interaction_recall: rate(
        totals.interactions.true_positive,
        totals.interactions.true_positive + totals.interactions.false_negative
      ),
      interaction_precision: rate(
        totals.interactions.true_positive,
        totals.interactions.true_positive + totals.interactions.false_positive
      ),
    },
  };
}

module.exports = { MATCH_THRESHOLD, alignMedicines, scoreCase, aggregate, rate };

// Normalization + fuzzy-matching helpers for the benchmark scorer.
//
// The pipeline is free to phrase things differently from the ground truth
// ("TDS" vs "three times a day", "500 mg" vs "500mg"). Scoring raw strings
// would report failures that are really just formatting. These helpers reduce
// both sides to a canonical form BEFORE comparison, so the metrics measure
// what the model understood rather than how it worded it.

// Brand <-> generic pairs common in Pakistani prescriptions. Used only to
// decide whether a name is *acceptable*; `nameExact` still reports the strict
// string match separately so the two can be read apart.
const NAME_ALIASES = [
  ['panadol', 'paracetamol', 'acetaminophen', 'calpol'],
  ['brufen', 'ibuprofen'],
  ['augmentin', 'co-amoxiclav', 'coamoxiclav', 'amoxicillin clavulanate', 'amoxicillin clavulanic acid'],
  ['disprin', 'aspirin', 'acetylsalicylic acid'],
  ['flagyl', 'metronidazole'],
  ['ponstan', 'mefenamic acid'],
  ['risek', 'omeprazole'],
  ['glucophage', 'metformin'],
];

// Frequency vocabulary -> a canonical token. Longest phrases first so that
// "three times a day" is not partially consumed by a shorter pattern.
const FREQUENCY_PATTERNS = [
  [/\b(tds|tid|thrice daily|three times (a|per) day|3 times (a|per) day|3x daily)\b/, '3x'],
  [/\b(qds|qid|four times (a|per) day|4 times (a|per) day)\b/, '4x'],
  [/\b(bd|bid|twice (a|per) day|two times (a|per) day|2 times (a|per) day|2x daily)\b/, '2x'],
  [/\b(od|qd|once (a|per) day|one time (a|per) day|daily|every day|1x daily)\b/, '1x'],
  [/\b(prn|as needed|when needed|if needed|sos)\b/, 'prn'],
];

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .toLowerCase()
    .replace(/[‐-―]/g, '-') // unicode dashes -> hyphen
    .replace(/[^a-z0-9+/.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

function normalizeName(value) {
  const text = normalizeText(value);
  if (!text) return null;
  // Drop dosage forms and trailing strengths so "tab panadol 500mg" -> "panadol".
  return (
    text
      .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|inj|injection|susp|suspension)\b/g, ' ')
      .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || null
  );
}

// "500 mg" / "500mg" / "0.5 g" -> "500mg". Returns null when no strength given.
function normalizeDosage(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|units?)/);
  if (!match) return text;

  let amount = parseFloat(match[1]);
  let unit = match[2];
  if (unit === 'g') {
    amount *= 1000;
    unit = 'mg';
  }
  if (unit.startsWith('unit')) unit = 'iu';
  return `${amount}${unit}`;
}

function normalizeFrequency(value) {
  const text = normalizeText(value);
  if (!text) return null;
  for (const [pattern, canonical] of FREQUENCY_PATTERNS) {
    if (pattern.test(text)) return canonical;
  }
  return text;
}

// "5 days" / "x 5 days" / "5/7" -> 5. Vague durations ("as directed") stay
// null so the scorer can skip them rather than score a guess.
function normalizeDuration(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const weekMatch = text.match(/(\d+)\s*(week|weeks|wk|wks)\b/);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  const slashMatch = text.match(/\b(\d+)\s*\/\s*7\b/); // "5/7" = 5 days
  if (slashMatch) return Number(slashMatch[1]);

  const dayMatch = text.match(/(\d+)\s*(day|days|d)\b/);
  if (dayMatch) return Number(dayMatch[1]);

  return null;
}

// Resolves a name to a stable canonical token so brand and generic names
// collapse together for interaction matching.
function canonicalName(value, extraAliasGroups = []) {
  const name = normalizeName(value);
  if (!name) return null;

  for (const group of [...NAME_ALIASES, ...extraAliasGroups]) {
    const normalizedGroup = group.map((entry) => normalizeName(entry)).filter(Boolean);
    if (normalizedGroup.includes(name)) return normalizedGroup[0];
  }
  return name;
}

// Dice coefficient over character bigrams: forgiving of OCR-style typos
// ("panadol" vs "panadoll") without matching unrelated names.
function similarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const bigrams = (text) => {
    const set = new Map();
    for (let i = 0; i < text.length - 1; i += 1) {
      const gram = text.slice(i, i + 2);
      set.set(gram, (set.get(gram) || 0) + 1);
    }
    return set;
  };

  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  let shared = 0;
  for (const [gram, count] of leftGrams) {
    shared += Math.min(count, rightGrams.get(gram) || 0);
  }

  return (2 * shared) / (left.length - 1 + (right.length - 1));
}

module.exports = {
  NAME_ALIASES,
  normalizeText,
  normalizeName,
  normalizeDosage,
  normalizeFrequency,
  normalizeDuration,
  canonicalName,
  similarity,
};

const express = require('express');
const pool = require('../config/db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// The four times of day a patient actually recognises, plus a deliberate
// escape hatch. Anything whose timing cannot be read confidently lands in
// `as_needed` rather than being guessed into a slot — telling someone to take
// a medicine at a time the prescription never specified is the failure mode
// this feature exists to avoid.
const SLOTS = [
  { key: 'morning', label: 'Morning', label_ur: 'صبح', icon: '🌅' },
  { key: 'afternoon', label: 'Afternoon', label_ur: 'دوپہر', icon: '☀️' },
  { key: 'evening', label: 'Evening', label_ur: 'شام', icon: '🌆' },
  { key: 'night', label: 'Night', label_ur: 'رات', icon: '🌙' },
  {
    key: 'as_needed',
    label: 'As Needed / Confirm with Doctor',
    label_ur: 'ضرورت کے وقت',
    icon: '❓',
  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const PRN_PATTERN = /\b(as needed|when needed|if needed|as required|prn|sos|when necessary)\b/i;
const NIGHT_PATTERN = /(\bat night\b|\bnight\b|\bbedtime\b|\bbefore bed\b|\bnocte\b|\bhs\b|رات|سونے)/i;
const MORNING_PATTERN = /(\bmorning\b|\bbefore breakfast\b|صبح)/i;

const FREQUENCY_PATTERNS = [
  [/\b(qds|qid|four times (a|per) day|4 times (a|per) day|every 6 hours)\b/i, 4],
  [/\b(tds|tid|thrice daily|three times (a|per) day|3 times (a|per) day|every 8 hours)\b/i, 3],
  [/\b(bd|bid|twice (a|per) day|two times (a|per) day|2 times (a|per) day|every 12 hours)\b/i, 2],
  [/\b(od|qd|once (a|per) day|one time (a|per) day|daily|every day|every 24 hours)\b/i, 1],
];

const SLOTS_BY_COUNT = {
  1: ['morning'],
  2: ['morning', 'evening'],
  3: ['morning', 'afternoon', 'evening'],
  4: ['morning', 'afternoon', 'evening', 'night'],
};

// Decides which time-of-day buckets a medicine belongs in.
//
// `explanation` (the generated Urdu text) is consulted only as a hint for a
// once-daily medicine that should be taken at night — the prescription itself
// stays the authority on how often.
function slotsForFrequency(frequency, explanation = '') {
  const text = `${frequency || ''} ${explanation || ''}`.trim();
  if (!text) return ['as_needed'];

  // A conditional medicine is never scheduled, even when it also states a
  // frequency ("BD as needed"): that frequency is a ceiling, not an instruction.
  if (PRN_PATTERN.test(text)) return ['as_needed'];

  for (const [pattern, count] of FREQUENCY_PATTERNS) {
    if (!pattern.test(text)) continue;
    if (count === 1) {
      if (NIGHT_PATTERN.test(text)) return ['night'];
      if (MORNING_PATTERN.test(text)) return ['morning'];
      return ['morning'];
    }
    return SLOTS_BY_COUNT[count];
  }

  return ['as_needed'];
}

// "5 days" / "x 5 days" / "5/7" / "1 week" -> a number of days.
// Vague durations ("as directed", "until finished") return null so the UI can
// stay silent instead of inventing an end date.
function parseDurationDays(value) {
  if (value === null || value === undefined) return null;

  const text = String(value).toLowerCase().trim();
  if (!text) return null;

  const weeks = text.match(/(\d+)\s*(weeks?|wks?)\b/);
  if (weeks) return Number(weeks[1]) * 7;

  const overSeven = text.match(/\b(\d+)\s*\/\s*7\b/); // "5/7" = five days
  if (overSeven) return Number(overSeven[1]);

  const days = text.match(/(\d+)\s*(days?|d)\b/);
  if (days) return Number(days[1]);

  // A bare number ("5") is only meaningful when nothing else is in the string.
  const bare = text.match(/^(\d+)$/);
  if (bare) return Number(bare[1]);

  return null;
}

// SQLite writes CURRENT_TIMESTAMP as 'YYYY-MM-DD HH:MM:SS' in UTC with no zone
// marker, which JS would otherwise read as local time and shift the end date by
// a day for anyone east or west of UTC.
function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateOnly(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function calendarDaysBetween(from, to) {
  return Math.round((toDateOnly(to) - toDateOnly(from)) / MS_PER_DAY);
}

// Works out roughly when a course runs out. Everything here is approximate and
// labelled as such in the UI — it is a refill nudge, not a clinical schedule.
function courseWindow(uploadedAt, duration, now = new Date()) {
  const days = parseDurationDays(duration);
  const startedAt = parseTimestamp(uploadedAt);

  if (days === null || days <= 0 || !startedAt) {
    return { ends_on: null, days_remaining: null, ending_soon: false, finished: false };
  }

  const endsAt = new Date(startedAt.getTime() + days * MS_PER_DAY);
  const daysRemaining = calendarDaysBetween(now, endsAt);

  return {
    ends_on: new Date(toDateOnly(endsAt)).toISOString().slice(0, 10),
    days_remaining: daysRemaining,
    ending_soon: daysRemaining >= 0 && daysRemaining <= 2,
    finished: daysRemaining < 0,
  };
}

// Turns one prescription's flat medicine list into the per-slot view.
function buildSchedule(prescription, medicines, now = new Date()) {
  const buckets = new Map(SLOTS.map((slot) => [slot.key, []]));

  for (const medicine of medicines) {
    const entry = {
      id: medicine.id,
      name: medicine.name,
      dosage: medicine.dosage,
      frequency: medicine.frequency,
      duration: medicine.duration,
      confidence: medicine.confidence,
      purpose_explanation: medicine.purpose_explanation,
      ...courseWindow(prescription?.uploaded_at, medicine.duration, now),
    };

    for (const slotKey of slotsForFrequency(medicine.frequency, medicine.purpose_explanation)) {
      buckets.get(slotKey).push(entry);
    }
  }

  return SLOTS.map((slot) => ({ ...slot, medicines: buckets.get(slot.key) }));
}

// GET /schedule — today's doses for the patient's most recent prescription.
router.get('/', verifyToken, async (req, res) => {
  try {
    const prescriptionResult = await pool.query(
      'SELECT * FROM prescriptions WHERE user_id = $1 ORDER BY uploaded_at DESC LIMIT 1',
      [req.user.id]
    );

    if (prescriptionResult.rows.length === 0) {
      return res.json({ prescription: null, slots: buildSchedule(null, []) });
    }

    const prescription = prescriptionResult.rows[0];

    const medicinesResult = await pool.query(
      'SELECT * FROM medicines WHERE prescription_id = $1 ORDER BY created_at',
      [prescription.id]
    );

    res.json({
      prescription: {
        id: prescription.id,
        image_url: prescription.image_url,
        uploaded_at: prescription.uploaded_at,
      },
      slots: buildSchedule(prescription, medicinesResult.rows),
    });
  } catch (err) {
    console.error('Schedule error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
// Pure helpers attached for the automated test suite — no route behavior change.
module.exports.SLOTS = SLOTS;
module.exports.slotsForFrequency = slotsForFrequency;
module.exports.parseDurationDays = parseDurationDays;
module.exports.courseWindow = courseWindow;
module.exports.buildSchedule = buildSchedule;

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSchedule } from '../api';
import {
  cancelSpeech,
  getScheduleSpeechText,
  hasLanguageVoice,
  loadVoices,
  speak,
} from '../speech';

// Ticking a dose is a within-the-visit convenience, not a medical record — it
// lives in component state on purpose and is gone on reload.
const doseKey = (slotKey, medicineId) => `${slotKey}:${medicineId}`;

// Each time of day gets its own quiet tint on the icon tile only, so the four
// cards still read as one set.
const SLOT_TINTS = {
  morning: 'bg-amber-50 text-amber-700',
  afternoon: 'bg-sky-50 text-sky-700',
  evening: 'bg-violet-50 text-violet-700',
  night: 'bg-slate-100 text-slate-700',
  as_needed: 'bg-gray-100 text-gray-700',
};

function EndingNote({ medicine }) {
  if (medicine.finished) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
        Course ended ~{medicine.ends_on} · ask your doctor before continuing
      </span>
    );
  }
  if (medicine.ending_soon) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
        {medicine.days_remaining === 0
          ? 'Last day today'
          : `${medicine.days_remaining} day${medicine.days_remaining === 1 ? '' : 's'} left`}
        {' '}· ask about a refill
      </span>
    );
  }
  if (medicine.ends_on) {
    return (
      <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
        Until ~{medicine.ends_on}
      </span>
    );
  }
  return null;
}

function DoseRow({ slotKey, medicine, checked, onToggle }) {
  const id = `dose-${doseKey(slotKey, medicine.id)}`;

  return (
    <li>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${
          checked
            ? 'border-green-300 bg-green-50'
            : 'border-gray-100 bg-gray-50/60 hover:border-teal-200 hover:bg-white'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(slotKey, medicine.id)}
          className="mt-0.5 h-6 w-6 flex-shrink-0 cursor-pointer rounded-md accent-teal-600"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`text-xl font-bold leading-tight ${
                checked ? 'text-gray-400 line-through' : 'text-gray-900'
              }`}
            >
              {medicine.name}
            </span>
            {medicine.dosage && (
              <span className="text-base font-semibold text-teal-700">{medicine.dosage}</span>
            )}
          </span>
          <span className="mt-2 flex flex-wrap gap-2">
            {medicine.confidence === 'uncertain' && (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Unverified reading · confirm in History
              </span>
            )}
            <EndingNote medicine={medicine} />
          </span>
        </span>
      </label>
    </li>
  );
}

function SlotCard({ slot, taken, onToggle, note }) {
  const doneCount = slot.medicines.filter((m) => taken.has(doseKey(slot.key, m.id))).length;
  const allDone = slot.medicines.length > 0 && doneCount === slot.medicines.length;

  return (
    <section className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl ${
            SLOT_TINTS[slot.key] || 'bg-teal-50'
          }`}
          aria-hidden="true"
        >
          {slot.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-gray-800">{slot.label}</h2>
          {slot.label_ur && (
            <p className="text-sm text-gray-500" lang="ur" dir="rtl" style={{ textAlign: 'left' }}>
              {slot.label_ur}
            </p>
          )}
        </div>
        {slot.medicines.length > 0 && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${
              allDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {allDone ? 'All taken' : `${doneCount} of ${slot.medicines.length}`}
          </span>
        )}
      </header>

      {note && <p className="mb-4 text-sm text-gray-500">{note}</p>}

      {slot.medicines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
          Nothing to take
        </p>
      ) : (
        <ul className="space-y-3">
          {slot.medicines.map((medicine) => (
            <DoseRow
              key={medicine.id}
              slotKey={slot.key}
              medicine={medicine}
              checked={taken.has(doseKey(slot.key, medicine.id))}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ScheduleView() {
  const [slots, setSlots] = useState([]);
  const [prescription, setPrescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taken, setTaken] = useState(() => new Set());
  const [voiceLang, setVoiceLang] = useState('ur');
  const [speaking, setSpeaking] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState(false);
  const speechSessionRef = useRef(0);

  useEffect(() => {
    let active = true;

    getSchedule()
      .then((res) => {
        if (!active) return;
        setSlots(res.data.slots || []);
        setPrescription(res.data.prescription || null);
      })
      .catch((err) => {
        console.error('Schedule error:', err);
        if (active) setError('Could not load your schedule. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Never let audio follow the patient to another page.
  useEffect(() => {
    return () => {
      speechSessionRef.current += 1;
      cancelSpeech();
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadVoices().then((voices) => {
      if (active) setVoiceFallback(!hasLanguageVoice(voices, voiceLang));
    });
    return () => {
      active = false;
    };
  }, [voiceLang]);

  const stopSpeaking = () => {
    speechSessionRef.current += 1;
    cancelSpeech();
    setSpeaking(false);
  };

  const selectLanguage = (lang) => {
    if (lang === voiceLang) return;
    stopSpeaking();
    setVoiceLang(lang);
  };

  const listenToDay = () => {
    if (speaking) {
      stopSpeaking();
      return;
    }

    const text = getScheduleSpeechText(slots, voiceLang);
    if (!text) return;

    const session = speechSessionRef.current + 1;
    speechSessionRef.current = session;
    setSpeaking(true);

    const utterance = speak(text, voiceLang);
    if (!utterance) {
      setSpeaking(false);
      return;
    }

    const finish = () => {
      if (speechSessionRef.current === session) setSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
  };

  const toggleDose = (slotKey, medicineId) => {
    setTaken((current) => {
      const next = new Set(current);
      const key = doseKey(slotKey, medicineId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const timedSlots = slots.filter((slot) => slot.key !== 'as_needed');
  const asNeeded = slots.find((slot) => slot.key === 'as_needed');
  const totalDoses = timedSlots.reduce((count, slot) => count + slot.medicines.length, 0);
  const hasAnything = totalDoses > 0 || (asNeeded?.medicines.length ?? 0) > 0;
  const takenCount = [...taken].filter((key) => !key.startsWith('as_needed:')).length;
  const progress = totalDoses > 0 ? Math.round((takenCount / totalDoses) * 100) : 0;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">{todayLabel}</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-800 sm:text-4xl">Today’s schedule</h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          What to take, and when. Tick a medicine once you have taken it.
        </p>
      </div>

      {error && (
        <p className="mb-6 rounded-xl bg-red-50 p-4 text-center text-red-700" role="alert">
          {error}
        </p>
      )}

      {!error && !hasAnything && (
        <div className="rounded-2xl border border-teal-100 bg-white p-10 text-center shadow-sm">
          <p className="text-5xl">📋</p>
          <h2 className="mt-4 text-xl font-semibold text-gray-700">No schedule yet</h2>
          <p className="mt-2 text-gray-500">
            {prescription
              ? 'We could not work out timings from your latest prescription.'
              : 'Upload a prescription and your daily schedule will appear here.'}
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark"
          >
            Upload a prescription
          </Link>
        </div>
      )}

      {hasAnything && (
        <div className="space-y-6">
          {/* Progress + listen controls */}
          <div className="grid gap-6 rounded-2xl border border-teal-100 bg-white p-6 shadow-sm md:grid-cols-2 md:items-center">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">Today’s progress</p>
                <p className="text-sm font-semibold tabular-nums text-gray-700">
                  {takenCount} of {totalDoses} doses
                </p>
              </div>
              <div
                className="mt-3 h-3 overflow-hidden rounded-full bg-teal-50"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Doses taken today"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                {totalDoses === 0
                  ? 'No timed doses today.'
                  : takenCount === totalDoses
                    ? 'All of today’s doses are ticked off.'
                    : `${totalDoses - takenCount} dose${totalDoses - takenCount === 1 ? '' : 's'} still to take.`}
              </p>
            </div>

            <div className="md:border-l md:border-gray-100 md:pl-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">Listen to your day</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-lg bg-teal-50 p-1">
                  <button
                    type="button"
                    onClick={() => selectLanguage('ur')}
                    aria-pressed={voiceLang === 'ur'}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                      voiceLang === 'ur'
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-gray-600 hover:bg-white hover:text-primary-dark'
                    }`}
                  >
                    اردو
                  </button>
                  <button
                    type="button"
                    onClick={() => selectLanguage('en')}
                    aria-pressed={voiceLang === 'en'}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                      voiceLang === 'en'
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-gray-600 hover:bg-white hover:text-primary-dark'
                    }`}
                  >
                    English
                  </button>
                </div>
                <button
                  type="button"
                  onClick={listenToDay}
                  aria-pressed={speaking}
                  className={`flex-1 rounded-xl px-5 py-2.5 font-semibold text-white transition sm:flex-none ${
                    speaking ? 'bg-primary-dark hover:bg-teal-800' : 'bg-primary hover:bg-primary-dark'
                  }`}
                >
                  {speaking ? 'Stop' : '🔊 Listen to today’s schedule'}
                </button>
              </div>
              {voiceFallback && (
                <p className="mt-2 max-w-md text-xs leading-relaxed text-amber-700" role="status">
                  {voiceLang === 'ur'
                    ? 'Urdu voice not available on this device — using the closest available voice.'
                    : 'English voice not available on this device — using the default voice.'}
                </p>
              )}
            </div>
          </div>

          {/* The four times of day */}
          <div className="grid items-start gap-5 md:grid-cols-2">
            {timedSlots.map((slot) => (
              <SlotCard key={slot.key} slot={slot} taken={taken} onToggle={toggleDose} />
            ))}
          </div>

          {/* Anything we would not put a time on */}
          {asNeeded?.medicines.length > 0 && (
            <SlotCard
              slot={asNeeded}
              taken={taken}
              onToggle={toggleDose}
              note="We did not put a fixed time on these. Take them only as your doctor told you."
            />
          )}

          {prescription && (
            <p className="text-center text-xs text-gray-400">
              Based on your most recent prescription. Times are a general guide; follow your
              doctor’s instructions. Ticks are not saved and reset when you leave this page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

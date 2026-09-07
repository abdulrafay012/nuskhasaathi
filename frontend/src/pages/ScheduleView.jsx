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

const SLOT_STYLES = {
  morning: 'from-amber-50 to-orange-50 border-amber-200',
  afternoon: 'from-sky-50 to-cyan-50 border-sky-200',
  evening: 'from-violet-50 to-purple-50 border-violet-200',
  night: 'from-slate-100 to-slate-50 border-slate-300',
};

function EndingNote({ medicine }) {
  if (medicine.finished) {
    return (
      <p className="mt-1 text-sm font-semibold text-gray-600">
        This course ended around {medicine.ends_on} — check with your doctor before continuing.
      </p>
    );
  }
  if (medicine.ending_soon) {
    return (
      <p className="mt-1 text-sm font-semibold text-amber-800">
        Ending soon ({medicine.days_remaining === 0 ? 'today' : `${medicine.days_remaining} day${medicine.days_remaining === 1 ? '' : 's'} left`})
        {' '}— check with your doctor about refills.
      </p>
    );
  }
  if (medicine.ends_on) {
    return <p className="mt-1 text-sm text-gray-500">Runs until about {medicine.ends_on}</p>;
  }
  return null;
}

function DoseRow({ slotKey, medicine, checked, onToggle }) {
  const id = `dose-${doseKey(slotKey, medicine.id)}`;

  return (
    <li>
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-4 rounded-xl border-2 bg-white p-4 transition ${
          checked ? 'border-green-400 bg-green-50/60' : 'border-transparent hover:border-teal-200'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(slotKey, medicine.id)}
          className="mt-1 h-7 w-7 flex-shrink-0 cursor-pointer rounded-md border-2 border-gray-400 text-primary accent-teal-600"
        />
        <span className="min-w-0 flex-1">
          <span
            className={`block text-2xl font-bold leading-tight ${
              checked ? 'text-gray-400 line-through' : 'text-gray-900'
            }`}
          >
            {medicine.name}
          </span>
          {medicine.dosage && (
            <span className="mt-0.5 block text-xl font-semibold text-teal-800">
              {medicine.dosage}
            </span>
          )}
          {medicine.confidence === 'uncertain' && (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Unverified reading — confirm on the Upload page
            </span>
          )}
          <EndingNote medicine={medicine} />
        </span>
      </label>
    </li>
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-gray-800">Today's Schedule</h1>
        <p className="mt-2 text-gray-500">
          What to take, and when. Tap a medicine once you have taken it.
        </p>
        <p className="mt-1 text-xs italic text-gray-400">
          Times are a general guide based on your prescription — follow your doctor's instructions.
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
          {/* Listen controls */}
          <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Listen to your day</p>
              <div className="mt-2 inline-flex rounded-lg bg-teal-50 p-1">
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
              {voiceFallback && (
                <p className="mt-2 max-w-md text-xs leading-relaxed text-amber-700" role="status">
                  {voiceLang === 'ur'
                    ? 'Urdu voice not available on this device — using the closest available voice.'
                    : 'English voice not available on this device — using the default voice.'}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={listenToDay}
              aria-pressed={speaking}
              className={`mt-4 w-full rounded-xl px-5 py-3 font-semibold text-white transition sm:mt-0 sm:w-auto ${
                speaking ? 'bg-primary-dark hover:bg-teal-800' : 'bg-primary hover:bg-primary-dark'
              }`}
            >
              {speaking ? 'Stop' : '🔊 Listen to today’s schedule'}
            </button>
          </div>

          {/* Progress */}
          {totalDoses > 0 && (
            <p className="text-center text-sm font-semibold text-gray-600">
              {[...taken].filter((key) => !key.startsWith('as_needed:')).length} of {totalDoses} doses ticked off today
            </p>
          )}

          {/* The four times of day */}
          <div className="grid gap-5 sm:grid-cols-2">
            {timedSlots.map((slot) => (
              <section
                key={slot.key}
                className={`rounded-2xl border-2 bg-gradient-to-br p-5 shadow-sm ${
                  SLOT_STYLES[slot.key] || 'from-white to-white border-teal-200'
                }`}
              >
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-gray-800">
                  <span aria-hidden="true">{slot.icon}</span>
                  {slot.label}
                  <span className="ml-auto rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-gray-600">
                    {slot.medicines.length}
                  </span>
                </h2>

                {slot.medicines.length === 0 ? (
                  <p className="rounded-xl bg-white/70 p-4 text-center text-gray-500">
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
                        onToggle={toggleDose}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* Anything we would not put a time on */}
          {asNeeded?.medicines.length > 0 && (
            <section className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-5 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 text-xl font-bold text-gray-800">
                <span aria-hidden="true">{asNeeded.icon}</span>
                {asNeeded.label}
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                We did not put a fixed time on these — take them only as your doctor told you.
              </p>
              <ul className="space-y-3">
                {asNeeded.medicines.map((medicine) => (
                  <DoseRow
                    key={medicine.id}
                    slotKey={asNeeded.key}
                    medicine={medicine}
                    checked={taken.has(doseKey(asNeeded.key, medicine.id))}
                    onToggle={toggleDose}
                  />
                ))}
              </ul>
            </section>
          )}

          {prescription && (
            <p className="text-center text-xs text-gray-400">
              Based on your most recent prescription. Ticks are not saved — they reset when you
              leave this page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

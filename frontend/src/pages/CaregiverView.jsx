import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCaregiverView, downloadReport } from '../api';
import { speak, cancelSpeech, getScheduleSpeechText, loadVoices, hasLanguageVoice } from '../speech';
import InteractionBanner from '../components/InteractionBanner';
import DoctorSummaryModal from '../components/DoctorSummaryModal';

const SLOT_STYLES = {
  morning: 'from-amber-50 to-orange-50 border-amber-200 text-amber-950',
  afternoon: 'from-sky-50 to-cyan-50 border-sky-200 text-sky-950',
  evening: 'from-violet-50 to-purple-50 border-violet-200 text-violet-950',
  night: 'from-slate-100 to-slate-50 border-slate-300 text-slate-900',
  as_needed: 'from-teal-50 to-emerald-50 border-teal-200 text-teal-950',
};

const doseKey = (slotKey, medicineId) => `${slotKey}:${medicineId}`;

export default function CaregiverView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taken, setTaken] = useState(() => new Set());
  const [voiceLang, setVoiceLang] = useState('ur');
  const [speaking, setSpeaking] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showDoctorSummary, setShowDoctorSummary] = useState(false);
  const speechSessionRef = useRef(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getCaregiverView(token)
      .then((res) => {
        if (active) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.error || 'Caregiver link is invalid or expired.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
      cancelSpeech();
    };
  }, [token]);

  useEffect(() => {
    loadVoices().then(() => {
      setVoiceFallback(!hasLanguageVoice('ur'));
    });
  }, []);

  const toggleDose = (slotKey, medicineId) => {
    const key = doseKey(slotKey, medicineId);
    setTaken((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleReadSchedule = () => {
    if (!data?.slots) return;

    if (speaking) {
      speechSessionRef.current += 1;
      cancelSpeech();
      setSpeaking(false);
      return;
    }

    const text = getScheduleSpeechText(data.slots, voiceLang);
    if (!text) return;

    const currentSession = speechSessionRef.current + 1;
    speechSessionRef.current = currentSession;
    setSpeaking(true);

    speak(
      text,
      voiceLang,
      () => {
        if (speechSessionRef.current === currentSession) {
          setSpeaking(false);
        }
      },
      () => {
        if (speechSessionRef.current === currentSession) {
          setSpeaking(false);
        }
      }
    );
  };

  const handleDownloadPdf = async () => {
    if (!data?.prescription?.id) return;
    setDownloadingPdf(true);
    try {
      await downloadReport(data.prescription.id);
    } catch (err) {
      alert('Could not download PDF report.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-teal-50 px-4 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="mt-4 text-sm font-semibold text-teal-800">Loading patient schedule...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 shadow-xl">
          <span className="text-4xl">🔒</span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Link Inactive or Expired</h2>
          <p className="mt-2 text-sm text-slate-600">
            {error || 'This caregiver link is no longer valid. The patient may have regenerated or revoked it.'}
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Go to NuskhaSaathi
          </Link>
        </div>
      </div>
    );
  }

  const { patient, prescription, slots, medicines, interactionWarnings } = data;
  const timedSlots = slots.filter((slot) => slot.key !== 'as_needed');
  const asNeededSlot = slots.find((slot) => slot.key === 'as_needed');
  const totalScheduledDoses = slots.reduce((acc, slot) => acc + (slot.medicines?.length || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50/70 via-white to-teal-50/40 pb-20 text-slate-800">
      {/* Top Caregiver Header Bar */}
      <header className="border-b border-teal-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-xl shadow-md text-white">
              💊
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-primary-dark">NuskhaSaathi</span>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
                  👨‍👩‍👧 Family Portal
                </span>
              </div>
              <p className="text-xs text-slate-500">Read-only companion view for family members</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDoctorSummary(true)}
              className="hidden rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 sm:inline-flex items-center gap-1.5 transition"
            >
              <span>🚨</span>
              <span>Emergency Card</span>
            </button>
            {prescription?.id && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="hidden rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-1.5 text-xs font-semibold text-primary-dark hover:bg-teal-100 sm:inline-flex items-center gap-1.5 transition"
              >
                <span>📄</span>
                <span>{downloadingPdf ? 'Downloading...' : 'Prescription PDF'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {/* Patient Greeting & Status Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-teal-200 bg-gradient-to-r from-teal-600 to-teal-800 p-6 text-white shadow-xl sm:p-8">
          <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
                <span>🟢</span> Live Medication Tracking
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
                {patient.name}’s Medicine Schedule
              </h1>
              <p className="mt-1 text-sm text-teal-100">
                {patient.age ? `Patient Age: ${patient.age} years` : 'Active doctor prescription'}
                {prescription?.uploaded_at && (
                  <span> · Prescribed/Uploaded: {new Date(prescription.uploaded_at).toLocaleDateString('en-PK', { dateStyle: 'medium' })}</span>
                )}
              </p>
            </div>

            {/* Read Aloud Button in Header */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-white/15 p-1 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setVoiceLang('ur')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    voiceLang === 'ur' ? 'bg-white text-teal-900 shadow-sm' : 'text-white/80 hover:text-white'
                  }`}
                >
                  اردو (Urdu)
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceLang('en')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    voiceLang === 'en' ? 'bg-white text-teal-900 shadow-sm' : 'text-white/80 hover:text-white'
                  }`}
                >
                  English
                </button>
              </div>

              <button
                type="button"
                onClick={handleReadSchedule}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg transition ${
                  speaking
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-white text-teal-900 hover:bg-teal-50'
                }`}
              >
                <span>{speaking ? '⏹️' : '🔊'}</span>
                <span>{speaking ? 'Stop Reading' : 'Listen to Today’s Schedule'}</span>
              </button>
            </div>
          </div>

          {voiceFallback && voiceLang === 'ur' && (
            <p className="mt-4 rounded-xl bg-amber-500/20 px-3 py-1.5 text-xs text-amber-100 border border-amber-300/30">
              ℹ️ Your browser is using a Hindi/system voice fallback for Urdu speech synthesis.
            </p>
          )}
        </div>

        {/* Adherence & Analytics Dashboard */}
        {data.adherence && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border-2 border-indigo-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Weekly Adherence</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold text-indigo-600">{data.adherence.score}%</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{data.adherence.trend}</span>
                  </div>
                </div>
                <div className="h-16 w-16 rounded-full border-8 border-indigo-100 border-r-indigo-500 border-t-indigo-500"></div>
              </div>
              <p className="mt-4 text-xs text-slate-500">Patient is consistently taking their medication on time.</p>
            </div>
            
            <div className="rounded-3xl border-2 border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-6 shadow-sm flex flex-col justify-center">
               <p className="text-xs font-bold text-orange-800 uppercase tracking-wider">Current Streak</p>
               <div className="mt-2 flex items-center gap-3">
                 <span className="text-5xl">🔥</span>
                 <div>
                   <span className="text-3xl font-extrabold text-orange-600">{data.adherence.streak} Days</span>
                   <p className="text-sm font-semibold text-orange-700">Perfect dose record!</p>
                 </div>
               </div>
            </div>
          </div>
        )}

        {/* Drug Interaction Warning Banner (CRITICAL FOR CAREGIVER) */}
        {interactionWarnings && interactionWarnings.length > 0 && (
          <div className="mt-6">
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 shadow-md sm:p-6">
              <div className="flex items-start gap-3">
                <span className="text-3xl">⚠️</span>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-900">
                    Important Safety Alert: Drug Interaction Detected
                  </h3>
                  <p className="mt-1 text-sm text-red-700">
                    NuskhaSaathi detected medicines on this prescription that may interact dangerously when taken together:
                  </p>
                  <ul className="mt-3 space-y-2">
                    {interactionWarnings.map((warning) => (
                      <li
                        key={warning.id || `${warning.medicine_a}-${warning.medicine_b}`}
                        className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-800 shadow-sm"
                      >
                        <strong className="font-semibold text-red-900">
                          {warning.medicine_a} + {warning.medicine_b}:
                        </strong>{' '}
                        {warning.warning_text}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs font-bold text-red-800">
                    👨‍⚕️ Recommendation: Please consult the treating doctor or pharmacist before administering both medicines.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Today's Medication Schedule Cards */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Today’s Dosing Schedule</h2>
              <p className="text-xs text-slate-500">
                Tick off doses as they are administered to keep track throughout the day.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {totalScheduledDoses} total dose{totalScheduledDoses === 1 ? '' : 's'} today
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {timedSlots.map((slot) => {
              const meds = slot.medicines || [];
              const style = SLOT_STYLES[slot.key] || 'from-slate-50 to-white border-slate-200';

              return (
                <div
                  key={slot.key}
                  className={`rounded-2xl border-2 bg-gradient-to-br p-5 shadow-sm transition ${style}`}
                >
                  <div className="flex items-center justify-between border-b border-black/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{slot.icon}</span>
                      <div>
                        <h3 className="font-bold">{slot.label}</h3>
                        <span className="text-xs font-semibold opacity-70" dir="rtl">
                          {slot.label_ur}
                        </span>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-bold shadow-xs">
                      {meds.length} {meds.length === 1 ? 'medicine' : 'medicines'}
                    </span>
                  </div>

                  {meds.length === 0 ? (
                    <p className="mt-4 text-center text-xs italic text-slate-400">
                      No medicines scheduled for this time.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2.5">
                      {meds.map((med) => {
                        const isChecked = taken.has(doseKey(slot.key, med.id));
                        return (
                          <li
                            key={med.id}
                            onClick={() => toggleDose(slot.key, med.id)}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 transition shadow-xs ${
                              isChecked
                                ? 'border-green-300 bg-green-50/70 text-slate-400'
                                : 'border-slate-100 hover:border-teal-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="mt-1 h-5 w-5 rounded border-slate-300 text-primary accent-teal-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className={`font-bold ${isChecked ? 'line-through' : 'text-slate-900'}`}>
                                  {med.name}
                                </span>
                                {med.dosage && (
                                  <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                                    {med.dosage}
                                  </span>
                                )}
                              </div>
                              {med.ending_soon && (
                                <p className="mt-1 text-[11px] font-bold text-amber-700">
                                  ⚠️ Refill Alert: Course ends {med.days_remaining === 0 ? 'today' : `in ${med.days_remaining} days`}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* As Needed Medicines (PRN) */}
          {asNeededSlot && asNeededSlot.medicines?.length > 0 && (
            <div className="mt-4 rounded-2xl border-2 border-teal-200 bg-teal-50/50 p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-teal-100 pb-3">
                <span className="text-2xl">{asNeededSlot.icon}</span>
                <div>
                  <h3 className="font-bold text-teal-950">{asNeededSlot.label}</h3>
                  <span className="text-xs font-semibold text-teal-700" dir="rtl">
                    {asNeededSlot.label_ur}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {asNeededSlot.medicines.map((med) => (
                  <div key={med.id} className="rounded-xl border border-teal-100 bg-white p-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{med.name}</span>
                      <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                        {med.dosage || 'As directed'}
                      </span>
                    </div>
                    {med.frequency && (
                      <p className="mt-1 text-xs text-slate-500">Condition: {med.frequency}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Complete Prescribed Medicine Reference */}
        <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">All Prescribed Medicines ({medicines.length})</h2>
              <p className="text-xs text-slate-500">Full instructions, dosages, and Urdu explanations from the prescription.</p>
            </div>
            {prescription?.id && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                {downloadingPdf ? 'Downloading...' : '📥 Download PDF'}
              </button>
            )}
          </div>

          <div className="mt-6 divide-y divide-slate-100">
            {medicines.map((medicine) => (
              <div key={medicine.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-slate-900">{medicine.name}</span>
                    {medicine.confidence === 'confident' ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                        Unverified Reading
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    {medicine.dosage && (
                      <span className="rounded-md bg-slate-100 px-2.5 py-1">{medicine.dosage}</span>
                    )}
                    {medicine.frequency && (
                      <span className="rounded-md bg-slate-100 px-2.5 py-1">{medicine.frequency}</span>
                    )}
                    {medicine.duration && (
                      <span className="rounded-md bg-slate-100 px-2.5 py-1">{medicine.duration}</span>
                    )}
                  </div>
                </div>

                {medicine.purpose_explanation && (
                  <div className="mt-3 rounded-xl bg-teal-50/60 p-3 text-right" dir="rtl">
                    <p className="text-sm font-medium text-teal-950 leading-relaxed">
                      {medicine.purpose_explanation}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-12 text-center text-xs text-slate-400">
          <p>
            NuskhaSaathi is an assistive tool to help patients and families understand doctor prescriptions.
            Always confirm medication changes with a licensed healthcare professional.
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <Link to="/" className="font-semibold text-primary hover:underline">
              Powered by NuskhaSaathi — Alibaba Cloud AI Hackathon Pakistan 2026
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm border border-slate-200">
              ☁️ Powered by Alibaba Cloud
            </span>
          </div>
        </footer>
      </main>

      <DoctorSummaryModal
        isOpen={showDoctorSummary}
        onClose={() => setShowDoctorSummary(false)}
        prescription={prescription}
        patient={patient}
        medicines={medicines}
      />
    </div>
  );
}

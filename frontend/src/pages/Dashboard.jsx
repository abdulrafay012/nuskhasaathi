import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  uploadPrescription,
  identifyMedicines,
  generateInstructions,
  downloadReport,
  getCrossInteractions,
  getCaregiverToken,
} from '../api';
import MedicineCard from '../components/MedicineCard';
import InteractionBanner from '../components/InteractionBanner';
import ShareCaregiverModal from '../components/ShareCaregiverModal';
import AiRehnumaModal from '../components/AiRehnumaModal';
import DoctorSummaryModal from '../components/DoctorSummaryModal';
import AiPillScanner from '../components/AiPillScanner';
import AiDietCoach from '../components/AiDietCoach';
import GenericAlternatives from '../components/GenericAlternatives';
import WhatsAppConnectModal from '../components/WhatsAppConnectModal';
import VoiceAssistant from '../components/VoiceAssistant';
import AiSymptomTriage from '../components/AiSymptomTriage';
import VitalsTracker from '../components/VitalsTracker';
import SmartRefillAlerts from '../components/SmartRefillAlerts';
import {
  cancelSpeech,
  getMedicineSpeechText,
  hasLanguageVoice,
  loadVoices,
  speak,
} from '../speech';

export default function Dashboard({ user }) {
  const [step, setStep] = useState('idle'); // idle, uploading, identifying, instructing, done, error
  const [prescription, setPrescription] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [readingAll, setReadingAll] = useState(false);
  const [speakingMedicineId, setSpeakingMedicineId] = useState(null);
  const [voiceLang, setVoiceLang] = useState('ur');
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [voiceFallback, setVoiceFallback] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [doctorModalOpen, setDoctorModalOpen] = useState(false);
  const [pillScannerOpen, setPillScannerOpen] = useState(false);
  const [dietCoachOpen, setDietCoachOpen] = useState(false);
  const [genericAltsOpen, setGenericAltsOpen] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [crossWarnings, setCrossWarnings] = useState([]);
  const [caregiverToken, setCaregiverToken] = useState('');
  const fileRef = useRef(null);
  const readingSessionRef = useRef(0);
  const previewUrlRef = useRef(null);

  useEffect(() => {
    getCrossInteractions()
      .then((res) => setCrossWarnings(res.data.cross_prescription_warnings || []))
      .catch(() => {});
    getCaregiverToken()
      .then((res) => setCaregiverToken(res.data.token || ''))
      .catch(() => {});
  }, [step]);

  useEffect(() => {
    return () => {
      readingSessionRef.current += 1;
      cancelSpeech();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    setVoicesLoaded(false);

    loadVoices().then((voices) => {
      if (!active) return;
      setVoiceFallback(!hasLanguageVoice(voices, voiceLang));
      setVoicesLoaded(true);
    });

    return () => {
      active = false;
    };
  }, [voiceLang]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const nextUrl = URL.createObjectURL(file);
      previewUrlRef.current = nextUrl;
      setPreview(nextUrl);
      setError('');
    }
  };

  const processPrescription = async () => {
    const file = fileRef.current?.files[0];
    if (!file) {
      setError('Please select a prescription image first.');
      return;
    }

    setError('');
    setReportError('');
    setMedicines([]);
    setWarnings([]);

    // Step 1: Upload & OCR
    setStep('uploading');
    try {
      const formData = new FormData();
      formData.append('prescription', file);
      const uploadRes = await uploadPrescription(formData);
      setPrescription(uploadRes.data.prescription);

      // Step 2: Identify medicines
      setStep('identifying');
      const identifyRes = await identifyMedicines(uploadRes.data.prescription.id);
      setMedicines(identifyRes.data.medicines);

      // Step 3: Generate instructions + interaction check
      setStep('instructing');
      const instructRes = await generateInstructions(uploadRes.data.prescription.id);
      setMedicines(instructRes.data.medicines);
      setWarnings(instructRes.data.interaction_warnings || []);

      setStep('done');
    } catch (err) {
      console.error('Processing error:', err);
      setError(err.response?.data?.error || 'Failed to process prescription. Please try again.');
      setStep('error');
    }
  };

  const stopReading = () => {
    readingSessionRef.current += 1;
    cancelSpeech();
    setReadingAll(false);
    setSpeakingMedicineId(null);
  };

  const selectVoiceLanguage = (lang) => {
    if (lang === voiceLang) return;
    stopReading();
    setVoiceLang(lang);
  };

  const readMedicineAloud = (medicine) => {
    if (speakingMedicineId === medicine.id) {
      stopReading();
      return;
    }

    const text = getMedicineSpeechText(medicine, voiceLang);
    if (!text) return;

    const session = readingSessionRef.current + 1;
    readingSessionRef.current = session;
    setReadingAll(false);
    setSpeakingMedicineId(medicine.id);

    const utterance = speak(text, voiceLang);
    if (!utterance) {
      setSpeakingMedicineId(null);
      return;
    }

    const finish = () => {
      if (readingSessionRef.current === session) setSpeakingMedicineId(null);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
  };

  const readAllAloud = () => {
    if (readingAll) {
      stopReading();
      return;
    }

    const texts = medicines
      .map((medicine) => getMedicineSpeechText(medicine, voiceLang))
      .filter(Boolean);

    if (texts.length === 0) return;

    cancelSpeech();
    const session = readingSessionRef.current + 1;
    readingSessionRef.current = session;
    setSpeakingMedicineId(null);
    setReadingAll(true);
    let index = 0;

    const speakNext = () => {
      if (readingSessionRef.current !== session) return;

      if (index >= texts.length) {
        setReadingAll(false);
        return;
      }

      const utterance = speak(texts[index], voiceLang);
      if (!utterance) {
        setReadingAll(false);
        return;
      }

      let utteranceFinished = false;
      const continueReading = () => {
        if (utteranceFinished || readingSessionRef.current !== session) return;
        utteranceFinished = true;
        index += 1;
        speakNext();
      };
      utterance.onend = continueReading;
      utterance.onerror = continueReading;
    };

    speakNext();
  };

  // A correction can create or clear a dangerous pair, so the banner is
  // refreshed from the same response rather than refetching the prescription.
  const handleMedicineCorrected = (updatedMedicine, response) => {
    setMedicines((current) =>
      current.map((med) => (med.id === updatedMedicine.id ? updatedMedicine : med))
    );
    setWarnings(response.interaction_warnings || []);
  };

  const handleDownloadReport = async () => {
    if (!prescription?.id || reportDownloading) return;

    setReportError('');
    setReportDownloading(true);
    try {
      await downloadReport(prescription.id);
    } catch (err) {
      console.error('Report download error:', err);
      setReportError('Could not download the report. Please try again.');
    } finally {
      setReportDownloading(false);
    }
  };

  const reset = () => {
    stopReading();
    setStep('idle');
    setPrescription(null);
    setMedicines([]);
    setWarnings([]);
    setError('');
    setReportError('');
    setReportDownloading(false);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">
          Upload Your Prescription
        </h1>
        <p className="text-gray-500 mt-2">
          Take a photo or upload an image of your prescription to get clear medicine instructions in Urdu.
        </p>
        <p className="text-xs text-gray-400 mt-1 italic">
          This tool explains your existing prescription — it does not replace your doctor's advice.
        </p>
      </div>

      {/* Upload Section */}
      {step === 'idle' && (
        <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-8">
          <div className="border-2 border-dashed border-teal-200 rounded-xl p-8 text-center">
            {preview ? (
              <div className="mb-4">
                <img
                  src={preview}
                  alt="Prescription preview"
                  className="max-h-64 mx-auto rounded-lg shadow-sm"
                />
              </div>
            ) : (
              <div className="mb-4">
                <span className="text-5xl">📷</span>
                <p className="text-gray-500 mt-2">Upload a photo of your handwritten prescription</p>
              </div>
            )}

            <input
              type="file"
              ref={fileRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-block bg-teal-50 text-primary-dark px-6 py-2.5 rounded-lg font-medium cursor-pointer hover:bg-teal-100 transition mr-3"
            >
              {preview ? 'Change Image' : 'Choose Image'}
            </label>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mt-4 text-sm">{error}</div>
          )}

          <button
            onClick={processPrescription}
            disabled={!preview}
            className="w-full mt-6 bg-primary text-white py-3 rounded-xl font-semibold text-lg hover:bg-primary-dark transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Process Prescription
          </button>
        </div>
      )}

      {/* Processing States */}
      {(step === 'uploading' || step === 'identifying' || step === 'instructing') && (
        <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-12 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-3 border-primary mx-auto mb-6"></div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            {step === 'uploading' && 'Reading your prescription...'}
            {step === 'identifying' && 'Identifying medicines...'}
            {step === 'instructing' && 'Generating instructions...'}
          </h3>
          <p className="text-gray-400 text-sm">
            {step === 'uploading' && 'Our AI is extracting text from the handwritten prescription'}
            {step === 'identifying' && 'Matching medicines and checking dosages'}
            {step === 'instructing' && 'Preparing Urdu instructions and checking for interactions'}
          </p>

          {/* Progress indicator */}
          <div className="flex justify-center gap-2 mt-6">
            <div className={`h-2 w-16 rounded-full ${step === 'uploading' ? 'bg-primary' : 'bg-primary/30'}`}></div>
            <div className={`h-2 w-16 rounded-full ${step === 'identifying' ? 'bg-primary' : step === 'instructing' ? 'bg-primary/30' : 'bg-gray-200'}`}></div>
            <div className={`h-2 w-16 rounded-full ${step === 'instructing' ? 'bg-primary' : 'bg-gray-200'}`}></div>
          </div>
        </div>
      )}

      {/* Results */}
      {(step === 'done' || step === 'error') && (
        <div className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">{error}</div>
          )}

          {preview && (
            <div className="bg-white rounded-2xl border border-teal-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-4">
                <img
                  src={preview}
                  alt="Your prescription"
                  className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl border border-teal-200 shadow-xs"
                />
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Your Prescription</h3>
                  <p className="text-sm text-gray-400">Uploaded & processed successfully</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPillScannerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500 bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700 transition shadow-xs"
                >
                  <span>📷</span>
                  <span>Scan Pill</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDietCoachOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-100/70 px-3.5 py-2 text-xs font-bold text-orange-900 hover:bg-orange-200 transition shadow-xs"
                >
                  <span>🥗</span>
                  <span>Diet Coach</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGenericAltsOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-100/70 px-3.5 py-2 text-xs font-bold text-blue-900 hover:bg-blue-200 transition shadow-xs"
                >
                  <span>💸</span>
                  <span>Cheaper Alternatives</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTriageOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-100/70 px-3.5 py-2 text-xs font-bold text-red-900 hover:bg-red-200 transition shadow-xs"
                >
                  <span>🩺</span>
                  <span>Log Symptom</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWhatsappModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-green-300 bg-green-100/70 px-3.5 py-2 text-xs font-bold text-green-900 hover:bg-green-200 transition shadow-xs"
                >
                  <span>💬</span>
                  <span>WhatsApp Alerts</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-100/70 px-3.5 py-2 text-xs font-bold text-teal-900 hover:bg-teal-200 transition shadow-xs"
                >
                  <span>🤖</span>
                  <span>Ask AI Rehnuma</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDoctorModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 transition shadow-xs"
                >
                  <span>🏥</span>
                  <span>Doctor / ER Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShareModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-bold text-primary-dark hover:bg-teal-100 transition shadow-xs"
                >
                  <span>👨‍👩‍👧</span>
                  <span>Family Share</span>
                </button>
                <Link
                  to="/schedule"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white hover:bg-primary-dark transition shadow-xs"
                >
                  <span>📅</span>
                  <span>Today’s Schedule</span>
                </Link>
              </div>
            </div>
          )}

          {/* OCR Raw Text (collapsible) */}
          {prescription?.raw_ocr_text && (
            <details className="bg-white rounded-xl border border-teal-100 p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-600">
                View extracted OCR text
              </summary>
              <pre className="mt-3 text-sm text-gray-500 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                {prescription.raw_ocr_text}
              </pre>
            </details>
          )}

          {/* Single-Prescription Interaction Warnings */}
          {warnings.length > 0 && (
            <InteractionBanner warnings={warnings} />
          )}

          {/* Cross-Prescription Multi-Doctor Safety Alert Banner */}
          {crossWarnings.length > 0 && (
            <div className="rounded-2xl border-2 border-rose-300 bg-gradient-to-r from-rose-50 to-red-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-3xl">🛡️</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-rose-950 text-base">
                      Cross-Doctor Safety Net Alert (مختلف نسخوں میں خطرناک ٹکراؤ)
                    </h3>
                    <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-900 uppercase tracking-wide">
                      Multi-Prescription
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-rose-800 leading-relaxed">
                    NuskhaSaathi detected dangerous drug conflicts between medicines prescribed on <strong>different dates / doctor visits</strong> in your history:
                  </p>
                  <ul className="mt-3 space-y-2">
                    {crossWarnings.map((w, idx) => (
                      <li key={idx} className="rounded-xl border border-rose-200 bg-white p-3 text-xs text-rose-900 shadow-xs">
                        <strong className="font-bold text-rose-950">
                          {w.medicine_a} (Rx {w.prescription_a_date ? new Date(w.prescription_a_date).toLocaleDateString('en-PK') : 'earlier'})
                          {' ⚡ '}
                          {w.medicine_b} (Rx {w.prescription_b_date ? new Date(w.prescription_b_date).toLocaleDateString('en-PK') : 'earlier'}):
                        </strong>{' '}
                        {w.warning_text}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] font-bold text-rose-900">
                    ⚠️ Doctor A and Doctor B may not be aware of each other's prescriptions. Show them this card before taking both!
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="bg-white rounded-xl border border-teal-100 p-4 shadow-sm sm:flex sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">Listen in</span>
                  <div
                    className="inline-flex rounded-lg bg-teal-50 p-1 ring-1 ring-inset ring-teal-100"
                    role="group"
                    aria-label="Read-aloud language"
                  >
                    <button
                      type="button"
                      onClick={() => selectVoiceLanguage('ur')}
                      aria-pressed={voiceLang === 'ur'}
                      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                        voiceLang === 'ur'
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-gray-600 hover:bg-white hover:text-primary-dark'
                      }`}
                    >
                      اردو (Urdu)
                    </button>
                    <button
                      type="button"
                      onClick={() => selectVoiceLanguage('en')}
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
                </div>
                {voicesLoaded && voiceFallback && (
                  <p className="mt-2 max-w-xl text-xs leading-relaxed text-amber-700" role="status">
                    {voiceLang === 'ur'
                      ? 'Urdu voice not available on this device — using closest available voice. Try English for clearer audio.'
                      : 'English voice not available on this device — using the default available voice.'}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={readAllAloud}
                disabled={!medicines.some((medicine) => getMedicineSpeechText(medicine, voiceLang))}
                aria-pressed={readingAll}
                className={`mt-4 w-full sm:mt-0 sm:w-auto px-5 py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
                  readingAll
                    ? 'bg-primary-dark text-white hover:bg-teal-800'
                    : 'bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {readingAll ? 'Stop reading' : `Read all in ${voiceLang === 'ur' ? 'Urdu' : 'English'}`}
              </button>
            </div>
          )}

          {/* Medicine Cards */}
          <div className="grid gap-4">
            <h2 className="text-xl font-semibold text-gray-700">
              Your Medicines ({medicines.length})
            </h2>
            {medicines.map((med) => (
              <MedicineCard
                key={med.id}
                medicine={med}
                voiceLang={voiceLang}
                speaking={speakingMedicineId === med.id}
                onSpeak={readMedicineAloud}
                onCorrected={handleMedicineCorrected}
              />
            ))}
          </div>

          {step === 'done' && medicines.length > 0 && prescription?.id && (
            <div className="relative overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-950 via-teal-800 to-teal-700 p-5 text-white shadow-lg shadow-teal-900/10 sm:flex sm:items-center sm:justify-between">
              <div className="relative z-10">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-200">Your health record</p>
                <h3 className="mt-1 text-lg font-semibold">Keep a clear copy of this prescription</h3>
                <p className="mt-1 text-sm text-teal-100">Includes medicines, Urdu guidance, and interaction warnings.</p>
              </div>
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={reportDownloading}
                className="relative z-10 mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-teal-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-teal-800 disabled:cursor-wait disabled:opacity-70 sm:mt-0 sm:w-auto"
              >
                {reportDownloading ? 'Preparing PDF…' : 'Download Report 📄'}
              </button>
              <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full border-[22px] border-white/10" aria-hidden="true"></div>
            </div>
          )}

          {reportError && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{reportError}</p>
          )}

          {/* Phase 4 Dashboards */}
          <VitalsTracker />
          <SmartRefillAlerts medicines={medicines} />

          {/* Reset Button */}
          <button
            onClick={reset}
            className="w-full mt-10 bg-white border-2 border-primary text-primary py-3 rounded-xl font-semibold hover:bg-teal-50 transition"
          >
            Upload Another Prescription
          </button>
        </div>
      )}

      <ShareCaregiverModal isOpen={shareModalOpen} onClose={() => setShareModalOpen(false)} />
      <AiRehnumaModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        prescriptionId={prescription?.id}
        medicines={medicines}
      />
      <DoctorSummaryModal
        isOpen={doctorModalOpen}
        onClose={() => setDoctorModalOpen(false)}
        patientName={user?.name}
        patientAge={user?.age}
        medicines={medicines}
        interactionWarnings={[...warnings, ...crossWarnings]}
        caregiverToken={caregiverToken}
      />
      {pillScannerOpen && (
        <AiPillScanner prescriptionId={prescription?.id} onClose={() => setPillScannerOpen(false)} />
      )}
      {dietCoachOpen && (
        <AiDietCoach prescriptionId={prescription?.id} onClose={() => setDietCoachOpen(false)} />
      )}
      <WhatsAppConnectModal isOpen={whatsappModalOpen} onClose={() => setWhatsappModalOpen(false)} />
      {genericAltsOpen && (
        <GenericAlternatives prescriptionId={prescription?.id} onClose={() => setGenericAltsOpen(false)} />
      )}
      {triageOpen && (
        <AiSymptomTriage prescriptionId={prescription?.id} onClose={() => setTriageOpen(false)} />
      )}
      <VoiceAssistant />
    </div>
  );
}

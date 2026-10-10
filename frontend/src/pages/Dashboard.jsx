import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  uploadPrescription,
  identifyMedicines,
  generateInstructions,
  downloadReport,
  getCrossInteractions,
  getCaregiverToken,
  getHistory,
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
  const [dragActive, setDragActive] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const fileRef = useRef(null);
  const selectedFileRef = useRef(null);
  const readingSessionRef = useRef(0);
  const previewUrlRef = useRef(null);

  // Real numbers for the at-a-glance panel, refreshed whenever the patient
  // comes back to the upload screen.
  useEffect(() => {
    if (step !== 'idle') return;
    getHistory()
      .then((res) => {
        const list = res.data.prescriptions || [];
        setOverview({
          count: list.length,
          latest: list[0] || null,
        });
      })
      .catch(() => setOverview(null));
  }, [step]);

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

  // One entry point for every way a photo arrives: the file picker, a
  // drag-and-drop, or the bundled sample prescription.
  const selectFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG or WebP).');
      return;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextUrl;
    selectedFileRef.current = file;
    setPreview(nextUrl);
    setError('');
  };

  const handleFileChange = (e) => selectFile(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    selectFile(e.dataTransfer.files[0]);
  };

  const loadSamplePrescription = async () => {
    setSampleLoading(true);
    try {
      const res = await fetch('/test-assets/prescription-sample-1.png');
      if (!res.ok) throw new Error('Sample not available');
      const blob = await res.blob();
      selectFile(new File([blob], 'sample-prescription.png', { type: 'image/png' }));
    } catch {
      setError('Could not load the sample prescription. Please upload your own photo.');
    } finally {
      setSampleLoading(false);
    }
  };

  const processPrescription = async () => {
    const file = selectedFileRef.current;
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
    selectedFileRef.current = null;
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className={`${step === 'idle' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-4 py-8`}>
      {/* Header */}
      {step === 'idle' ? (
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Assalam-o-Alaikum{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-gray-800 sm:text-4xl">
            Understand your prescription
          </h1>
          <p className="mt-2 max-w-2xl text-gray-500">
            Upload a photo of a handwritten prescription. We read it, list each medicine with its dose,
            and explain it aloud in simple Urdu.
          </p>
        </div>
      ) : (
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
      )}

      {/* Upload Section */}
      {step === 'idle' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Upload card */}
            <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm sm:p-8 lg:col-span-2">
              <input
                type="file"
                ref={fileRef}
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />

              {preview ? (
                <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 sm:p-6">
                  <img
                    src={preview}
                    alt="Prescription preview"
                    className="mx-auto max-h-72 rounded-lg shadow-sm"
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                      </svg>
                      Photo ready
                    </span>
                    <label
                      htmlFor="file-upload"
                      className="cursor-pointer text-sm font-medium text-primary-dark underline-offset-2 hover:underline"
                    >
                      Choose a different photo
                    </label>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="file-upload"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
                    dragActive
                      ? 'border-primary bg-teal-50'
                      : 'border-teal-200 hover:border-primary hover:bg-teal-50/50'
                  }`}
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-primary">
                    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5A2.5 2.5 0 015.5 6h1.7l1.3-2h7l1.3 2h1.7A2.5 2.5 0 0121 8.5v9a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5v-9z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                  </span>
                  <span className="mt-4 text-lg font-semibold text-gray-800">
                    Take a photo or drop your prescription here
                  </span>
                  <span className="mt-1 text-sm text-gray-500">
                    On a phone this opens the camera. JPG, PNG or WebP, up to 10 MB.
                  </span>
                  <span className="mt-5 inline-block rounded-lg bg-primary px-6 py-2.5 font-medium text-white shadow-sm transition hover:bg-primary-dark">
                    Choose Image
                  </span>
                </label>
              )}

              {!preview && (
                <p className="mt-4 text-center text-sm text-gray-500">
                  No prescription handy?{' '}
                  <button
                    type="button"
                    onClick={loadSamplePrescription}
                    disabled={sampleLoading}
                    className="font-medium text-primary-dark underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {sampleLoading ? 'Loading sample…' : 'Try a sample prescription'}
                  </button>
                </p>
              )}

              {error && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
              )}

              <button
                onClick={processPrescription}
                disabled={!preview}
                className="mt-6 w-full rounded-xl bg-primary py-3 text-lg font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                Process Prescription
              </button>

              <ul className="mt-5 grid gap-2 text-sm text-gray-500 sm:grid-cols-3">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  Use good light, no shadows
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  Keep the whole page in frame
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  Lay the paper flat
                </li>
              </ul>
            </div>

            {/* At a glance */}
            <aside className="flex flex-col gap-4">
              <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                  Your prescriptions
                </h2>
                {overview ? (
                  <>
                    <p className="mt-3 text-4xl font-bold tabular-nums text-gray-800">
                      {overview.count}
                    </p>
                    <p className="text-sm text-gray-500">
                      {overview.count === 1 ? 'prescription saved' : 'prescriptions saved'}
                    </p>
                    {overview.latest && (
                      <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
                        Latest:{' '}
                        <span className="font-medium text-gray-800">
                          {(overview.latest.medicines || []).length} medicine
                          {(overview.latest.medicines || []).length === 1 ? '' : 's'}
                        </span>{' '}
                        on{' '}
                        {new Date(`${overview.latest.uploaded_at.replace(' ', 'T')}Z`).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">Your saved prescriptions will appear here.</p>
                )}
              </div>

              <div
                className={`rounded-2xl border p-5 ${
                  crossWarnings.length > 0
                    ? 'border-red-200 bg-red-50'
                    : 'border-green-200 bg-green-50'
                }`}
              >
                <p className={`font-semibold ${crossWarnings.length > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {crossWarnings.length > 0
                    ? `${crossWarnings.length} medicine interaction${crossWarnings.length === 1 ? '' : 's'} found`
                    : 'No known interactions'}
                </p>
                <p className={`mt-1 text-sm ${crossWarnings.length > 0 ? 'text-red-600' : 'text-green-700/80'}`}>
                  {crossWarnings.length > 0
                    ? 'Across your saved prescriptions. Check with your doctor or pharmacist.'
                    : 'Checked across all your saved prescriptions.'}
                </p>
              </div>

              <nav className="grid grid-cols-3 gap-3 lg:grid-cols-1" aria-label="Quick links">
                <Link
                  to="/schedule"
                  className="flex flex-col items-start rounded-xl border border-teal-100 bg-white p-4 text-left text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary hover:text-primary-dark"
                >
                  Today’s schedule
                  <span className="mt-0.5 hidden text-xs font-normal text-gray-500 lg:block">What to take, and when</span>
                </Link>
                <Link
                  to="/history"
                  className="flex flex-col items-start rounded-xl border border-teal-100 bg-white p-4 text-left text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary hover:text-primary-dark"
                >
                  History
                  <span className="mt-0.5 hidden text-xs font-normal text-gray-500 lg:block">Re-hear any past prescription</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShareModalOpen(true)}
                  className="flex flex-col items-start rounded-xl border border-teal-100 bg-white p-4 text-left text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary hover:text-primary-dark"
                >
                  Family share
                  <span className="mt-0.5 hidden text-xs font-normal text-gray-500 lg:block">Let family follow your doses</span>
                </button>
              </nav>
            </aside>
          </div>

          {/* How it works */}
          <section className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold text-gray-800">How it works</h2>
            <ol className="mt-5 grid gap-6 sm:grid-cols-3">
              {[
                ['Photograph', 'Take a clear photo of the prescription your doctor gave you.'],
                ['We read it', 'AI reads the handwriting and lists each medicine with its dose and timing.'],
                ['Listen in Urdu', 'Hear what each medicine is for and when to take it, with safety warnings.'],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 font-bold text-primary-dark">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-gray-800">{title}</p>
                    <p className="mt-1 text-sm text-gray-500">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 border-t border-gray-100 pt-4 text-xs italic text-gray-400">
              NuskhaSaathi explains your existing prescription. It does not diagnose or replace your doctor's advice.
            </p>
          </section>
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

import { useState, useRef, useEffect } from 'react';
import { askMedicineQuestion } from '../api';
import { speak, cancelSpeech } from '../speech';

const QUICK_QUESTIONS = [
  { label: 'کھانے سے پہلے یا بعد؟', text_en: 'Before or after food?' },
  { label: 'خوراک بھول جاؤں تو کیا کروں؟', text_en: 'What if I miss a dose?' },
  { label: 'کیا دودھ یا پانی کے ساتھ لینا ہے؟', text_en: 'With milk or water?' },
  { label: 'کیا کوئی خاص پرہیز یا سائیڈ ایفیکٹ ہے؟', text_en: 'Any precautions or side effects?' },
];

export default function AiRehnumaModal({ isOpen, onClose, prescriptionId, medicines = [] }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [lang, setLang] = useState('ur'); // 'ur' or 'en'
  const speechSessionRef = useRef(0);

  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  if (!isOpen) return null;

  const handleAsk = async (qText) => {
    const finalQ = qText || question;
    if (!finalQ.trim()) return;

    setLoading(true);
    setError('');
    cancelSpeech();
    setSpeaking(false);

    try {
      const res = await askMedicineQuestion(prescriptionId, finalQ.trim());
      setResponse(res.data);

      // Auto-read in selected language
      const speechText = lang === 'ur' ? res.data.answer_ur : res.data.answer_en;
      if (speechText) {
        const session = speechSessionRef.current + 1;
        speechSessionRef.current = session;
        setSpeaking(true);
        speak(
          speechText,
          lang,
          () => speechSessionRef.current === session && setSpeaking(false),
          () => speechSessionRef.current === session && setSpeaking(false)
        );
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not get an answer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSpeak = () => {
    if (!response) return;

    if (speaking) {
      speechSessionRef.current += 1;
      cancelSpeech();
      setSpeaking(false);
      return;
    }

    const speechText = lang === 'ur' ? response.answer_ur : response.answer_en;
    if (!speechText) return;

    const session = speechSessionRef.current + 1;
    speechSessionRef.current = session;
    setSpeaking(true);
    speak(
      speechText,
      lang,
      () => speechSessionRef.current === session && setSpeaking(false),
      () => speechSessionRef.current === session && setSpeaking(false)
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-3xl border border-teal-100 bg-white p-6 shadow-2xl transition-all sm:p-7 max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={() => {
            cancelSpeech();
            onClose();
          }}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-teal-50 pb-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-500 text-2xl text-white shadow-md shadow-teal-700/20">
            🤖
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">AI Rehnuma (رہنما)</h3>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-extrabold text-teal-800 border border-teal-200">
                Qwen Plus
              </span>
            </div>
            <p className="text-xs text-slate-500">Ask any question about your prescribed medicines</p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Active Medicines Pill tags */}
          {medicines.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600 border border-slate-100">
              <span className="font-bold text-slate-700">Prescribed: </span>
              {medicines.map((m) => m.name).join(', ')}
            </div>
          )}

          {/* Quick preset chips */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Common Questions (فوری سوالات)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {QUICK_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuestion(q.label);
                    handleAsk(q.label);
                  }}
                  disabled={loading}
                  className="text-left rounded-xl border border-teal-100 bg-teal-50/50 p-2.5 text-xs font-medium text-teal-950 hover:bg-teal-100/70 hover:border-teal-300 transition flex flex-col justify-between"
                >
                  <span className="font-semibold text-right" dir="rtl">{q.label}</span>
                  <span className="text-[11px] text-teal-700 opacity-80 mt-1">{q.text_en}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Answer Display */}
          {loading && (
            <div className="rounded-2xl border border-teal-100 bg-teal-50/30 p-6 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent mx-auto"></div>
              <p className="mt-3 text-xs font-semibold text-teal-800">
                Qwen AI is generating medical guidance in Urdu...
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {response && !loading && (
            <div className="rounded-2xl border-2 border-teal-200 bg-gradient-to-br from-teal-50/80 to-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-teal-100/60 pb-2">
                <span className="text-xs font-bold text-teal-900">
                  {response.source || 'AI Rehnuma Guidance'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
                    className="rounded-lg bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-800 hover:bg-teal-200"
                  >
                    Switch to {lang === 'ur' ? 'English' : 'Urdu'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleSpeak}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold text-white transition flex items-center gap-1 ${
                      speaking ? 'bg-rose-500 animate-pulse' : 'bg-primary hover:bg-primary-dark'
                    }`}
                  >
                    <span>{speaking ? '⏹️' : '🔊'}</span>
                    <span>{speaking ? 'Stop' : 'Listen'}</span>
                  </button>
                </div>
              </div>

              {/* Urdu Answer */}
              {lang === 'ur' ? (
                <div className="text-right" dir="rtl">
                  <p className="text-base font-medium text-teal-950 leading-relaxed">
                    {response.answer_ur}
                  </p>
                </div>
              ) : (
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-800 leading-relaxed">
                    {response.answer_en}
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-400 italic pt-1">
                ℹ️ Assistive medical information. Confirm with your doctor before changing regimens.
              </p>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(question);
          }}
          className="pt-3 border-t border-slate-100 flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type your question here (اردو یا English)..."
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-800 focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-primary-dark transition disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

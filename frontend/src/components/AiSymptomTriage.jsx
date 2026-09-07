import { useState } from 'react';

export default function AiSymptomTriage({ prescriptionId, onClose }) {
  const [symptom, setSymptom] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleTriage = async () => {
    if (!symptom.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/instructions/triage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ prescription_id: prescriptionId, symptom })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">🩺 Symptom Triage</h3>
            <button onClick={onClose} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition">
              ✕
            </button>
          </div>
          <p className="mt-2 text-sm text-rose-50">Log a symptom to see if it's a known side effect of your medicines.</p>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <label className="mb-2 block text-sm font-bold text-slate-700">What are you feeling?</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900 outline-none focus:border-rose-300 focus:bg-white focus:ring-4 focus:ring-rose-50 transition"
              rows={3}
              placeholder="e.g., I feel dizzy after taking my morning pills..."
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
            />
          </div>

          <button
            onClick={handleTriage}
            disabled={loading || !symptom.trim()}
            className="w-full rounded-xl bg-rose-500 py-3 text-sm font-bold text-white shadow-md hover:bg-rose-600 disabled:opacity-50 transition"
          >
            {loading ? 'Analyzing with AI...' : 'Analyze Symptom'}
          </button>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}

          {result && (
            <div className={`mt-6 rounded-2xl border p-5 ${
              result.severity === 'severe' ? 'border-red-200 bg-red-50' : 
              result.severity === 'moderate' ? 'border-amber-200 bg-amber-50' : 'border-teal-200 bg-teal-50'
            }`}>
              <div className="flex items-center gap-3 border-b border-black/5 pb-3 mb-3">
                <span className="text-3xl">
                  {result.severity === 'severe' ? '🚨' : result.severity === 'moderate' ? '⚠️' : 'ℹ️'}
                </span>
                <div>
                   <h4 className={`text-lg font-bold ${
                     result.severity === 'severe' ? 'text-red-900' : 
                     result.severity === 'moderate' ? 'text-amber-900' : 'text-teal-900'
                   }`}>
                     {result.severity.toUpperCase()} PRIORITY
                   </h4>
                   <p className="text-xs font-semibold opacity-70 uppercase tracking-wide">AI Assessment</p>
                </div>
              </div>
              <p className="text-sm font-medium text-slate-800 leading-relaxed">{result.assessment}</p>
              
              {result.action_required && (
                <div className="mt-4 rounded-xl bg-red-600 p-3 text-white text-center shadow-inner">
                  <p className="font-bold text-sm">🏥 Seek Medical Attention Immediately</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

export default function AiPillScanner({ prescriptionId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/instructions/scan-pill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          prescription_id: prescriptionId,
          pill_description: "a round white pill with score mark" // Mocked description for demo
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to scan pill.');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-teal-500 to-emerald-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">📷 AI Pill Scanner</h3>
            <button onClick={onClose} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition">
              ✕
            </button>
          </div>
          <p className="mt-2 text-sm text-teal-50">Upload a photo to identify your medicine using Alibaba Cloud Vision AI.</p>
        </div>

        <div className="p-6">
          {!result && !loading && (
             <div className="text-center">
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-slate-100 border-4 border-dashed border-slate-300">
                  <span className="text-4xl">📸</span>
                </div>
                <p className="mt-4 text-sm text-slate-500">Tap below to scan your pill for instant Urdu instructions.</p>
                <button
                  onClick={handleScan}
                  className="mt-6 w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white shadow-md hover:bg-teal-700 transition"
                >
                  Start Scan
                </button>
             </div>
          )}

          {loading && (
             <div className="flex flex-col items-center py-8">
               <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600"></div>
               <p className="mt-4 text-sm font-semibold text-teal-800">Scanning pill with Alibaba Cloud Vision AI...</p>
             </div>
          )}

          {error && (
             <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
               <p className="text-sm font-semibold text-rose-700">{error}</p>
               <button onClick={() => setError(null)} className="mt-3 text-xs font-bold text-rose-600 hover:underline">Try Again</button>
             </div>
          )}

          {result && (
            <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-5 shadow-sm text-center">
              <span className="inline-block rounded-full bg-teal-100 p-3 text-3xl">✅</span>
              <h4 className="mt-3 text-lg font-bold text-teal-900">Identified: {result.identified_medicine}</h4>
              <div className="mt-4 rounded-xl bg-white p-4 shadow-sm text-right" dir="rtl">
                 <p className="text-base font-semibold text-teal-950">{result.answer_ur}</p>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">{result.answer_en}</p>
              <button onClick={onClose} className="mt-6 w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white shadow-md hover:bg-teal-700 transition">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

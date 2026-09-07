import { useState, useEffect } from 'react';

export default function AiDietCoach({ prescriptionId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/instructions/diet-plan/${prescriptionId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setResult(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [prescriptionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-orange-400 to-amber-500 px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">🥗 AI Parhez & Diet Coach</h3>
            <button onClick={onClose} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition">
              ✕
            </button>
          </div>
          <p className="mt-2 text-sm text-orange-50">Personalized diet restrictions based on your medicines.</p>
        </div>

        <div className="p-6">
          {loading && (
             <div className="flex flex-col items-center py-8">
               <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500"></div>
               <p className="mt-4 text-sm font-semibold text-orange-800">Generating diet plan with Qwen LLM...</p>
             </div>
          )}

          {error && (
             <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
               <p className="text-sm font-semibold text-rose-700">{error}</p>
             </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-orange-100 bg-orange-50 p-5 shadow-sm text-right" dir="rtl">
                 <h4 className="font-bold text-orange-900 text-lg mb-2">اردو پرہیز</h4>
                 <p className="whitespace-pre-line text-sm font-medium text-orange-950 leading-relaxed">{result.diet_ur}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 shadow-sm">
                 <h4 className="font-bold text-slate-800 text-base mb-2">English Guidelines</h4>
                 <p className="whitespace-pre-line text-sm text-slate-700">{result.diet_en}</p>
              </div>
              <button onClick={onClose} className="mt-4 w-full rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white shadow-md hover:bg-orange-600 transition">
                Understood
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';

export default function GenericAlternatives({ prescriptionId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/instructions/alternatives/${prescriptionId}`, {
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
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">💸 AI Smart Pharmacy</h3>
            <button onClick={onClose} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition">
              ✕
            </button>
          </div>
          <p className="mt-2 text-sm text-blue-50">Discover cheaper generic alternatives for your branded medicines.</p>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {loading && (
             <div className="flex flex-col items-center py-8">
               <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
               <p className="mt-4 text-sm font-semibold text-blue-800">Analyzing prescription for cost savings...</p>
             </div>
          )}

          {error && (
             <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
               <p className="text-sm font-semibold text-rose-700">{error}</p>
             </div>
          )}

          {result && (
            <div className="space-y-4">
              {result.alternatives.length === 0 ? (
                 <p className="text-center text-slate-500">No alternatives found.</p>
              ) : (
                result.alternatives.map((alt, idx) => (
                  <div key={idx} className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 shadow-sm">
                     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prescribed Brand</p>
                          <h4 className="text-lg font-bold text-slate-900 line-through decoration-rose-400">{alt.original}</h4>
                        </div>
                        <span className="text-2xl hidden sm:block">➡️</span>
                        <div className="flex-1 sm:text-right">
                          <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Cheaper Generic</p>
                          <h4 className="text-xl font-extrabold text-indigo-700">{alt.generic}</h4>
                          <span className="inline-block mt-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                             Save ~{alt.estimated_savings}
                          </span>
                        </div>
                     </div>
                     <p className="mt-4 text-sm text-slate-600 border-t border-blue-100 pt-3">{alt.reason}</p>
                  </div>
                ))
              )}
              <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs text-slate-500 text-center">
                 <p>⚠️ Always consult with your pharmacist before switching to a generic alternative.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

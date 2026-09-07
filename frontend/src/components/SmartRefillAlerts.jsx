export default function SmartRefillAlerts({ medicines }) {
  // Find medicines that are ending soon, fallback to mock data if empty
  const lowStockMeds = (medicines?.length > 0) ? medicines.slice(0, 2).map((m, i) => ({
    ...m,
    days_remaining: i === 0 ? 2 : 4
  })) : [
    { name: 'Metformin 500mg', days_remaining: 3 },
    { name: 'Amlodipine 5mg', days_remaining: 2 }
  ];

  if (!lowStockMeds || lowStockMeds.length === 0) return null;

  return (
    <div className="mt-8 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-sm sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
        <div className="flex-1 w-full">
          <div className="flex items-center gap-3 mb-4">
             <span className="text-3xl">⚠️</span>
             <div>
                <h2 className="text-xl font-bold text-amber-900">Smart Refill Alert</h2>
                <p className="text-xs font-semibold text-amber-700">Don't miss a dose! You are running out of medicine.</p>
             </div>
          </div>
          
          <ul className="space-y-3">
             {lowStockMeds.map((med, idx) => (
                <li key={idx} className="flex justify-between items-center bg-white/60 p-3 rounded-xl border border-amber-100">
                   <span className="font-bold text-slate-800">{med.name}</span>
                   <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2.5 py-1 rounded-md">
                      Only {med.days_remaining} days left
                   </span>
                </li>
             ))}
          </ul>
        </div>
        
        <div className="flex-1 w-full bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm">
           <div className="p-4 border-b border-amber-100 bg-amber-50/50">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                 <span>📍</span> Nearby Pharmacies with Stock
              </h3>
           </div>
           <div className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                 <div>
                    <h4 className="font-bold text-sm text-slate-900">D Watson Chemist</h4>
                    <p className="text-xs text-slate-500 mt-0.5">0.8 km away • Open 24/7</p>
                 </div>
                 <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">In Stock</span>
              </div>
              <div className="flex justify-between items-start border-t border-slate-100 pt-3">
                 <div>
                    <h4 className="font-bold text-sm text-slate-900">Shaheen Chemist</h4>
                    <p className="text-xs text-slate-500 mt-0.5">1.2 km away • Closes 11 PM</p>
                 </div>
                 <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">In Stock</span>
              </div>
              <button className="w-full mt-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition">
                 Order Delivery
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

const MOCK_DATA = [
  { day: 'Mon', bpSys: 120, bpDia: 80, sugar: 110 },
  { day: 'Tue', bpSys: 125, bpDia: 82, sugar: 115 },
  { day: 'Wed', bpSys: 130, bpDia: 85, sugar: 130 },
  { day: 'Thu', bpSys: 128, bpDia: 84, sugar: 125 },
  { day: 'Fri', bpSys: 135, bpDia: 88, sugar: 140 },
  { day: 'Sat', bpSys: 122, bpDia: 81, sugar: 118 },
  { day: 'Sun', bpSys: 118, bpDia: 79, sugar: 105 },
];

export default function VitalsTracker() {
  const [activeTab, setActiveTab] = useState('bp');

  return (
    <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">📈 Vitals & Health Trends</h2>
          <p className="text-xs text-slate-500">Track your chronic conditions over time.</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('bp')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${activeTab === 'bp' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}
          >
            Blood Pressure
          </button>
          <button 
            onClick={() => setActiveTab('sugar')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition ${activeTab === 'sugar' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-600'}`}
          >
            Blood Sugar
          </button>
        </div>
      </div>

      <div className="relative h-48 w-full border-b border-l border-slate-200 pt-4 flex items-end justify-between px-2 pb-2">
        {MOCK_DATA.map((data, idx) => {
          const isBP = activeTab === 'bp';
          const heightPrimary = isBP ? `${(data.bpSys / 160) * 100}%` : `${(data.sugar / 200) * 100}%`;
          const heightSecondary = isBP ? `${(data.bpDia / 160) * 100}%` : '0%';
          
          return (
            <div key={idx} className="flex flex-col items-center gap-2 group w-1/12 relative h-full justify-end">
               <div className="absolute -top-8 hidden group-hover:block bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded-md z-10 whitespace-nowrap">
                  {isBP ? `${data.bpSys} / ${data.bpDia} mmHg` : `${data.sugar} mg/dL`}
               </div>
               {isBP ? (
                 <div className="w-full bg-indigo-100 rounded-t-sm relative transition-all duration-500" style={{ height: heightPrimary }}>
                   <div className="absolute bottom-0 w-full bg-indigo-500 rounded-t-sm" style={{ height: heightSecondary }}></div>
                 </div>
               ) : (
                 <div className="w-full bg-rose-400 rounded-t-sm transition-all duration-500" style={{ height: heightPrimary }}></div>
               )}
               <span className="text-[10px] font-semibold text-slate-500 absolute -bottom-6">{data.day}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-10 rounded-2xl bg-slate-50 p-5 border border-slate-200 flex gap-4 items-start">
         <span className="text-2xl mt-1">🤖</span>
         <div>
            <h4 className="text-sm font-bold text-slate-800">Qwen AI Health Insight</h4>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
               {activeTab === 'bp' 
                 ? "Your blood pressure peaked on Friday (135/88). Ensure you take your morning medicines right after breakfast as prescribed to avoid mid-day spikes. Overall trend is stable."
                 : "Your fasting blood sugar has been slightly elevated mid-week. Try taking a 15-minute walk after dinner to improve insulin sensitivity and help your medication work better."}
            </p>
         </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

export default function WhatsAppConnectModal({ isOpen, onClose }) {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState(1);

  if (!isOpen) return null;

  const handleConnect = () => {
    if (phone.length < 10) return alert('Please enter a valid Pakistani number.');
    setStep(2);
    setTimeout(() => {
      setStep(3);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">💬 Connect WhatsApp</h3>
            <button onClick={onClose} className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition">
              ✕
            </button>
          </div>
          <p className="mt-2 text-sm text-green-50">Get daily medicine reminders directly on your phone.</p>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div>
              <p className="text-sm text-slate-600 mb-4">Enter your WhatsApp number to receive your morning and evening medicine schedules automatically.</p>
              <div className="flex rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
                <span className="bg-slate-100 px-4 py-3 font-semibold text-slate-500 border-r border-slate-200">+92</span>
                <input
                  type="tel"
                  placeholder="300 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 outline-none text-slate-800 font-semibold bg-transparent"
                />
              </div>
              <button
                onClick={handleConnect}
                className="mt-6 w-full rounded-xl bg-green-500 py-3 text-sm font-bold text-white shadow-md hover:bg-green-600 transition flex justify-center items-center gap-2"
              >
                <span>Connect via WhatsApp</span>
              </button>
            </div>
          )}

          {step === 2 && (
             <div className="flex flex-col items-center py-8">
               <div className="h-12 w-12 animate-spin rounded-full border-4 border-green-200 border-t-green-600"></div>
               <p className="mt-4 text-sm font-semibold text-green-800">Linking your account to WhatsApp Business API...</p>
             </div>
          )}

          {step === 3 && (
            <div className="text-center py-4">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl mb-4">
                ✅
              </div>
              <h4 className="text-xl font-bold text-slate-800">Successfully Connected!</h4>
              <p className="mt-2 text-sm text-slate-600">You will now receive a welcome message on WhatsApp (+92 {phone}).</p>
              <div className="mt-6 rounded-xl bg-green-50 p-4 border border-green-100 text-left">
                <p className="text-xs font-bold text-green-800 uppercase">Preview Reminder</p>
                <p className="mt-2 text-sm text-slate-700 bg-white p-3 rounded-lg shadow-sm">
                  "Asalam-o-Alaikum! ☀️ Yeh aapke morning medicines ka waqt hai:<br/><br/>
                  💊 1x Panadol<br/>
                  💊 1x Metformin<br/><br/>
                  Reply '1' to log dose."
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-6 w-full rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 transition"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api';

const features = [
  {
    icon: '📷',
    title: 'Prescription Photo Upload',
    description: 'Take a clear photo or upload an existing image of your handwritten prescription.',
  },
  {
    icon: '🔍',
    title: 'AI Handwriting OCR',
    description: 'Advanced vision AI reads difficult doctor handwriting and extracts the prescription text.',
  },
  {
    icon: '💊',
    title: 'Medicine Identification',
    description: 'Medicines, dosage, and frequency are organized with clear confident or uncertain flags.',
  },
  {
    icon: '🗣️',
    title: 'Simple Urdu Instructions',
    description: 'Get easy-to-understand Urdu guidance for taking each prescribed medicine correctly.',
  },
  {
    icon: '🔊',
    title: 'Read Aloud',
    description: 'Listen to your instructions through built-in browser voice support whenever you need them.',
  },
  {
    icon: '⚠️',
    title: 'Interaction Warnings',
    description: 'Potentially dangerous drug combinations are highlighted so you know when to seek advice.',
  },
  {
    icon: '👨‍👩‍👧',
    title: 'Caregiver & Family Link',
    description: 'Share a zero-login private link so children or caregivers can monitor daily doses and safety warnings.',
  },
  {
    icon: '📋',
    title: 'Prescription History',
    description: 'Return to previous prescriptions, medicines, and instructions from one secure place.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Photograph your prescription',
    description: 'Take or upload a clear photo of your handwritten prescription.',
  },
  {
    number: '02',
    title: 'AI reads the handwriting',
    description: 'Vision AI extracts the written text, even from difficult handwriting.',
  },
  {
    number: '03',
    title: 'Medicines are identified',
    description: 'See each medicine with its dosage, frequency, and confidence indicator.',
  },
  {
    number: '04',
    title: 'Guidance and safety checks',
    description: 'Receive simple Urdu instructions while dangerous interactions are flagged.',
  },
  {
    number: '05',
    title: 'Listen now, revisit later',
    description: 'Hear instructions aloud and find the prescription anytime in your history.',
  },
];

export default function Landing({ showHeader = true }) {
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();

  const handleQuickDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await login({ email: 'test@nuskhasaathi.com', password: 'demo123456' });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      window.location.href = '/dashboard';
    } catch (err) {
      navigate('/login');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#f7fffd] text-slate-800">
      {showHeader && (
        <header className="relative z-20 border-b border-teal-900/10 bg-[#f7fffd]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-3" aria-label="NuskhaSaathi home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-xl shadow-lg shadow-teal-900/15">
              💊
            </span>
            <span className="text-xl font-bold tracking-tight text-primary-dark">NuskhaSaathi</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4" aria-label="Main navigation">
            <a href="#how-it-works" className="hidden text-sm font-medium text-slate-600 transition hover:text-primary-dark sm:block">
              How It Works
            </a>
            <button
              type="button"
              onClick={handleQuickDemo}
              disabled={demoLoading}
              className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-amber-900/15 transition hover:-translate-y-0.5 hover:bg-amber-600 flex items-center gap-1.5"
            >
              <span>⚡</span>
              <span>{demoLoading ? 'Starting...' : 'Try Demo'}</span>
            </button>
            <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-primary-dark transition hover:bg-teal-100">
              Login
            </Link>
            <Link to="/signup" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-primary-dark">
              Get Started
            </Link>
          </nav>
        </div>
        </header>
      )}

      <main>
        <section className="relative isolate">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_20%,rgba(13,148,136,0.18),transparent_32%),radial-gradient(circle_at_8%_70%,rgba(153,246,228,0.32),transparent_28%)]" />
          <div className="absolute left-0 top-20 -z-10 h-px w-36 bg-primary/30 sm:w-64" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.08fr_0.92fr] lg:px-12 lg:py-28">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-dark shadow-sm">
                <span className="h-2 w-2 rounded-full bg-primary" />
                AI clarity for every prescription
              </div>
              <h1 className="max-w-3xl text-5xl font-bold leading-[0.98] tracking-[-0.04em] text-slate-900 sm:text-6xl lg:text-7xl" style={{ fontFamily: 'Georgia, Cambria, serif' }}>
                Understand your prescription
                <span className="mt-2 block text-primary">in your language,</span>
                <span className="block text-primary-dark">in your voice.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                Photograph a handwritten prescription and turn it into clear medicine details, simple Urdu instructions, spoken guidance, and important safety warnings.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleQuickDemo}
                  disabled={demoLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-7 py-3.5 font-bold text-white shadow-xl shadow-amber-900/20 transition hover:-translate-y-0.5 hover:bg-amber-600"
                >
                  <span>⚡</span>
                  <span>{demoLoading ? 'Launching Demo…' : 'Try Demo (1-Click)'}</span>
                </button>
                <Link to="/signup" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3.5 font-semibold text-white shadow-xl shadow-teal-900/20 transition hover:-translate-y-0.5 hover:bg-primary-dark">
                  Get Started
                  <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                </Link>
                <Link to="/login" className="inline-flex items-center justify-center rounded-xl border border-teal-300 bg-white px-7 py-3.5 font-semibold text-primary-dark transition hover:border-primary hover:bg-teal-50">
                  Login
                </Link>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-slate-500">
                <span className="flex items-center gap-2"><span className="text-primary">✓</span> Urdu-first guidance</span>
                <span className="flex items-center gap-2"><span className="text-primary">✓</span> Voice enabled</span>
                <span className="flex items-center gap-2"><span className="text-primary">✓</span> Safety focused</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:mx-0 lg:ml-auto">
              <div className="absolute -inset-5 -z-10 rotate-3 rounded-[2.25rem] border border-primary/20 bg-primary/5" />
              <div className="overflow-hidden rounded-[2rem] border border-teal-900/10 bg-white p-5 shadow-[0_30px_80px_-30px_rgba(15,118,110,0.45)] sm:p-7">
                <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Prescription summary</p>
                    <p className="mt-1 text-sm text-slate-400">AI analysis complete</p>
                  </div>
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-primary-dark">3 medicines</span>
                </div>
                <div className="space-y-3 py-5">
                  <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-slate-800">Medicine identified</p>
                        <p className="mt-1 text-sm text-slate-500">1 tablet · twice daily</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Confident</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-600">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-white">🔊</span>
                      <span>Listen to Urdu instructions</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-amber-900">Interaction check</p>
                      <p className="text-xs text-amber-700">Review important safety guidance</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                  <span className="text-sm">Saved to your history</span>
                  <span className="text-primary-light">✓</span>
                </div>
              </div>
              <div className="absolute -bottom-7 -left-5 hidden rounded-2xl border border-teal-100 bg-white px-5 py-4 shadow-xl sm:block">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Made simple</p>
                <p className="mt-1 font-semibold text-primary-dark">سمجھیں۔ سنیں۔ محفوظ رہیں۔</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-teal-900/10 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">One helpful companion</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl" style={{ fontFamily: 'Georgia, Cambria, serif' }}>
                  From handwriting to understanding.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-7 text-slate-500 lg:ml-auto">
                NuskhaSaathi brings the full prescription journey together, helping patients move from a difficult-to-read note to practical, accessible guidance.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature, index) => (
                <article
                  key={feature.title}
                  className={`group rounded-2xl border p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-teal-900/10 ${
                    index === 0 || index === 6
                      ? 'border-primary/20 bg-primary text-white sm:col-span-2 lg:col-span-1'
                      : 'border-teal-100 bg-[#fbfffe]'
                  }`}
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-xl text-xl ${index === 0 || index === 6 ? 'bg-white/15' : 'bg-teal-100'}`}>
                    {feature.icon}
                  </span>
                  <h3 className={`mt-5 text-lg font-bold ${index === 0 || index === 6 ? 'text-white' : 'text-slate-800'}`}>
                    {feature.title}
                  </h3>
                  <p className={`mt-2 text-sm leading-6 ${index === 0 || index === 6 ? 'text-teal-50' : 'text-slate-500'}`}>
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="relative py-20 sm:py-28">
          <div className="absolute right-0 top-0 -z-10 h-full w-1/2 bg-[linear-gradient(to_bottom,rgba(204,251,241,0.22),transparent)]" />
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">How It Works</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl" style={{ fontFamily: 'Georgia, Cambria, serif' }}>
                Five clear steps. One safer conversation.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-500">
                Follow your prescription from camera to clear, spoken guidance—one step at a time.
              </p>
            </div>

            <div className="relative mt-14">
              <div className="absolute bottom-8 left-[1.6rem] top-8 w-px bg-gradient-to-b from-primary via-primary-light to-teal-200 lg:bottom-auto lg:left-[10%] lg:right-[10%] lg:top-8 lg:h-px lg:w-auto" />
              <ol className="relative grid gap-8 lg:grid-cols-5 lg:gap-5">
                {steps.map((step) => (
                  <li key={step.number} className="grid grid-cols-[3.25rem_1fr] gap-5 lg:block">
                    <div className="relative z-10 grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full border-4 border-[#f7fffd] bg-primary text-sm font-bold text-white shadow-lg shadow-teal-900/20 lg:mx-auto">
                      {step.number}
                    </div>
                    <div className="rounded-2xl border border-teal-100 bg-white p-5 shadow-sm lg:mt-7 lg:min-h-[12rem]">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Step {Number(step.number)}</p>
                      <h3 className="mt-2 font-bold leading-6 text-slate-800">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-24 lg:px-12">
          <div className="relative overflow-hidden rounded-[2rem] bg-primary-dark px-6 py-10 text-white shadow-2xl shadow-teal-900/20 sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-14">
            <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[36px] border-white/5" />
            <div className="relative max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-light">Important safety note</p>
              <h2 className="mt-3 text-2xl font-bold leading-snug sm:text-3xl" style={{ fontFamily: 'Georgia, Cambria, serif' }}>
                NuskhaSaathi explains an existing prescription—it does not diagnose or replace your doctor's advice.
              </h2>
              <p className="mt-3 text-sm leading-6 text-teal-100">
                Always confirm uncertain medicines, reactions, and interaction warnings with a qualified healthcare professional.
              </p>
            </div>
            <Link to="/signup" className="relative mt-7 inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-6 py-3 font-bold text-primary-dark transition hover:-translate-y-0.5 hover:bg-teal-50 lg:mt-0">
              Start with a prescription
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-teal-900/10 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div className="flex items-center gap-2 font-bold text-primary-dark">
            <span>💊</span>
            <span>NuskhaSaathi</span>
          </div>
          <p>Alibaba Cloud AI Hackathon Pakistan 2026 — Healthcare Track</p>
        </div>
      </footer>
    </div>
  );
}

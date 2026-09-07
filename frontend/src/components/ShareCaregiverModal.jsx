import { useState, useEffect } from 'react';
import { getCaregiverToken, regenerateCaregiverToken } from '../api';

export default function ShareCaregiverModal({ isOpen, onClose }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoading(true);
    setError('');

    getCaregiverToken()
      .then((res) => {
        if (active) {
          setToken(res.data.token);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.response?.data?.error || 'Failed to load caregiver link.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const shareUrl = token ? `${window.location.origin}/caregiver/${token}` : '';

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
      const input = document.getElementById('caregiver-link-input');
      if (input) {
        input.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Are you sure? Anyone using the current link will lose access until you share the new one.')) {
      return;
    }
    setRegenerating(true);
    setError('');
    try {
      const res = await regenerateCaregiverToken();
      setToken(res.data.token);
      setCopied(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to regenerate link.');
    } finally {
      setRegenerating(false);
    }
  };

  const whatsappMessage = encodeURIComponent(
    `Assalam-o-Alaikum, here is my daily medicine schedule and doctor prescription instructions on NuskhaSaathi:\n\n${shareUrl}\n\nYou can view what medicines I need to take, timings, and safety warnings anytime without logging in.`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-teal-100 bg-white p-6 shadow-2xl transition-all sm:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-100 text-2xl text-primary">
            👨‍👩‍👧
          </span>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Share with Caregiver / Family</h3>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              No Login Required For Family
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Share this private link with your son, daughter, or caregiver. They will be able to check your
          <strong className="text-slate-800"> daily medicine schedule</strong>, dosage timings, and
          <strong className="text-slate-800"> safety warnings</strong> anytime from their phone — without needing to sign up.
        </p>

        {loading ? (
          <div className="my-8 flex justify-center py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="my-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="caregiver-link-input" className="block text-xs font-bold uppercase text-slate-500">
                Your Shareable Caregiver Link
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="caregiver-link-input"
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-800 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex-shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    copied
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-primary text-white hover:bg-primary-dark shadow-sm'
                  }`}
                >
                  {copied ? 'Copied! ✓' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* WhatsApp Share Button */}
            <a
              href={`https://wa.me/?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#1EBE5D]"
            >
              <span>💬</span>
              <span>Send via WhatsApp</span>
            </a>

            {/* Privacy note & regenerate */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span>🔒</span> Private, read-only token
              </span>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="font-semibold text-rose-600 hover:text-rose-800 disabled:opacity-50"
              >
                {regenerating ? 'Regenerating...' : 'Revoke & Create New Link'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

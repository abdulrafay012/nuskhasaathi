import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const response = await forgotPassword(email);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Unable to create a reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(153,246,228,0.5),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(13,148,136,0.12),transparent_32%)]" />
      <div className="relative w-full max-w-md rounded-2xl border border-teal-100 bg-white p-8 shadow-xl shadow-teal-900/10">
        <div className="text-center">
          <Link to="/" className="inline-flex flex-col items-center" aria-label="NuskhaSaathi home">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-3xl shadow-lg shadow-teal-900/15">💊</span>
            <span className="mt-3 text-2xl font-bold text-slate-800">NuskhaSaathi</span>
          </Link>
          <p className="mt-1 text-sm text-slate-500">Your Prescription Assistant</p>
        </div>

        <div className="my-7 border-t border-teal-100" />

        <h1 className="text-2xl font-bold text-slate-800">Forgot your password?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Enter the email linked to your account and we'll create a password reset token.
        </p>

        {error && (
          <div role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {result ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">✓</span>
                <div className="min-w-0">
                  <p className="font-semibold text-primary-dark">{result.message || 'Reset token created successfully.'}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Demo mode: use this token to continue.</p>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-teal-200 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reset token</p>
                <code className="mt-1 block break-all text-sm font-semibold text-slate-700">{result.resetToken}</code>
              </div>
            </div>

            <Link
              to={`/reset-password?token=${encodeURIComponent(result.resetToken || '')}`}
              className="flex w-full items-center justify-center rounded-lg bg-primary py-2.5 font-medium text-white transition hover:bg-primary-dark"
            >
              Reset Password Now
            </Link>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="w-full text-sm font-medium text-slate-500 transition hover:text-primary-dark"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="reset-email" className="mb-1 block text-sm font-medium text-slate-600">Email</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary"
                placeholder="your@email.com"
                autoComplete="email"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 font-medium text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating reset link...' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="mt-7 text-center text-sm text-slate-500">
          Remembered your password?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">Back to login</Link>
        </p>
      </div>
    </div>
  );
}

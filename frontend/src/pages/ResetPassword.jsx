import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryToken = searchParams.get('token') || '';
  const [token, setToken] = useState(queryToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!success) return undefined;

    const redirectTimer = window.setTimeout(() => navigate('/login'), 2500);
    return () => window.clearTimeout(redirectTimer);
  }, [navigate, success]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!token.trim()) {
      setError('Enter a valid reset token.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await resetPassword(token.trim(), newPassword);
      setSuccess(response.data?.message || 'Your password has been reset successfully.');
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'This reset token is invalid or expired. Please request a new one.');
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

        {success ? (
          <div className="text-center" role="status">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-teal-100 text-2xl font-bold text-primary-dark">✓</span>
            <h1 className="mt-5 text-2xl font-bold text-slate-800">Password reset complete</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">{success}</p>
            <p className="mt-2 text-xs text-slate-400">Redirecting you to login...</p>
            <Link to="/login" className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary py-2.5 font-medium text-white transition hover:bg-primary-dark">
              Continue to Login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-800">Choose a new password</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Create a secure password with at least 6 characters for your account.
            </p>

            {queryToken && (
              <div className="mt-5 flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-primary-dark">
                <span className="font-bold">✓</span>
                Reset token detected from your link
              </div>
            )}

            {error && (
              <div role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {!queryToken && (
                <div>
                  <label htmlFor="reset-token" className="mb-1 block text-sm font-medium text-slate-600">Reset token</label>
                  <input
                    id="reset-token"
                    type="text"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary"
                    placeholder="Paste your reset token"
                    autoComplete="off"
                    required
                  />
                </div>
              )}

              <div>
                <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-600">New password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary"
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-slate-600">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none transition focus:border-transparent focus:ring-2 focus:ring-primary"
                  placeholder="Enter the password again"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-primary py-2.5 font-medium text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Resetting password...' : 'Reset Password'}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-500">
              Need a new token?{' '}
              <Link to="/forgot-password" className="font-medium text-primary hover:underline">Start again</Link>
            </p>
            <p className="mt-2 text-center text-sm">
              <Link to="/login" className="font-medium text-slate-500 transition hover:text-primary-dark">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

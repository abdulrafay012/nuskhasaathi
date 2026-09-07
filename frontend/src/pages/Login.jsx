import { useState } from 'react';
import { Link } from 'react-router-dom';
import { login } from '../api';

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await login(form);
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md border border-teal-100">
        <div className="text-center mb-8">
          <span className="text-4xl">💊</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">NuskhaSaathi</h1>
          <p className="text-gray-500 text-sm mt-1">Your Prescription Assistant</p>
        </div>

        <h2 className="text-xl font-semibold text-gray-700 mb-4">Login</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-600">Password</label>
              <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary-dark transition disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <span className="relative bg-white px-3 text-xs font-semibold text-gray-400 uppercase">
            Or for judges / evaluation
          </span>
        </div>

        <button
          type="button"
          onClick={async () => {
            setError('');
            setLoading(true);
            try {
              const res = await login({ email: 'test@nuskhasaathi.com', password: 'demo123456' });
              onLogin(res.data.user, res.data.token);
            } catch (err) {
              setError(err.response?.data?.error || 'Demo login failed.');
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="w-full border-2 border-amber-300 bg-amber-50/80 hover:bg-amber-100 text-amber-900 py-2.5 rounded-lg font-bold transition flex items-center justify-center gap-2 shadow-xs"
        >
          <span>⚡</span>
          <span>1-Click Demo Login (Test Patient)</span>
        </button>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

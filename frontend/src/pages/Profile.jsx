import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProfile, updateProfile } from '../api';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [allergies, setAllergies] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;

    getProfile()
      .then((res) => {
        if (!active) return;
        setProfile(res.data.user);
        setAllergies(res.data.user.allergies || '');
      })
      .catch((err) => {
        console.error('Profile error:', err);
        if (active) setError('Could not load your profile. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const res = await updateProfile({ allergies });
      setProfile(res.data.user);
      setAllergies(res.data.user.allergies || '');
      setSaved(true);
    } catch (err) {
      console.error('Profile save error:', err);
      setError(err.response?.data?.error || 'Could not save your allergies. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  const savedAllergies = (profile?.allergies || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const initials = (profile?.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  const memberSince = profile?.created_at
    ? new Date(
        /[zZ]|[+-]\d\d:?\d\d$/.test(profile.created_at)
          ? profile.created_at
          : `${profile.created_at.replace(' ', 'T')}Z`
      ).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Your account</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-800 sm:text-4xl">Profile</h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          Your details, and the allergies we check every new prescription against.
        </p>
      </div>

      {error && (
        <p className="mb-6 rounded-xl bg-red-50 p-4 text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {profile && (
          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-white"
                  aria-hidden="true"
                >
                  {initials || '?'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-gray-800">{profile.name}</p>
                  <p className="truncate text-sm text-gray-500">{profile.email}</p>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">Age</dt>
                  <dd className="mt-1 font-semibold text-gray-800">{profile.age || 'Not given'}</dd>
                </div>
                {memberSince && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">Member since</dt>
                    <dd className="mt-1 font-semibold text-gray-800">{memberSince}</dd>
                  </div>
                )}
              </dl>
            </div>

            <nav className="grid grid-cols-2 gap-3" aria-label="Quick links">
              <Link
                to="/schedule"
                className="rounded-xl border border-teal-100 bg-white p-4 text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary hover:text-primary-dark"
              >
                Today’s schedule
              </Link>
              <Link
                to="/history"
                className="rounded-xl border border-teal-100 bg-white p-4 text-sm font-medium text-gray-700 shadow-sm transition hover:border-primary hover:text-primary-dark"
              >
                History
              </Link>
            </nav>
          </aside>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-2"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-xl"
              aria-hidden="true"
            >
              ⛔
            </span>
            <div>
              <h2 className="text-xl font-bold text-violet-800">Allergies</h2>
              <p className="text-sm text-gray-500">Checked against every new prescription</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Currently saved</p>
            {savedAllergies.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {savedAllergies.map((entry) => (
                  <li
                    key={entry}
                    className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-800"
                  >
                    {entry}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No allergies recorded.</p>
            )}
          </div>

          <label htmlFor="allergies" className="mt-6 block text-sm font-semibold text-gray-700">
            Edit your list
            <span className="block font-normal text-gray-500">Separate each one with a comma.</span>
          </label>

          <textarea
            id="allergies"
            value={allergies}
            onChange={(event) => {
              setAllergies(event.target.value);
              setSaved(false);
            }}
            rows={3}
            placeholder="e.g. penicillin, aspirin, sulfa"
            className="mt-2 w-full rounded-lg border border-violet-200 px-4 py-3 text-base text-gray-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary"
          />

          <p className="mt-3 rounded-lg bg-violet-50 p-3 text-sm text-violet-800">
            We check your medicines against this list by matching names. It is a simple keyword
            check, <strong>not a full clinical allergy check</strong> — it cannot spot related
            medicines or drug families. Always tell your doctor and pharmacist about your allergies
            yourself.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save allergies'}
            </button>
            {saved && (
              <span className="text-sm font-semibold text-green-700" role="status">
                Saved. We will check your next prescription against this list.
              </span>
            )}
          </div>

          {profile && !profile.allergies && !saving && (
            <p className="mt-3 text-sm text-gray-500">
              Leave this empty if you have no known allergies.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

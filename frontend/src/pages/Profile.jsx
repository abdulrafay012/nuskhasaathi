import { useEffect, useState } from 'react';
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-gray-800">Your Profile</h1>
        <p className="mt-2 text-gray-500">
          Tell us what you are allergic to, and we will flag it on your prescriptions.
        </p>
      </div>

      {error && (
        <p className="mb-6 rounded-xl bg-red-50 p-4 text-red-700" role="alert">
          {error}
        </p>
      )}

      {profile && (
        <div className="mb-6 rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Name</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-800">{profile.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</dt>
              <dd className="mt-1 text-lg text-gray-800">{profile.email}</dd>
            </div>
            {profile.age && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Age</dt>
                <dd className="mt-1 text-lg text-gray-800">{profile.age}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border-2 border-violet-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            ⛔
          </span>
          <h2 className="text-xl font-bold text-violet-800">Allergies</h2>
        </div>

        <label htmlFor="allergies" className="block text-sm text-gray-600">
          List anything you react to, separated by commas.
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
            Nothing recorded yet — leave this empty if you have no known allergies.
          </p>
        )}
      </form>
    </div>
  );
}

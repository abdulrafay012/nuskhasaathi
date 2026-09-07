import { useState } from 'react';
import { getMedicineSpeechText } from '../speech';
import { correctMedicine } from '../api';

const EMPTY_FORM = { name: '', dosage: '', frequency: '' };

export default function MedicineCard({ medicine, voiceLang, speaking, onSpeak, onCorrected }) {
  const canSpeak = Boolean(getMedicineSpeechText(medicine, voiceLang));
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const openEditor = () => {
    setForm({
      name: medicine.name || '',
      dosage: medicine.dosage || '',
      frequency: medicine.frequency || '',
    });
    setError('');
    setEditing(true);
  };

  const submitCorrection = async (changes) => {
    setSaving(true);
    setError('');
    try {
      const { data } = await correctMedicine(medicine.id, changes);
      setEditing(false);
      setNotice(
        data.explanation_cleared
          ? 'Thank you — updated. The Urdu explanation was removed because it described the earlier reading.'
          : 'Thank you — confirmed.'
      );
      onCorrected?.(data.medicine, data);
    } catch (err) {
      console.error('Correction error:', err);
      setError(err.response?.data?.error || 'Could not save that change. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Medicine name cannot be empty.');
      return;
    }
    submitCorrection({
      name: form.name.trim(),
      // An emptied optional field clears it rather than storing blank text.
      dosage: form.dosage.trim() || null,
      frequency: form.frequency.trim() || null,
    });
  };

  const isUncertain = medicine.confidence === 'uncertain';

  return (
    <div
      className={`bg-white rounded-xl border p-5 shadow-sm transition hover:shadow-md ${
        isUncertain ? 'border-amber-300 bg-amber-50/30' : 'border-teal-100'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-800">{medicine.name}</h3>
            {isUncertain && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                Uncertain
              </span>
            )}
            {medicine.confidence === 'confident' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Confident
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-3">
            {medicine.dosage && (
              <span className="bg-gray-100 px-2 py-1 rounded">Dosage: {medicine.dosage}</span>
            )}
            {medicine.frequency && (
              <span className="bg-gray-100 px-2 py-1 rounded">Frequency: {medicine.frequency}</span>
            )}
            {medicine.duration && (
              <span className="bg-gray-100 px-2 py-1 rounded">Duration: {medicine.duration}</span>
            )}
          </div>

          {medicine.purpose_explanation && (
            <div className="bg-teal-50 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-700 leading-relaxed" dir="auto">
                {medicine.purpose_explanation}
              </p>
            </div>
          )}
        </div>

        {/* Read Aloud Button */}
        {canSpeak && (
          <button
            type="button"
            onClick={() => onSpeak(medicine)}
            aria-pressed={speaking}
            aria-label={`${speaking ? 'Stop reading' : 'Listen to'} ${medicine.name || 'medicine'} in ${voiceLang === 'ur' ? 'Urdu' : 'English'}`}
            className={`ml-4 flex-shrink-0 rounded-full px-3 py-2 flex items-center justify-center gap-2 text-sm font-semibold transition ${
              speaking
                ? 'bg-primary text-white shadow-sm animate-pulse'
                : 'bg-teal-50 text-primary hover:bg-teal-100'
            }`}
            title={speaking ? 'Stop reading' : `Listen in ${voiceLang === 'ur' ? 'Urdu' : 'English'}`}
          >
            {speaking ? (
              <span className="h-3.5 w-3.5 rounded-sm bg-current" aria-hidden="true" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path strokeLinecap="round" d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
              </svg>
            )}
            <span>{speaking ? 'Stop' : 'Listen'}</span>
          </button>
        )}
      </div>

      {/* Correction workflow — only shown while the reading is still unverified */}
      {isUncertain && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
          {!editing ? (
            <>
              <p className="text-sm font-semibold text-amber-900">Does this look right?</p>
              <p className="mt-1 text-sm text-amber-800">
                We could not read this one clearly. Please check it against your prescription paper.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => submitCorrection({})}
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? 'Saving…' : '✓ Yes, this is correct'}
                </button>
                <button
                  type="button"
                  onClick={openEditor}
                  disabled={saving}
                  className="rounded-lg border-2 border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  No, let me fix it
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave}>
              <p className="text-sm font-semibold text-amber-900">
                Correct this medicine from your prescription
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-amber-900">
                  Medicine name
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm font-normal text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="text-xs font-semibold text-amber-900">
                  Dosage
                  <input
                    type="text"
                    value={form.dosage}
                    onChange={(event) => setForm({ ...form, dosage: event.target.value })}
                    placeholder="e.g. 500mg"
                    className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm font-normal text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="text-xs font-semibold text-amber-900">
                  Frequency
                  <input
                    type="text"
                    value={form.frequency}
                    onChange={(event) => setForm({ ...form, frequency: event.target.value })}
                    placeholder="e.g. twice a day"
                    className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm font-normal text-gray-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save correction'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError('');
                  }}
                  disabled={saving}
                  className="rounded-lg border-2 border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {error && (
            <p className="mt-3 text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {notice && !isUncertain && (
        <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

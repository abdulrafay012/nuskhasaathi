import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { downloadReport, getHistory } from '../api';
import MedicineCard from '../components/MedicineCard';
import InteractionBanner from '../components/InteractionBanner';

export default function History({ user }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadErrorId, setDownloadErrorId] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await getHistory();
      setPrescriptions(res.data.prescriptions);
    } catch (err) {
      setError('Failed to load prescription history.');
    } finally {
      setLoading(false);
    }
  };

  // Past prescriptions are correctable too — patch the one prescription in
  // place so the list does not reload and scroll away from what was edited.
  const handleMedicineCorrected = (prescriptionId, updatedMedicine, response) => {
    setPrescriptions((current) =>
      current.map((rx) =>
        rx.id !== prescriptionId
          ? rx
          : {
              ...rx,
              medicines: rx.medicines.map((med) =>
                med.id === updatedMedicine.id ? updatedMedicine : med
              ),
              interaction_warnings: response.interaction_warnings || [],
            }
      )
    );
  };

  const handleDownload = async (prescriptionId) => {
    if (downloadingId) return;

    setDownloadErrorId(null);
    setDownloadingId(prescriptionId);
    try {
      await downloadReport(prescriptionId);
    } catch (err) {
      console.error('Report download error:', err);
      setDownloadErrorId(prescriptionId);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-500">Loading your prescription history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">{error}</div>
      </div>
    );
  }

  const totalMedicines = prescriptions.reduce((sum, rx) => sum + (rx.medicines?.length || 0), 0);
  const totalWarnings = prescriptions.reduce(
    (sum, rx) => sum + (rx.interaction_warnings?.length || 0),
    0
  );
  const stats = [
    { label: 'Prescriptions', value: prescriptions.length },
    { label: 'Medicines read', value: totalMedicines },
    { label: 'Interaction warnings', value: totalWarnings, alert: totalWarnings > 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Your records</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-800 sm:text-4xl">Prescription history</h1>
        <p className="mt-2 max-w-2xl text-gray-500">
          Every prescription you have uploaded. Re-hear any medicine, check uncertain readings, or
          download a PDF for your family or next doctor.
        </p>
      </div>

      {prescriptions.length === 0 ? (
        <div className="rounded-2xl border border-teal-100 bg-white p-12 text-center shadow-sm">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-3xl" aria-hidden="true">
            📋
          </span>
          <h2 className="mt-4 text-xl font-semibold text-gray-700">No prescriptions yet</h2>
          <p className="mt-2 text-gray-500">Upload your first prescription and it will be saved here.</p>
          <Link
            to="/dashboard"
            className="mt-6 inline-block rounded-xl bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark"
          >
            Upload a prescription
          </Link>
        </div>
      ) : (
        <>
          <dl className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
                  stat.alert ? 'border-red-200' : 'border-teal-100'
                }`}
              >
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">{stat.label}</dt>
                <dd
                  className={`mt-2 text-3xl font-bold tabular-nums ${
                    stat.alert ? 'text-red-600' : 'text-gray-800'
                  }`}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="space-y-8">
            {prescriptions.map((rx) => {
              const uploaded = parseUploadedAt(rx.uploaded_at);
              const medicineCount = rx.medicines?.length || 0;
              const warningCount = rx.interaction_warnings?.length || 0;
              const uncertainCount = (rx.medicines || []).filter((m) => m.confidence === 'uncertain').length;

              return (
                <article key={rx.id} className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm">
                  {/* Prescription header */}
                  <header className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
                    {rx.image_url && (
                      <a
                        href={rx.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0"
                        title="Open the prescription photo"
                      >
                        <img
                          src={rx.image_url}
                          alt="Prescription photo"
                          className="h-16 w-16 rounded-xl border border-teal-100 object-cover transition hover:opacity-90"
                        />
                      </a>
                    )}

                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold text-gray-800">
                        Prescription from{' '}
                        {uploaded.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                      </h2>
                      <p className="text-sm text-gray-500">
                        Uploaded at {uploaded.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                          {medicineCount} medicine{medicineCount === 1 ? '' : 's'}
                        </span>
                        {warningCount > 0 && (
                          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                            {warningCount} interaction{warningCount === 1 ? '' : 's'}
                          </span>
                        )}
                        {uncertainCount > 0 ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                            {uncertainCount} to check
                          </span>
                        ) : (
                          medicineCount > 0 && (
                            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                              All readings confirmed
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownload(rx.id)}
                      disabled={Boolean(downloadingId)}
                      className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-800 shadow-sm transition hover:border-primary hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                      aria-label={`Download PDF report for prescription from ${uploaded.toLocaleDateString()}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {downloadingId === rx.id ? 'Preparing…' : 'Download PDF'}
                    </button>
                  </header>

                  <div className="space-y-4 p-5 sm:p-6">
                    {downloadErrorId === rx.id && (
                      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                        Could not download this report. Please try again.
                      </p>
                    )}

                    {warningCount > 0 && <InteractionBanner warnings={rx.interaction_warnings} />}

                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      {rx.medicines?.map((med) => (
                        <MedicineCard
                          key={med.id}
                          medicine={med}
                          onCorrected={(updatedMedicine, response) =>
                            handleMedicineCorrected(rx.id, updatedMedicine, response)
                          }
                        />
                      ))}
                    </div>

                    {rx.raw_ocr_text && (
                      <details className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm">
                        <summary className="cursor-pointer font-medium text-gray-600">
                          Show the text we read from the photo
                        </summary>
                        <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-500">
                          {rx.raw_ocr_text}
                        </pre>
                      </details>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker; read it as UTC
// so the date and time shown match the patient's own clock.
function parseUploadedAt(value) {
  if (!value) return new Date();
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return new Date(value);
  return new Date(`${value.replace(' ', 'T')}Z`);
}

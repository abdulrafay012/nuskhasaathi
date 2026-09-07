import { useState, useEffect } from 'react';
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Prescription History</h1>
        <p className="text-gray-500 mt-1">
          View and re-hear instructions for all your past prescriptions.
        </p>
      </div>

      {prescriptions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-teal-100 p-12 text-center">
          <span className="text-5xl mb-4 block">📋</span>
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No prescriptions yet</h3>
          <p className="text-gray-400">
            Upload your first prescription to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {prescriptions.map((rx) => (
            <div key={rx.id} className="bg-white rounded-2xl border border-teal-100 shadow-sm overflow-hidden">
              {/* Prescription Header */}
              <div className="bg-teal-50 px-6 py-4 border-b border-teal-100 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">
                    Uploaded: {new Date(rx.uploaded_at).toLocaleDateString('en-PK', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {rx.medicines?.length || 0} medicine(s) identified
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleDownload(rx.id)}
                    disabled={Boolean(downloadingId)}
                    className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-white px-3 py-2 text-sm font-semibold text-teal-800 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                    aria-label={`Download PDF report for prescription from ${new Date(rx.uploaded_at).toLocaleDateString('en-PK')}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {downloadingId === rx.id ? 'Preparing…' : 'Download PDF'}
                  </button>
                  {rx.image_url && (
                    <img
                      src={rx.image_url}
                      alt="Prescription"
                      className="w-16 h-16 object-cover rounded-lg border border-teal-200"
                    />
                  )}
                </div>
              </div>

              <div className="p-6 space-y-4">
                {downloadErrorId === rx.id && (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                    Could not download this report. Please try again.
                  </p>
                )}

                {/* Interaction Warnings */}
                {rx.interaction_warnings?.length > 0 && (
                  <InteractionBanner warnings={rx.interaction_warnings} />
                )}

                {/* OCR Text */}
                {rx.raw_ocr_text && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-500 font-medium">
                      View extracted text
                    </summary>
                    <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                      {rx.raw_ocr_text}
                    </pre>
                  </details>
                )}

                {/* Medicine Cards */}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

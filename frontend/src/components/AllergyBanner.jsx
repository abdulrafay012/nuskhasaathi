// Deliberately purple, not red: a drug-interaction warning comes from a
// reviewed clinical table, while this one comes from what the patient typed
// about themselves. They are different kinds of claim and must not look alike.
export default function AllergyBanner({ warnings }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-2xl" aria-hidden="true">
          ⛔
        </span>
        <h3 className="text-lg font-bold text-violet-800">Allergy Alert</h3>
      </div>

      <p className="mb-1 text-sm font-medium text-violet-800">
        Based on what you&rsquo;ve told us you&rsquo;re allergic to.
      </p>
      <p className="mb-3 text-sm text-violet-700">
        This is a simple name match against your saved allergy list — not a full clinical allergy
        check. It cannot spot related medicines or drug families, so always tell your doctor and
        pharmacist about your allergies yourself.
      </p>

      <ul className="space-y-2">
        {warnings.map((warning, index) => (
          <li
            key={warning.id || `${warning.medicine_name}-${index}`}
            className="rounded-lg border border-violet-200 bg-white p-3"
          >
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-violet-800">{warning.medicine_name}</span>
              {' matches your recorded allergy to '}
              <span className="font-semibold text-violet-800">{warning.allergy_text}</span>.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Check with your doctor or pharmacist before taking it.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

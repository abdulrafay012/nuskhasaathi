export default function InteractionBanner({ warnings }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">⚠️</span>
        <h3 className="text-lg font-bold text-red-700">Drug Interaction Warning</h3>
      </div>
      <p className="text-sm text-red-600 mb-3">
        The following medicines on your prescription may interact with each other. Please consult your doctor or pharmacist.
      </p>
      <ul className="space-y-2">
        {warnings.map((w, idx) => (
          <li key={idx} className="bg-white rounded-lg p-3 border border-red-100">
            <span className="font-semibold text-red-700">{w.medicine_a}</span>
            {' + '}
            <span className="font-semibold text-red-700">{w.medicine_b}</span>
            <p className="text-sm text-gray-600 mt-1">{w.warning_text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

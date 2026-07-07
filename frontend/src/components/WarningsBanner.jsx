// Contract 1's optional `warnings` field - real information about
// degraded/incomplete results (e.g. one page failed OCR). Must render
// visibly whenever present, not be silently dropped for being optional.
export function WarningsBanner({ warnings }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">Partial result</p>
      <ul className="mt-1 list-disc pl-5">
        {warnings.map((warning, i) => (
          <li key={i}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

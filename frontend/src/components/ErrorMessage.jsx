// Renders the backend's actual error detail - never a generic
// "something went wrong" placeholder.
export function ErrorMessage({ detail }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
    >
      <p className="font-semibold">Could not process that input</p>
      <p className="mt-1">{detail}</p>
    </div>
  );
}

export function PreviewBanner() {
  return (
    <div
      className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm font-medium text-amber-800"
      role="status"
      data-testid="preview-banner"
    >
      Preview Mode — Data Not Saved
    </div>
  );
}

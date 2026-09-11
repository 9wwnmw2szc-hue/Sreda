export function LoadingPanel({ label }: { label: string }) {
  return (
    <section className="panel loading-panel" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="loading-panel__title" aria-hidden />
      <div className="loading-panel__row" aria-hidden />
      <div className="loading-panel__row" aria-hidden />
    </section>
  );
}

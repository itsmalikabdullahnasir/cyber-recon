export function EmptyState({
  message,
  actionLabel,
  actionHref,
}: {
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/8 px-8 py-20 text-center transition-colors hover:border-accent/15">
      <div className="mb-3 text-4xl opacity-20">📂</div>
      <p className="text-sm font-medium text-muted">{message}</p>
      {actionLabel && actionHref && (
        <a
          href={actionHref}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-black transition-all duration-200 hover:bg-accent-dim hover:shadow-[0_0_16px_rgba(0,229,160,0.2)]"
        >
          {actionLabel}
        </a>
      )}
    </div>
  );
}

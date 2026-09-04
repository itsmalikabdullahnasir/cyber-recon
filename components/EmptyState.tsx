import Link from "next/link";

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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 px-8 py-16 text-center">
      <p className="text-sm text-muted">{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex items-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-accent/80"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

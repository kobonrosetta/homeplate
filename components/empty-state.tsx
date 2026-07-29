import type { ReactNode } from "react";

// One empty-state box, rendered consistently everywhere (previously the dashed
// box drifted in radius/padding across pages, and a couple of empties had no
// box at all). `title` is the headline; optional `subtitle` and `action`
// (usually a Link) go beneath.
export default function EmptyState({
  title,
  subtitle,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-line px-6 py-14 text-center${
        className ? ` ${className}` : ""
      }`}
    >
      <p className="font-medium text-ink">{title}</p>
      {subtitle && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{subtitle}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

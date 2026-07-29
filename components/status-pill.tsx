// The one status-pill shape used by buyer orders, cook orders, and the admin
// kitchen list. Callers pass the label and the color classes (order-status
// colors live in lib/order-status.ts; the admin cook-status map has its own).
export default function StatusPill({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

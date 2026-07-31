// The ForkFork mark — same geometry as the favicon (app/icon.svg), usable
// inline wherever a photo is missing or a space needs a brand moment instead
// of a generic emoji. Inherits `currentColor`; size via the `size` prop.
export default function ForkMark({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <rect x="11" y="6" width="2.5" height="8" rx="1" />
      <rect x="14.75" y="6" width="2.5" height="8" rx="1" />
      <rect x="18.5" y="6" width="2.5" height="8" rx="1" />
      <rect x="11" y="12.5" width="10" height="2.5" rx="1.25" />
      <rect x="14.75" y="13" width="2.5" height="13" rx="1.25" />
    </svg>
  );
}

// The MEHKO-vs-cottage choice drives tax rules, the verification path, and what
// a cook may even sell — too consequential to bury in a <select> that hides one
// option behind a default nobody reads. Two side-by-side cards make it a
// deliberate pick. Native radios (peer-checked styling), so it submits
// `operation_type` with the form and needs no client JS.
const OPTIONS = [
  {
    value: "cottage",
    title: "Cottage food",
    desc: "Baked goods, jams, and other shelf-stable items.",
  },
  {
    value: "mehko",
    title: "MEHKO",
    desc: "Hot, home-cooked meals made to order.",
  },
];

export default function OperationTypeField({
  defaultValue = "cottage",
  label = "What you make",
}: {
  defaultValue?: string;
  label?: string;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="mt-1.5 grid grid-cols-2 gap-3">
        {OPTIONS.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name="operation_type"
              value={o.value}
              defaultChecked={defaultValue === o.value}
              className="peer sr-only"
            />
            <div className="h-full rounded-xl border border-line bg-card p-4 transition hover:border-muted peer-checked:border-brand peer-checked:bg-brand/5 peer-checked:ring-1 peer-checked:ring-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
              <p className="font-medium text-ink">{o.title}</p>
              <p className="mt-1 text-xs text-muted">{o.desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

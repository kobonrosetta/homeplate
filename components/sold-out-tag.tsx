// One "Sold out" tag, rendered identically wherever an item is out of stock —
// previously the kitchen menu showed a grey pill for option-items but plain
// grey text for simple items, side by side in the same list.
export default function SoldOutTag() {
  return (
    <span className="rounded-full bg-line px-3 py-1.5 text-sm font-medium text-faint">
      Sold out
    </span>
  );
}

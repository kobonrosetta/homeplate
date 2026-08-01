import { TextArea } from "@/components/form";

// The cook-defined pickup-times field, shared by the sell wizard and dashboard
// settings so the label, helper, and behavior can't drift apart. Parsing lives
// in readPickupWindows (lib/listings.ts).
export default function PickupWindowsField({
  defaultValue = [],
  rows = 3,
}: {
  defaultValue?: string[];
  rows?: number;
}) {
  return (
    <div>
      <TextArea
        label="Pickup times (one per line, optional)"
        name="pickup_windows"
        rows={rows}
        defaultValue={defaultValue.join("\n")}
        placeholder={"Saturdays 4–6 PM\nSundays noon–2 PM"}
      />
      <p className="mt-1 text-xs text-faint">
        You set the schedule, and buyers choose one of these at checkout. Leave
        empty to let buyers suggest a time instead.
      </p>
    </div>
  );
}

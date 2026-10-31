import { TextArea } from "@/components/form";
import HolidayPickupAdder from "@/components/holiday-pickup-adder";
import { weeklyPickupHours } from "@/lib/holidays";

// The cook-defined pickup-times field, shared by the sell wizard and dashboard
// settings so the label, helper, and behavior can't drift apart. Parsing lives
// in readPickupWindows (lib/listings.ts). `holidayHelper` adds the "Add a
// holiday pickup day" control (Settings), which writes a dated line here.
export default function PickupWindowsField({
  defaultValue = [],
  rows = 3,
  holidayHelper = false,
}: {
  defaultValue?: string[];
  rows?: number;
  holidayHelper?: boolean;
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
        You set the schedule, and buyers choose one of these at checkout. For
        pickup slots, put the day on one line and each time on its own line
        under it. Leave empty to let buyers suggest a time instead.
      </p>
      {holidayHelper && (
        <HolidayPickupAdder defaultHours={weeklyPickupHours(defaultValue) ?? ""} />
      )}
    </div>
  );
}

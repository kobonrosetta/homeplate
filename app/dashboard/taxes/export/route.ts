import { createClient } from "@/lib/supabase/server";
import { getCurrentCook } from "@/lib/cook";
import {
  formatRate,
  previousQuarter,
  quarterOf,
  taxPortionCents,
  taxRateForCity,
} from "@/lib/tax";

export const dynamic = "force-dynamic";

const PAID_STATUSES = ["confirmed", "in_progress", "ready", "completed"];

// The cook's quarterly tax report as a CSV: every paid line item in the
// quarter, its served_hot snapshot, and the estimated tax inside each hot
// line — the show-your-work behind the dashboard's Taxes card. ?q=prev
// downloads the previous (filable) quarter; default is the current one.
export async function GET(req: Request) {
  const { cook } = await getCurrentCook();
  if (!cook) {
    return new Response("Sign in as a chef to download your tax report.", {
      status: 401,
    });
  }

  const now = new Date();
  const qtr =
    new URL(req.url).searchParams.get("q") === "prev"
      ? previousQuarter(now)
      : quarterOf(now);

  const supabase = createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, order_items(title, quantity, line_total_cents, served_hot)"
    )
    .eq("cook_id", cook.id)
    .in("status", PAID_STATUSES)
    .is("refunded_at", null) // a refunded sale isn't taxable — exclude it
    .gte("created_at", qtr.start.toISOString())
    .lt("created_at", qtr.end.toISOString())
    .order("created_at", { ascending: true });

  const rate = taxRateForCity(cook.city);
  const esc = (v: string | number) => {
    let s = String(v);
    // Neutralize CSV / spreadsheet formula injection (CWE-1236): a cell that
    // starts with a formula sigil is executed by Excel/Sheets/LibreOffice the
    // moment the cook (or their accountant, or CDTFA) opens this report. Cooks
    // control item titles and their city, so prefix a leading =, +, -, @, tab,
    // or CR with an apostrophe to force the cell to render as literal text.
    // (Numeric columns are formatted separately and never pass through esc.)
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const money = (cents: number) => (cents / 100).toFixed(2);

  const lines: string[] = [];
  lines.push(
    [
      esc(`ForkFork tax report: ${qtr.label}`),
      esc(`${cook.city?.trim() || "Santa Clara County"} rate ${formatRate(rate)}`),
      esc("prices are tax-included; estimates only"),
    ].join(",")
  );
  lines.push("Date,Order,Item,Qty,Line total,Served hot,Est. tax inside");

  let allCents = 0;
  let hotCents = 0;
  let taxCents = 0;
  for (const o of orders ?? []) {
    for (const i of (o as any).order_items ?? []) {
      const line = i.line_total_cents ?? 0;
      const tax = i.served_hot ? taxPortionCents(line, rate) : 0;
      allCents += line;
      if (i.served_hot) hotCents += line;
      taxCents += tax;
      lines.push(
        [
          new Date(o.created_at).toISOString().slice(0, 10),
          o.id.slice(0, 8),
          esc(i.title),
          i.quantity,
          money(line),
          i.served_hot ? "yes" : "no",
          money(tax),
        ].join(",")
      );
    }
  }
  lines.push("");
  lines.push(`All sales,,,,${money(allCents)},,`);
  lines.push(`Hot-food (taxable) sales,,,,${money(hotCents)},,${money(taxCents)}`);
  lines.push(
    `Taxable sales to report (hot minus the tax inside),,,,${money(
      hotCents - taxCents
    )},,`
  );

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="forkfork-taxes-${qtr.label.replace(
        " ",
        "-"
      )}.csv"`,
    },
  });
}

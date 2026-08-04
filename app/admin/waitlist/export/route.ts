import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The buyer waitlist as a CSV — admin-only. Every signup with its zip, source,
// and date, so you can segment by area for cook recruiting or drop it into an
// email tool. Reads via the service role (the table is RLS-on/zero-policies).
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return new Response("Admins only.", { status: 404 });
  }

  const db = createAdminClient();
  const { data: rows } = await db
    .from("waitlist")
    .select("email, zip, city, source, created_at")
    .order("created_at", { ascending: false });

  // Neutralize CSV / spreadsheet formula injection (CWE-1236): email/zip are
  // user-supplied, so an =/-/+/@ (or tab/CR) leading a cell is executed by
  // Excel/Sheets the moment the file is opened. Prefix those with an apostrophe.
  const esc = (v: string | number | null) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines: string[] = ["Date,Email,ZIP,City,Source"];
  for (const r of rows ?? []) {
    lines.push(
      [
        new Date(r.created_at).toISOString().slice(0, 10),
        esc(r.email),
        esc(r.zip),
        esc(r.city),
        esc(r.source),
      ].join(",")
    );
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="forkfork-waitlist.csv"`,
    },
  });
}

import { NextResponse } from "next/server";
import { refreshApprovedOperators } from "@/lib/permit-import";

export const dynamic = "force-dynamic";

// Refresh the county permit lists (approved_operators) from Santa Clara
// County's live open-data feeds. Hit on a schedule (GitHub Actions,
// .github/workflows/refresh-permits.yml) with Authorization: Bearer
// CRON_SECRET. Keeps signup verification current so a freshly-permitted cook
// isn't wrongly shown "not on the county list" for up to a month. Idempotent —
// an upsert, safe to run any number of times.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await refreshApprovedOperators();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

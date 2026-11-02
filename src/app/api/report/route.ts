// POST /api/report: the shared "Report a store" form (components/ReportForms.tsx,
// /how-we-pick-stores), filed on this repo's `reports` branch like every sister
// site's (lib/reports-github.ts) and put first by the daily triage. POST only.
import { handleReportPost } from "@/lib/reports-github";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { SUPPORT_EMAIL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleReportPost(req, "riftcompare", {
    email: SUPPORT_EMAIL,
    also: async (r) => {
      await notifyOwnerBounded({
        kind: "price-report",
        headline: `Store reported: ${r.store ?? r.storeUrl ?? "?"}`,
        fields: [
          ["Store", r.store],
          ["Website", r.storeUrl],
          ["Problem", r.issue],
          ["Page", r.page],
        ],
        body: r.note,
      });
      return false;
    },
  });
}

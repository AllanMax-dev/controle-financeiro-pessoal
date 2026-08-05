import type { NextRequest } from "next/server";

import { getCurrentAccess } from "@/modules/access/application/get-current-access";
import { getMonthlyReport } from "@/modules/reports/application/get-monthly-report";
import { createMonthlyReportCsv } from "@/modules/reports/domain/csv";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await getCurrentAccess();

  if (!access) {
    return new Response("Acesso não autorizado.", { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  const report = await getMonthlyReport(access.workspaceId, month);
  const csv = createMonthlyReportCsv(report);

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="relatorio-${report.month}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

import type { NextRequest } from "next/server";

import { getCurrentAccess } from "@/modules/access/application/get-current-access";
import { getMonthlyReport } from "@/modules/reports/application/get-monthly-report";
import { resolveFinancialContext } from "@/modules/financial-contexts/application/financial-contexts";
import { createMonthlyReportCsv } from "@/modules/reports/domain/csv";
import { calendarDateInTimeZone } from "@/modules/shared/domain/calendar";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await getCurrentAccess();

  if (!access) {
    return new Response("Acesso não autorizado.", { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  const requestedContextId = request.nextUrl.searchParams.get("contextId") ?? undefined;
  const contextState = await resolveFinancialContext(access, requestedContextId);
  const report = await getMonthlyReport(
    access.workspaceId,
    month,
    calendarDateInTimeZone(new Date(), access.workspaceTimezone),
    contextState.scope,
  );
  const csv = createMonthlyReportCsv(report);

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="relatorio-${report.month}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

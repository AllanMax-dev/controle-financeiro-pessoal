import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  getFinanceOptions,
  getFinanceOverview,
  selectedMonthParam,
  selectedViewParam,
} from "@/modules/finance/application/finance-queries";
import { monthInputInTimeZone } from "@/modules/shared/domain/calendar";

export type FinanceSearchParams = {
  month?: string | string[];
  view?: string | string[];
};

export async function loadFinanceRoute(searchParams: Promise<FinanceSearchParams>) {
  const access = await requireCurrentAccess();
  const rawSearchParams = await searchParams;
  const fallbackMonth = monthInputInTimeZone(new Date(), access.workspaceTimezone);
  const month = selectedMonthParam(rawSearchParams.month, fallbackMonth);
  const view = selectedViewParam(rawSearchParams.view);
  const [overview, options] = await Promise.all([
    getFinanceOverview(access.workspaceId, month, view, access.workspaceTimezone),
    getFinanceOptions(access.workspaceId),
  ]);

  return { access, month, options, overview };
}

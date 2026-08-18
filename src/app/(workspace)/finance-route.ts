import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  getDashboardData,
  getFinanceOptions,
  selectedMonthParam,
  selectedViewParam,
} from "@/modules/finance/application/finance-queries";
import { monthInputInTimeZone } from "@/modules/shared/domain/calendar";

export type FinanceSearchParams = {
  month?: string | string[];
  view?: string | string[];
};

type FinanceDataLoader = typeof getDashboardData;

async function getFinanceRouteContext(searchParams: Promise<FinanceSearchParams>) {
  const access = await requireCurrentAccess();
  const rawSearchParams = await searchParams;
  const fallbackMonth = monthInputInTimeZone(new Date(), access.workspaceTimezone);
  const month = selectedMonthParam(rawSearchParams.month, fallbackMonth);
  const view = selectedViewParam(rawSearchParams.view);

  return { access, month, view };
}

export async function loadFinanceRoute(searchParams: Promise<FinanceSearchParams>, dataLoader: FinanceDataLoader = getDashboardData) {
  const { access, month, view } = await getFinanceRouteContext(searchParams);
  const [overview, options] = await Promise.all([
    dataLoader(access.workspaceId, month, view, access.workspaceTimezone),
    getFinanceOptions(access.workspaceId),
  ]);

  return { access, month, options, overview };
}

export async function loadFinanceDataRoute(searchParams: Promise<FinanceSearchParams>, dataLoader: FinanceDataLoader = getDashboardData) {
  const { access, month, view } = await getFinanceRouteContext(searchParams);
  const overview = await dataLoader(access.workspaceId, month, view, access.workspaceTimezone);

  return { access, month, overview };
}

export async function loadFinanceOptionsRoute(searchParams: Promise<FinanceSearchParams>) {
  const { access, month } = await getFinanceRouteContext(searchParams);
  const options = await getFinanceOptions(access.workspaceId);

  return { access, month, options };
}

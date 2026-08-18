import { DashboardPageContent } from "@/components/finance/finance-pages";
import { loadFinanceDataRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getDashboardData } from "@/modules/finance/application/finance-queries";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, overview } = await loadFinanceDataRoute(searchParams, getDashboardData);

  return <DashboardPageContent month={month} overview={overview} />;
}

import { DashboardPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, overview } = await loadFinanceRoute(searchParams);

  return <DashboardPageContent month={month} overview={overview} />;
}

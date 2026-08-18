import { GoalsPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getSavingsGoalsPageData } from "@/modules/finance/application/finance-queries";

export default async function GoalsPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options, overview } = await loadFinanceRoute(searchParams, getSavingsGoalsPageData);

  return <GoalsPageContent month={month} options={options} overview={overview} />;
}

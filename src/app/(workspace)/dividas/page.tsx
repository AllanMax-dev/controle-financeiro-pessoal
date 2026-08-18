import { DebtsPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getDebtsPageData } from "@/modules/finance/application/finance-queries";

export default async function DebtsPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options, overview } = await loadFinanceRoute(searchParams, getDebtsPageData);

  return <DebtsPageContent month={month} options={options} overview={overview} />;
}

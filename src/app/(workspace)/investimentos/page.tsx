import { InvestmentsPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getInvestmentsPageData } from "@/modules/finance/application/finance-queries";

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options, overview } = await loadFinanceRoute(searchParams, getInvestmentsPageData);

  return <InvestmentsPageContent month={month} options={options} overview={overview} />;
}

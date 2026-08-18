import { ReceiptsPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getReceiptsPageData } from "@/modules/finance/application/finance-queries";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options, overview } = await loadFinanceRoute(searchParams, getReceiptsPageData);

  return <ReceiptsPageContent month={month} options={options} overview={overview} />;
}

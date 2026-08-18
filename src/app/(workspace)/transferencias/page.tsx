import { TransfersPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getTransfersPageData } from "@/modules/finance/application/finance-queries";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options, overview } = await loadFinanceRoute(searchParams, getTransfersPageData);

  return <TransfersPageContent month={month} options={options} overview={overview} />;
}

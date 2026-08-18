import { BanksPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getAccountsPageData } from "@/modules/finance/application/finance-queries";

export default async function BanksPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options, overview } = await loadFinanceRoute(searchParams, getAccountsPageData);

  return <BanksPageContent month={month} options={options} overview={overview} />;
}

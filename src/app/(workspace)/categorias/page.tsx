import { CategoriesPageContent } from "@/components/finance/finance-pages";
import { loadFinanceOptionsRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options } = await loadFinanceOptionsRoute(searchParams);

  return <CategoriesPageContent month={month} options={options} />;
}

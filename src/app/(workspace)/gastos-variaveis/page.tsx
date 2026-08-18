import { TransactionPageContent } from "@/components/finance/finance-pages";
import { loadFinanceRoute, type FinanceSearchParams } from "@/app/(workspace)/finance-route";
import { getTransactionsPageData } from "@/modules/finance/application/finance-queries";

export default async function VariableExpensesPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { month, options, overview } = await loadFinanceRoute(searchParams, getTransactionsPageData);

  return <TransactionPageContent kind="EXPENSE" month={month} options={options} overview={overview} title="Gastos variáveis" />;
}

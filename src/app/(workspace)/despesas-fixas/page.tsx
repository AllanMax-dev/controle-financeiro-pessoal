import { redirect } from "next/navigation";

import type { FinanceSearchParams } from "@/app/(workspace)/finance-route";

function redirectToDebts(searchParams: FinanceSearchParams) {
  const params = new URLSearchParams();
  const month = Array.isArray(searchParams.month) ? searchParams.month[0] : searchParams.month;
  const view = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;

  if (month) {
    params.set("month", month);
  }

  if (view) {
    params.set("view", view);
  }

  const query = params.toString();

  redirect(query ? `/dividas?${query}` : "/dividas");
}

export default async function FixedExpensesPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  redirectToDebts(await searchParams);
}

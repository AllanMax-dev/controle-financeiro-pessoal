"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function monthDate(month: string, offset = 0) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(Date.UTC(year ?? 2000, (monthNumber ?? 1) - 1 + offset, 1));
}

function monthValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const value = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(monthDate(month));

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function MonthNavigator({ month }: { month: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", nextMonth);
    router.push(`${pathname}?${params.toString()}` as Route, { scroll: false });
  }

  return (
    <div className="month-navigator" aria-label="Selecionar mês">
      <button aria-label="Mês anterior" onClick={() => navigate(monthValue(monthDate(month, -1)))} type="button">
        ‹
      </button>
      <label className="month-navigator-label">
        <span>{monthLabel(month)}</span>
        <input aria-label="Escolher mês diretamente" onChange={(event) => navigate(event.currentTarget.value)} type="month" value={month} />
      </label>
      <button aria-label="Próximo mês" onClick={() => navigate(monthValue(monthDate(month, 1)))} type="button">
        ›
      </button>
    </div>
  );
}

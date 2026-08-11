"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";

function viewHref(pathname: string, searchParams: URLSearchParams, month: string, view: string) {
  const params = new URLSearchParams(searchParams.toString());
  params.set("month", month);
  params.set("view", view);

  return `${pathname}?${params.toString()}` as Route;
}

export function PersonSegment({
  activeView,
  month,
  people,
}: {
  activeView: string;
  month: string;
  people: Array<{ id: string; name: string }>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabs = [{ id: "casal", name: "Casal" }, ...people];

  return (
    <nav className="person-tabs" aria-label="Filtro financeiro por pessoa">
      {tabs.map((tab) => (
        <Link aria-current={activeView === tab.id ? "page" : undefined} href={viewHref(pathname, searchParams, month, tab.id)} key={tab.id}>
          {tab.name}
        </Link>
      ))}
    </nav>
  );
}

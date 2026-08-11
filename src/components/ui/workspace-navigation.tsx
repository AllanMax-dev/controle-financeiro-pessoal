"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/ui/icons";

const navigationItems = [
  { href: "/painel", icon: "dashboard", label: "Dashboard" },
  { href: "/despesas-fixas", icon: "calendar", label: "Gastos fixos" },
  { href: "/gastos-variaveis", icon: "expense", label: "Gastos variáveis" },
  { href: "/cartoes", icon: "card", label: "Cartões de crédito" },
  { href: "/recebimentos", icon: "income", label: "Recebimentos" },
  { href: "/dividas", icon: "debt", label: "Dívidas" },
  { href: "/cofrinhos", icon: "goal", label: "Cofrinhos" },
  { href: "/bancos", icon: "bank", label: "Bancos" },
  { href: "/investimentos", icon: "investment", label: "Investimentos" },
  { href: "/categorias", icon: "category", label: "Categorias" },
  { href: "/transferencias", icon: "transfer", label: "Transferências" },
  { href: "/como-usar", icon: "help", label: "Como usar" },
] as const satisfies ReadonlyArray<{ href: string; icon: IconName; label: string }>;

function hrefWithMonth(href: string, month: string | null): Route {
  return month ? `${href}?month=${encodeURIComponent(month)}` as Route : href as Route;
}

function NavigationLinks({ month, onNavigate }: { month: string | null; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="workspace-nav-list">
      {navigationItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <li key={item.href}>
            <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={hrefWithMonth(item.href, month)} onClick={onNavigate}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ month, workspaceName }: { month: string | null; workspaceName: string }) {
  return (
    <Link className="workspace-brand" href={hrefWithMonth("/painel", month)}>
      <span className="brand-mark">AM</span>
      <span>
        <strong>{workspaceName}</strong>
        <small>Allan · Mayara · Casal</small>
      </span>
    </Link>
  );
}

export function WorkspaceNavigation({
  editorName,
  workspaceName,
}: {
  editorName: string;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const currentMonth = searchParams.get("month");
  const drawerId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerButtonRef.current?.focus();
      }
    };

    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <aside className="workspace-sidebar">
        <Brand month={currentMonth} workspaceName={workspaceName} />
        <div className="operator-card">
          <span>Operando como</span>
          <strong>{editorName}</strong>
        </div>
        <nav aria-label="Navegação principal">
          <NavigationLinks month={currentMonth} />
        </nav>
      </aside>

      <header className="workspace-mobile-topbar">
        <button aria-controls={drawerId} aria-expanded={open} aria-label="Abrir menu" onClick={() => setOpen(true)} ref={triggerButtonRef} type="button">
          <Icon name="menu" />
        </button>
        <Brand month={currentMonth} workspaceName={workspaceName} />
      </header>

      {open ? (
        <div className="drawer-layer">
          <button aria-label="Fechar menu" className="drawer-backdrop" onClick={() => setOpen(false)} type="button" />
          <aside aria-label="Menu de navegação" aria-modal="true" className="mobile-drawer" id={drawerId} role="dialog">
            <div className="drawer-head">
              <Brand month={currentMonth} workspaceName={workspaceName} />
              <button aria-label="Fechar menu" onClick={() => setOpen(false)} ref={closeButtonRef} type="button">
                <Icon name="close" />
              </button>
            </div>
            <div className="operator-card">
              <span>Operando como</span>
              <strong>{editorName}</strong>
            </div>
            <nav aria-label="Navegação principal">
              <NavigationLinks month={currentMonth} onNavigate={() => setOpen(false)} />
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}

"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/ui/icons";

const navigationItems = [
  { href: "/painel", icon: "dashboard", label: "Dashboard" },
  { href: "/gastos-variaveis", icon: "expense", label: "Gastos variáveis" },
  { href: "/recebimentos", icon: "income", label: "Recebimentos" },
  { href: "/dividas", icon: "debt", label: "Dívidas" },
  { href: "/cofrinhos", icon: "goal", label: "Cofrinhos" },
  { href: "/bancos", icon: "bank", label: "Bancos" },
  { href: "/investimentos", icon: "investment", label: "Investimentos" },
  { href: "/categorias", icon: "category", label: "Categorias" },
  { href: "/transferencias", icon: "transfer", label: "Transferências" },
  { href: "/como-usar", icon: "help", label: "Como usar" },
] as const satisfies ReadonlyArray<{ href: string; icon: IconName; label: string }>;

const bottomNavigationItems = [
  { href: "/painel", icon: "dashboard", label: "Início" },
  { href: "/gastos-variaveis", icon: "expense", label: "Gastos" },
  { href: "/recebimentos", icon: "income", label: "Receitas" },
  { href: "/dividas", icon: "debt", label: "Dívidas" },
] as const satisfies ReadonlyArray<{ href: string; icon: IconName; label: string }>;

function hrefWithFilters(href: string, month: string | null, view: string | null): Route {
  const params = new URLSearchParams();

  if (month) {
    params.set("month", month);
  }

  if (view) {
    params.set("view", view);
  }

  const query = params.toString();

  return query ? `${href}?${query}` as Route : href as Route;
}

function NavigationLinks({ month, onNavigate, view }: { month: string | null; onNavigate?: () => void; view: string | null }) {
  const pathname = usePathname();

  return (
    <ul className="workspace-nav-list">
      {navigationItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <li key={item.href}>
            <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={hrefWithFilters(item.href, month, view)} onClick={onNavigate}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BottomNavigation({ month, onMore, view }: { month: string | null; onMore: () => void; view: string | null }) {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação rápida">
      {bottomNavigationItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link aria-current={active ? "page" : undefined} href={hrefWithFilters(item.href, month, view)} key={item.href}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button aria-label="Abrir mais opções" onClick={onMore} type="button">
        <Icon name="menu" />
        <span>Mais</span>
      </button>
    </nav>
  );
}

function Brand({ month, view, workspaceName }: { month: string | null; view: string | null; workspaceName: string }) {
  return (
    <Link className="workspace-brand" href={hrefWithFilters("/painel", month, view)}>
      <span className="brand-mark">AM</span>
      <span>
        <strong>{workspaceName}</strong>
        <small>Allan · Mayara · Casal</small>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    return window.localStorage.getItem("finance-theme") === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo noturno"}
      className="theme-toggle"
      onClick={() => {
        window.localStorage.setItem("finance-theme", nextTheme);
        setTheme(nextTheme);
      }}
      suppressHydrationWarning
      type="button"
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
      <span>{theme === "dark" ? "Modo claro" : "Modo noturno"}</span>
    </button>
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentMonth = searchParams.get("month");
  const currentView = searchParams.get("view");
  const drawerId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const activeItem = navigationItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const pageTitle = activeItem?.label ?? "Dashboard";
  const showCreateAction = !["/painel", "/como-usar"].some((href) => pathname === href || pathname.startsWith(`${href}/`));

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
        <Brand month={currentMonth} view={currentView} workspaceName={workspaceName} />
        <div className="operator-card">
          <span>Operando como</span>
          <strong>{editorName}</strong>
        </div>
        <ThemeToggle />
        <nav aria-label="Navegação principal">
          <NavigationLinks month={currentMonth} view={currentView} />
        </nav>
      </aside>

      <header className="workspace-mobile-topbar">
        <button aria-controls={drawerId} aria-expanded={open} aria-label="Abrir menu" onClick={() => setOpen(true)} ref={triggerButtonRef} type="button">
          <Icon name="menu" />
        </button>
        <strong className="mobile-page-title">{pageTitle}</strong>
        {showCreateAction ? (
          <a aria-label={`Adicionar em ${pageTitle}`} className="mobile-add-action" href="#finance-create">
            <Icon name="add" />
          </a>
        ) : (
          <span aria-hidden="true" className="mobile-topbar-spacer" />
        )}
      </header>

      <BottomNavigation month={currentMonth} onMore={() => setOpen(true)} view={currentView} />

      {open ? (
        <div className="drawer-layer">
          <button aria-label="Fechar menu" className="drawer-backdrop" onClick={() => setOpen(false)} type="button" />
          <aside aria-label="Menu de navegação" aria-modal="true" className="mobile-drawer" id={drawerId} role="dialog">
            <div className="drawer-head">
              <Brand month={currentMonth} view={currentView} workspaceName={workspaceName} />
              <button aria-label="Fechar menu" onClick={() => setOpen(false)} ref={closeButtonRef} type="button">
                <Icon name="close" />
              </button>
            </div>
            <div className="operator-card">
              <span>Operando como</span>
              <strong>{editorName}</strong>
            </div>
            <ThemeToggle />
            <nav aria-label="Navegação principal">
              <NavigationLinks month={currentMonth} onNavigate={() => setOpen(false)} view={currentView} />
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}

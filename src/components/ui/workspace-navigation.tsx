"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/ui/icons";
import type { FinancialContextOption } from "@/modules/financial-contexts/application/financial-contexts";

const navigationGroups = [
  {
    label: null,
    items: [{ href: "/painel", icon: "dashboard", label: "Dashboard" }],
  },
  {
    label: "Controle",
    items: [
      { href: "/despesas-fixas", icon: "calendar", label: "Gastos fixos" },
      { href: "/gastos-variaveis", icon: "expense", label: "Gastos variáveis" },
      { href: "/cartoes", icon: "card", label: "Cartões de crédito" },
      { href: "/recebimentos", icon: "income", label: "Recebimentos" },
      { href: "/cofrinhos", icon: "goal", label: "Cofrinhos" },
    ],
  },
  {
    label: "Patrimônio",
    items: [
      { href: "/bancos", icon: "bank", label: "Bancos" },
      { href: "/investimentos", icon: "investment", label: "Investimentos" },
    ],
  },
  {
    label: "Análise",
    items: [
      { href: "/planejamento", icon: "planning", label: "Planejamento" },
      { href: "/relatorios", icon: "report", label: "Relatórios" },
      { href: "/dividas", icon: "debt", label: "Dívidas" },
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string | null;
  items: ReadonlyArray<{ href: string; icon: IconName; label: string }>;
}>;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function hrefWithContext(href: string, contextId: string) {
  return `${href}?contextId=${encodeURIComponent(contextId)}`;
}

function NavigationLinks({
  contextId,
  onNavigate,
}: {
  contextId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="workspace-nav-groups">
      {navigationGroups.map((group, index) => (
        <div className="workspace-nav-group" key={group.label ?? `primary-${index}`}>
          {group.label ? <p className="workspace-nav-group-title">{group.label}</p> : null}
          <ul className="workspace-nav-list">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <li key={item.href}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={active ? "active" : undefined}
                    href={hrefWithContext(item.href, contextId)}
                    onClick={onNavigate}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BrandBlock({ contextId, workspaceName }: { contextId: string; workspaceName: string }) {
  return (
    <Link className="brand workspace-brand" href={hrefWithContext("/painel", contextId)}>
      <span className="brand-mark" aria-hidden="true">
        CF
      </span>
      <span>
        <strong>{workspaceName}</strong>
        <small>Controle financeiro</small>
      </span>
    </Link>
  );
}

function ContextSwitcher({
  contexts,
  currentContextId,
  onNavigate,
}: {
  contexts: FinancialContextOption[];
  currentContextId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="context-switcher" aria-label="Contexto financeiro">
      {contexts.map((context) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("contextId", context.id);
        const active = context.id === currentContextId;

        return (
          <Link
            aria-current={active ? "true" : undefined}
            className={active ? "active" : undefined}
            href={`${pathname}?${params.toString()}`}
            key={context.id}
            onClick={onNavigate}
          >
            {context.name}
          </Link>
        );
      })}
    </div>
  );
}

export function WorkspaceNavigation({
  contexts,
  defaultContextId,
  editorName,
  workspaceName,
}: {
  contexts: FinancialContextOption[];
  defaultContextId: string;
  editorName: string;
  workspaceName: string;
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const requestedContextId = searchParams.get("contextId");
  const currentContextId = contexts.some(({ id }) => id === requestedContextId)
    ? requestedContextId!
    : defaultContextId;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(", ");

    document.body.style.overflow = "hidden";

    function getFocusableElements() {
      return Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
        .filter((element) => element.offsetParent !== null || element === closeButtonRef.current);
    }

    function focusFirstElement() {
      const [firstElement] = getFocusableElements();
      (firstElement ?? drawerRef.current)?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      if (!drawerRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    const animationFrame = window.requestAnimationFrame(focusFirstElement);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 861px)");

    function closeDrawerOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) {
        setOpen(false);
      }
    }

    query.addEventListener("change", closeDrawerOnDesktop);

    return () => {
      query.removeEventListener("change", closeDrawerOnDesktop);
    };
  }, []);
  return (
    <>
      <aside className="workspace-sidebar">
        <BrandBlock contextId={currentContextId} workspaceName={workspaceName} />
        <ContextSwitcher contexts={contexts} currentContextId={currentContextId} />

        <nav className="workspace-nav workspace-nav-desktop" aria-label="Navegação principal">
          <NavigationLinks contextId={currentContextId} />
        </nav>

        <div className="workspace-editor-card" title="Pessoa identificada pelo link privado">
          <Icon name="user" />
          <span>
            <small>Editando como</small>
            <strong>{editorName}</strong>
          </span>
        </div>
      </aside>

      <header className="workspace-mobile-topbar">
        <BrandBlock contextId={currentContextId} workspaceName={workspaceName} />
        <button
          aria-controls={drawerId}
          aria-expanded={open}
          aria-label="Abrir menu de navegação"
          className="mobile-menu-button"
          ref={triggerButtonRef}
          type="button"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
        </button>
      </header>

      <div className={`mobile-drawer-layer${open ? " open" : ""}`} hidden={!open}>
        <button
          aria-label="Fechar menu"
          className="mobile-drawer-backdrop"
          type="button"
          onClick={() => setOpen(false)}
        />
        <aside aria-label="Menu de navegação" aria-modal="true" className="mobile-drawer" id={drawerId} ref={drawerRef} role="dialog" tabIndex={-1}>
          <div className="mobile-drawer-header">
            <div>
              <strong>{workspaceName}</strong>
              <span>{editorName}</span>
            </div>
            <button
              aria-label="Fechar menu"
              className="icon-button"
              ref={closeButtonRef}
              type="button"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <nav aria-label="Navegação principal">
            <ContextSwitcher
              contexts={contexts}
              currentContextId={currentContextId}
              onNavigate={() => setOpen(false)}
            />
            <NavigationLinks contextId={currentContextId} onNavigate={() => setOpen(false)} />
          </nav>
        </aside>
      </div>
    </>
  );
}

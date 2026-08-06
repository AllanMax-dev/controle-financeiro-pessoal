"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Icon, type IconName } from "@/components/ui/icons";

const navigationItems = [
  { href: "/painel", icon: "dashboard", label: "Visão geral" },
  { href: "/lancamentos", icon: "income", label: "Lançamentos" },
  { href: "/dividas", icon: "debt", label: "Dívidas" },
  { href: "/transferencias", icon: "transfer", label: "Transferências" },
  { href: "/contas", icon: "account", label: "Contas" },
  { href: "/categorias", icon: "category", label: "Categorias" },
  { href: "/planejamento", icon: "planning", label: "Planejamento" },
  { href: "/relatorios", icon: "report", label: "Relatórios" },
] as const satisfies ReadonlyArray<{ href: string; icon: IconName; label: string }>;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="workspace-nav-list">
      {navigationItems.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <li key={item.href}>
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? "active" : undefined}
              href={item.href}
              onClick={onNavigate}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BrandBlock({ workspaceName }: { workspaceName: string }) {
  return (
    <Link className="brand workspace-brand" href="/painel">
      <span className="brand-mark" aria-hidden="true">
        MF
      </span>
      <span>
        <strong>{workspaceName}</strong>
        <small>Controle compartilhado</small>
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
  const drawerId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 861px)");

    function closeDrawerOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) {
        setOpen(false);
      }
    }

    if (query.matches) {
      setOpen(false);
    }

    query.addEventListener("change", closeDrawerOnDesktop);

    return () => {
      query.removeEventListener("change", closeDrawerOnDesktop);
    };
  }, []);

  return (
    <>
      <aside className="workspace-sidebar">
        <BrandBlock workspaceName={workspaceName} />

        <nav className="workspace-nav workspace-nav-desktop" aria-label="Navegação principal">
          <NavigationLinks />
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
        <BrandBlock workspaceName={workspaceName} />
        <button
          aria-controls={drawerId}
          aria-expanded={open}
          aria-label="Abrir menu de navegação"
          className="mobile-menu-button"
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
        <aside className="mobile-drawer" id={drawerId}>
          <div className="mobile-drawer-header">
            <div>
              <strong>{workspaceName}</strong>
              <span>{editorName}</span>
            </div>
            <button
              aria-label="Fechar menu"
              className="icon-button"
              type="button"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          <nav aria-label="Navegação principal">
            <NavigationLinks onNavigate={() => setOpen(false)} />
          </nav>
        </aside>
      </div>
    </>
  );
}

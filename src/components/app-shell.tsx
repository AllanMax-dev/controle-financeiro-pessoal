import Link from "next/link";

const navigationItems = [
  { href: "/painel", label: "Visão geral" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/contas", label: "Contas" },
  { href: "/categorias", label: "Categorias" },
] as const;

export function AppShell({
  children,
  editorName,
  workspaceName,
}: Readonly<{
  children: React.ReactNode;
  editorName: string;
  workspaceName: string;
}>) {
  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <Link className="brand" href="/painel">
          <span className="brand-mark" aria-hidden="true">
            MF
          </span>
          <span>
            <strong>{workspaceName}</strong>
            <small>Controle compartilhado</small>
          </span>
        </Link>
        <div className="editor-badge" title="Pessoa identificada pelo link privado">
          <span aria-hidden="true">●</span>
          {editorName}
        </div>
      </header>
      <nav className="workspace-nav" aria-label="Navegação principal">
        {navigationItems.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <main className="workspace-main">{children}</main>
    </div>
  );
}

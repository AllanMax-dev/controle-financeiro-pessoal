import { getCurrentAccess } from "@/modules/access/application/get-current-access";

export const dynamic = "force-dynamic";

function AccessRequired() {
  return (
    <main className="access-page">
      <section className="access-card" aria-labelledby="access-title">
        <div className="brand-mark" aria-hidden="true">
          MF
        </div>
        <p className="eyebrow">Espaço financeiro privado</p>
        <h1 id="access-title">Use seu link pessoal de acesso</h1>
        <p>
          Este endereço não possui formulário de login. Abra o link privado criado para você e o acesso
          será reconhecido neste dispositivo.
        </p>
      </section>
    </main>
  );
}

export default async function HomePage() {
  const access = await getCurrentAccess();

  if (!access) {
    return <AccessRequired />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            MF
          </span>
          <div>
            <strong>{access.workspaceName}</strong>
            <span>Controle compartilhado</span>
          </div>
        </div>
        <div className="editor-badge" title="Pessoa identificada pelo link privado">
          <span aria-hidden="true">●</span>
          {access.editorName}
        </div>
      </header>

      <section className="dashboard-intro" aria-labelledby="dashboard-title">
        <p className="eyebrow">Visão geral</p>
        <h1 id="dashboard-title">Seu espaço compartilhado está pronto.</h1>
        <p>
          A fundação segura, o banco de dados e a identificação dos dois editores estão configurados.
        </p>
      </section>

      <section className="status-grid" aria-label="Estado da fundação do projeto">
        <article className="status-card">
          <span className="status-icon" aria-hidden="true">
            01
          </span>
          <h2>Acesso sem login</h2>
          <p>O link privado é removido da barra de endereço e convertido em uma sessão segura.</p>
        </article>
        <article className="status-card">
          <span className="status-icon" aria-hidden="true">
            02
          </span>
          <h2>Dados persistentes</h2>
          <p>O modelo PostgreSQL já separa contas, categorias, lançamentos e transferências.</p>
        </article>
        <article className="status-card">
          <span className="status-icon" aria-hidden="true">
            03
          </span>
          <h2>Edições identificadas</h2>
          <p>Cada pessoa possui um acesso revogável e pode ser registrada no histórico de alterações.</p>
        </article>
      </section>
    </main>
  );
}

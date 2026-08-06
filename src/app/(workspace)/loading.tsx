export default function WorkspaceLoading() {
  return (
    <div className="workspace-loading" aria-label="Carregando conteúdo" role="status">
      <span className="loading-heading" />
      <div className="loading-metrics">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="loading-panels">
        <span />
        <span />
      </div>
    </div>
  );
}

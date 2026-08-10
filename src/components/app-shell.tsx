import { WorkspaceNavigation } from "@/components/ui/workspace-navigation";
import type { FinancialContextOption } from "@/modules/financial-contexts/application/financial-contexts";

export function AppShell({
  children,
  contexts,
  defaultContextId,
  editorName,
  workspaceName,
}: Readonly<{
  children: React.ReactNode;
  contexts: FinancialContextOption[];
  defaultContextId: string;
  editorName: string;
  workspaceName: string;
}>) {
  return (
    <div className="workspace-shell">
      <WorkspaceNavigation
        contexts={contexts}
        defaultContextId={defaultContextId}
        editorName={editorName}
        workspaceName={workspaceName}
      />
      <main className="workspace-main">{children}</main>
    </div>
  );
}

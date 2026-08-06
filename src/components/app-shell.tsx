import { WorkspaceNavigation } from "@/components/ui/workspace-navigation";

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
      <WorkspaceNavigation editorName={editorName} workspaceName={workspaceName} />
      <main className="workspace-main">{children}</main>
    </div>
  );
}

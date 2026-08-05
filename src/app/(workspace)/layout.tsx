import { AppShell } from "@/components/app-shell";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const access = await requireCurrentAccess();

  return (
    <AppShell editorName={access.editorName} workspaceName={access.workspaceName}>
      {children}
    </AppShell>
  );
}

import { AppShell } from "@/components/app-shell";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { resolveFinancialContext } from "@/modules/financial-contexts/application/financial-contexts";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const access = await requireCurrentAccess();
  const { contexts, current } = await resolveFinancialContext(access);

  return (
    <AppShell
      contexts={contexts}
      defaultContextId={current.id}
      editorName={access.editorName}
      workspaceName={access.workspaceName}
    >
      {children}
    </AppShell>
  );
}

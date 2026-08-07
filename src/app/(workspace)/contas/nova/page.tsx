import { AccountForm } from "@/components/account-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createAccountAction } from "@/modules/accounts/application/account-actions";

export default async function NewAccountPage() {
  const access = await requireCurrentAccess();
  const editors = await getDatabase().editor.findMany({
    where: { workspaceId: access.workspaceId, active: true },
    select: { displayName: true, id: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Contas</p>
          <h1>Nova conta</h1>
          <p>Informe o saldo existente antes do primeiro lançamento.</p>
        </div>
      </section>
      <AccountForm
        action={createAccountAction}
        defaults={{
          color: "#256b4b",
          initialBalance: "0,00",
          name: "",
          ownerEditorId: null,
          type: "CHECKING",
        }}
        editors={editors}
        submitLabel="Criar conta"
      />
    </>
  );
}

import Link from "next/link";

import { TransferForm } from "@/components/transfer-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createTransferAction } from "@/modules/transfers/application/transfer-actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewTransferPage() {
  const access = await requireCurrentAccess();
  const accounts = await getDatabase().financialAccount.findMany({
    where: { workspaceId: access.workspaceId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Transferências</p>
          <h1>Nova transferência</h1>
          <p>Somente transferências realizadas alteram os saldos das contas.</p>
        </div>
      </section>
      {accounts.length < 2 ? (
        <section className="empty-state">
          <h2>Cadastre pelo menos duas contas</h2>
          <p>Uma transferência precisa de contas distintas de origem e destino.</p>
          <Link className="primary-button" href="/contas/nova">
            Criar conta
          </Link>
        </section>
      ) : (
        <TransferForm
          accounts={accounts}
          action={createTransferAction}
          defaults={{
            amount: "",
            description: "",
            destinationAccountId: accounts[1]?.id ?? "",
            notes: "",
            settledDate: today(),
            sourceAccountId: accounts[0]?.id ?? "",
            status: "PENDING",
            transferDate: today(),
          }}
          submitLabel="Criar transferência"
        />
      )}
    </>
  );
}

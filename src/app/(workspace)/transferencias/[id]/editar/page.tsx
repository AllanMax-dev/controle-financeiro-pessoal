import { notFound } from "next/navigation";

import { TransferForm } from "@/components/transfer-form";
import { getDatabase } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getWritableFinancialContextIds } from "@/modules/financial-contexts/application/financial-contexts";
import { updateTransferAction } from "@/modules/transfers/application/transfer-actions";

export default async function EditTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireCurrentAccess();
  const accessibleContextIds = await getWritableFinancialContextIds(access);
  const { id } = await params;
  const database = getDatabase();
  const transfer = await database.transfer.findFirst({
    where: {
      id,
      OR: [
        { sourceContextId: { in: accessibleContextIds } },
        { destinationContextId: { in: accessibleContextIds } },
      ],
      workspaceId: access.workspaceId,
      status: { not: "CANCELED" },
    },
  });

  if (!transfer) {
    notFound();
  }

  const accounts = await database.financialAccount.findMany({
    where: {
      workspaceId: access.workspaceId,
      contextId: { in: accessibleContextIds },
      OR: [
        { active: true },
        { id: transfer.sourceAccountId },
        { id: transfer.destinationAccountId },
      ],
    },
    select: { financialContext: { select: { name: true } }, id: true, name: true },
    orderBy: [{ contextId: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Transferências</p>
          <h1>Editar transferência</h1>
          <p>Os saldos serão recalculados após o salvamento.</p>
        </div>
      </section>
      <TransferForm
        accounts={accounts}
        action={updateTransferAction}
        defaults={{
          amount: transfer.amount.toFixed(2).replace(".", ","),
          description: transfer.description,
          destinationAccountId: transfer.destinationAccountId,
          contextId: transfer.sourceContextId,
          id: transfer.id,
          notes: transfer.notes ?? "",
          settledDate: transfer.settledAt ? toDateInputValue(transfer.settledAt) : "",
          sourceAccountId: transfer.sourceAccountId,
          status: transfer.status === "SETTLED" ? "SETTLED" : "PENDING",
          transferDate: toDateInputValue(transfer.transferDate),
          version: transfer.version,
        }}
        submitLabel="Salvar alterações"
      />
    </>
  );
}

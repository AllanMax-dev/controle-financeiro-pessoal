import Link from "next/link";

import { TransferForm } from "@/components/transfer-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  contextHref,
  getAccessibleFinancialContexts,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import { dateInputInTimeZone } from "@/modules/shared/domain/calendar";
import { createTransferAction } from "@/modules/transfers/application/transfer-actions";

export default async function NewTransferPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(await searchParams),
  );
  const accessibleContextIds = (await getAccessibleFinancialContexts(access)).map(({ id }) => id);
  const today = dateInputInTimeZone(new Date(), access.workspaceTimezone);
  const accounts = await getDatabase().financialAccount.findMany({
    where: { workspaceId: access.workspaceId, contextId: { in: accessibleContextIds }, active: true },
    select: { financialContext: { select: { name: true } }, id: true, name: true },
    orderBy: [{ contextId: "asc" }, { name: "asc" }],
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
          <Link className="primary-button" href={contextHref("/contas/nova", contextState.current.id)}>
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
            settledDate: today,
            sourceAccountId: accounts[0]?.id ?? "",
            status: "PENDING",
            transferDate: today,
          }}
          submitLabel="Criar transferência"
        />
      )}
    </>
  );
}

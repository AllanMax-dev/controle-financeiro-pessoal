import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { cancelTransferAction } from "@/modules/transfers/application/transfer-actions";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthInterval(month: string) {
  const safeMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : currentMonth();
  const start = new Date(`${safeMonth}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { end, month: safeMonth, start };
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; status?: string }>;
}) {
  const access = await requireCurrentAccess();
  const filters = await searchParams;
  const { end, month, start } = monthInterval(filters.month ?? currentMonth());
  const status =
    filters.status === "PENDING" ||
    filters.status === "SETTLED" ||
    filters.status === "CANCELED"
      ? filters.status
      : undefined;
  const where: Prisma.TransferWhereInput = {
    workspaceId: access.workspaceId,
    transferDate: { gte: start, lt: end },
    ...(status ? { status } : {}),
  };
  const transfers = await getDatabase().transfer.findMany({
    where,
    include: { destinationAccount: true, sourceAccount: true },
    orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Entre contas</p>
          <h1>Transferências</h1>
          <p>Transferências movimentam contas, mas não são contabilizadas como receita ou despesa.</p>
        </div>
        <Link className="primary-button" href="/transferencias/nova">
          Nova transferência
        </Link>
      </section>

      <form className="filter-bar compact-filter" method="get">
        <label>
          <span>Mês</span>
          <input name="month" type="month" defaultValue={month} />
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Todos</option>
            <option value="PENDING">Pendentes</option>
            <option value="SETTLED">Realizadas</option>
            <option value="CANCELED">Canceladas</option>
          </select>
        </label>
        <div className="filter-actions">
          <Link className="secondary-button" href="/transferencias">
            Limpar
          </Link>
          <button className="primary-button" type="submit">
            Aplicar
          </button>
        </div>
      </form>

      {transfers.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhuma transferência encontrada</h2>
          <p>Movimente valores entre duas contas sem alterar receitas e despesas.</p>
          <Link className="primary-button" href="/transferencias/nova">
            Criar transferência
          </Link>
        </section>
      ) : (
        <section className="transaction-list" aria-label="Transferências encontradas">
          {transfers.map((transfer) => (
            <article
              className={`transaction-row${transfer.status === "CANCELED" ? " entity-row-muted" : ""}`}
              key={transfer.id}
            >
              <span className="transaction-sign transfer-sign" aria-hidden="true">
                →
              </span>
              <div className="entity-main">
                <strong>{transfer.description}</strong>
                <span>
                  {transfer.sourceAccount.name} → {transfer.destinationAccount.name} ·{" "}
                  {formatDate(transfer.transferDate)}
                </span>
              </div>
              <div className="entity-value">
                <strong>{formatCurrency(transfer.amount)}</strong>
                <span className={`status-pill status-${transfer.status.toLowerCase()}`}>
                  {transfer.status === "SETTLED"
                    ? "Realizada"
                    : transfer.status === "PENDING"
                      ? "Pendente"
                      : "Cancelada"}
                </span>
              </div>
              <div className="row-actions">
                {transfer.status !== "CANCELED" ? (
                  <>
                    <Link className="text-button" href={`/transferencias/${transfer.id}/editar`}>
                      Editar
                    </Link>
                    <ConfirmActionForm
                      action={cancelTransferAction}
                      fields={{ id: transfer.id, version: String(transfer.version) }}
                      label="Cancelar"
                      message="Cancelar esta transferência? Os saldos das contas serão recalculados."
                    />
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

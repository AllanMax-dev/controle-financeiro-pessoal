import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { identifierSchema } from "@/modules/shared/application/form-schemas";
import { cancelTransactionAction } from "@/modules/transactions/application/transaction-actions";
import { ConfirmActionForm } from "@/components/confirm-action-form";

type TransactionSearchParams = {
  accountId?: string;
  categoryId?: string;
  month?: string;
  status?: string;
  type?: string;
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthInterval(month: string) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const start = new Date(`${safeMonth}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  return { end, month: safeMonth, start };
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TransactionSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const filters = await searchParams;
  const { end, month, start } = monthInterval(filters.month ?? currentMonth());
  const type = filters.type === "INCOME" || filters.type === "EXPENSE" ? filters.type : undefined;
  const status =
    filters.status === "PENDING" ||
    filters.status === "SETTLED" ||
    filters.status === "CANCELED"
      ? filters.status
      : undefined;
  const accountId = identifierSchema.safeParse(filters.accountId).success
    ? filters.accountId
    : undefined;
  const categoryId = identifierSchema.safeParse(filters.categoryId).success
    ? filters.categoryId
    : undefined;
  const where: Prisma.TransactionWhereInput = {
    workspaceId: access.workspaceId,
    competenceDate: { gte: start, lt: end },
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  const database = getDatabase();
  const [transactions, accounts, categories] = await Promise.all([
    database.transaction.findMany({
      where,
      include: { account: true, category: true, debtInstallment: { select: { debtId: true } } },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    database.financialAccount.findMany({
      where: { workspaceId: access.workspaceId },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: { workspaceId: access.workspaceId },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Movimentações</p>
          <h1>Lançamentos</h1>
          <p>Receitas e despesas são consolidadas pelo mês de competência.</p>
        </div>
        <Link className="primary-button" href="/lancamentos/novo">
          Novo lançamento
        </Link>
      </section>

      <form className="filter-bar" method="get">
        <label>
          <span>Mês</span>
          <input name="month" type="month" defaultValue={month} />
        </label>
        <label>
          <span>Tipo</span>
          <select name="type" defaultValue={type ?? ""}>
            <option value="">Todos</option>
            <option value="INCOME">Receitas</option>
            <option value="EXPENSE">Despesas</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Todos</option>
            <option value="PENDING">Pendentes</option>
            <option value="SETTLED">Realizados</option>
            <option value="CANCELED">Cancelados</option>
          </select>
        </label>
        <label>
          <span>Conta</span>
          <select name="accountId" defaultValue={accountId ?? ""}>
            <option value="">Todas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Categoria</span>
          <select name="categoryId" defaultValue={categoryId ?? ""}>
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <Link className="secondary-button" href="/lancamentos">
            Limpar
          </Link>
          <button className="primary-button" type="submit">
            Aplicar
          </button>
        </div>
      </form>

      {transactions.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhum lançamento encontrado</h2>
          <p>Altere os filtros ou adicione uma movimentação neste mês.</p>
          <Link className="primary-button" href="/lancamentos/novo">
            Adicionar lançamento
          </Link>
        </section>
      ) : (
        <section className="transaction-list" aria-label="Lançamentos encontrados">
          {transactions.map((transaction) => (
            <article
              className={`transaction-row${transaction.status === "CANCELED" ? " entity-row-muted" : ""}`}
              key={transaction.id}
            >
              <span
                className={`transaction-sign ${transaction.type === "INCOME" ? "income" : "expense"}`}
                aria-hidden="true"
              >
                {transaction.type === "INCOME" ? "+" : "−"}
              </span>
              <div className="entity-main">
                <strong>{transaction.description}</strong>
                <span>
                  {transaction.account.name} · {transaction.category?.name ?? "Sem categoria"} ·{" "}
                  {formatDate(transaction.competenceDate)}
                </span>
              </div>
              <div className="entity-value">
                <strong className={transaction.type === "INCOME" ? "value-income" : "value-expense"}>
                  {transaction.type === "INCOME" ? "+ " : "− "}
                  {formatCurrency(transaction.amount)}
                </strong>
                <span className={`status-pill status-${transaction.status.toLowerCase()}`}>
                  {transaction.status === "SETTLED"
                    ? "Realizado"
                    : transaction.status === "PENDING"
                      ? "Pendente"
                      : "Cancelado"}
                </span>
              </div>
              <div className="row-actions">
                {transaction.debtInstallment ? (
                  <Link className="text-button" href="/dividas">
                    Ver dívida
                  </Link>
                ) : transaction.status !== "CANCELED" ? (
                  <>
                    <Link className="text-button" href={`/lancamentos/${transaction.id}/editar`}>
                      Editar
                    </Link>
                    <ConfirmActionForm
                      action={cancelTransactionAction}
                      fields={{ id: transaction.id, version: String(transaction.version) }}
                      label="Cancelar"
                      message="Cancelar este lançamento? Ele deixará de afetar saldos e indicadores."
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

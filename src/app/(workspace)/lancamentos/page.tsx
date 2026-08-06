import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { cancelTransactionAction } from "@/modules/transactions/application/transaction-actions";
import {
  normalizeTransactionListFilters,
  type TransactionListSearchParams,
} from "@/modules/transactions/application/transaction-list-filters";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TransactionListSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const rawFilters = await searchParams;
  const filters = normalizeTransactionListFilters(rawFilters);
  const activeFilterCount = [
    rawFilters.q?.trim(),
    rawFilters.startDate,
    rawFilters.endDate,
    rawFilters.type,
    rawFilters.status,
    rawFilters.accountId,
    rawFilters.categoryId,
    rawFilters.personId,
  ].filter(Boolean).length;
  const database = getDatabase();
  await synchronizeDueFixedExpenses(access.workspaceId);
  const [accounts, categories, editors] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId: access.workspaceId },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: { workspaceId: access.workspaceId },
      orderBy: { name: "asc" },
    }),
    database.editor.findMany({
      where: { workspaceId: access.workspaceId, active: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const accountId = filters.accountId && accounts.some(({ id }) => id === filters.accountId)
    ? filters.accountId
    : undefined;
  const categoryId = filters.categoryId && categories.some(({ id }) => id === filters.categoryId)
    ? filters.categoryId
    : undefined;
  const personId = filters.personId && editors.some(({ id }) => id === filters.personId)
    ? filters.personId
    : undefined;
  const invalidScopedFilter =
    Boolean(filters.accountId && !accountId) ||
    Boolean(filters.categoryId && !categoryId) ||
    Boolean(filters.personId && !personId);
  const where: Prisma.TransactionWhereInput = {
    workspaceId: access.workspaceId,
    competenceDate: { gte: filters.start, lt: filters.end },
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(accountId ? { accountId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(personId
      ? {
          AND: [
            {
              OR: [
                { debtInstallment: { is: { shares: { some: { editorId: personId } } } } },
                { fixedExpense: { is: { editorId: personId } } },
                { salary: { is: { editorId: personId } } },
              ],
            },
          ],
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { description: { contains: filters.search, mode: "insensitive" } },
            { notes: { contains: filters.search, mode: "insensitive" } },
            { account: { name: { contains: filters.search, mode: "insensitive" } } },
            { category: { name: { contains: filters.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const transactions = invalidScopedFilter
    ? []
    : await database.transaction.findMany({
        where,
        include: {
          account: true,
          category: true,
          debtInstallment: {
            select: {
              debtId: true,
              shares: { select: { editorId: true, editor: { select: { displayName: true } } } },
            },
          },
          fixedExpense: {
            select: { id: true, editor: { select: { displayName: true } } },
          },
          salary: { select: { editor: { select: { displayName: true } } } },
        },
        orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
        take: 200,
      });

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

      <section className="filter-panel" aria-label="Filtros e pesquisa">
        <div className="filter-panel-header">
          <div>
            <p className="eyebrow">Filtros e pesquisa</p>
            <h2>Refinar lançamentos</h2>
          </div>
          <span className="filter-count">
            {activeFilterCount} {activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}
          </span>
        </div>
        <form className="filter-bar transaction-filter-bar" method="get">
          <details className="filter-disclosure" open>
            <summary>
              <span>
                <Icon name="filter" />
                Filtros
              </span>
              <strong>{activeFilterCount}</strong>
            </summary>
            <div className="filter-fields">
              <label className="filter-search">
                <span>Pesquisa</span>
                <input
                  maxLength={120}
                  name="q"
                  placeholder="Descrição, nota, conta ou categoria"
                  type="search"
                  defaultValue={filters.search ?? ""}
                />
              </label>
              <label>
                <span>Início</span>
                <input name="startDate" type="date" defaultValue={filters.startDate} />
              </label>
              <label>
                <span>Fim</span>
                <input name="endDate" type="date" defaultValue={filters.endDate} />
              </label>
              <label>
                <span>Tipo de lançamento</span>
                <select name="type" defaultValue={filters.type ?? ""}>
                  <option value="">Todos</option>
                  <option value="INCOME">Receitas</option>
                  <option value="EXPENSE">Despesas</option>
                </select>
              </label>
              <label>
                <span>Status</span>
                <select name="status" defaultValue={filters.status ?? ""}>
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
              <label>
                <span>Pessoa</span>
                <select name="personId" defaultValue={personId ?? ""}>
                  <option value="">Todas</option>
                  {editors.map((editor) => (
                    <option key={editor.id} value={editor.id}>
                      {editor.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
          <div className="filter-actions">
            <Link className="secondary-button" href="/lancamentos">
              Limpar
            </Link>
            <button className="primary-button" type="submit">
              <Icon name="search" />
              Aplicar
            </button>
          </div>
        </form>
      </section>

      {transactions.length === 0 ? (
        <EmptyState
          action={{ href: "/lancamentos/novo", label: "Adicionar lançamento" }}
          description="Altere os filtros ou adicione uma movimentação para este período."
          icon="income"
          title="Nenhum lançamento encontrado"
        />
      ) : (
        <section className="transaction-list" aria-label="Lançamentos encontrados">
          {transactions.map((transaction) => {
            const personNames = transaction.debtInstallment?.shares
              .map(({ editor }) => editor.displayName)
              .join(" · ") ?? transaction.fixedExpense?.editor.displayName ?? transaction.salary?.editor.displayName;

            return (
              <article
                className={`transaction-row transaction-row-${transaction.type.toLowerCase()}${
                  transaction.status === "CANCELED" ? " entity-row-muted" : ""
                }`}
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
                  {personNames ? (
                    <>
                      {" · "}
                      {personNames}
                    </>
                  ) : null}
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
                ) : transaction.fixedExpense ? (
                  <>
                    {transaction.status !== "CANCELED" ? (
                      <Link className="text-button" href={`/lancamentos/${transaction.id}/editar`}>
                        Editar baixa
                      </Link>
                    ) : null}
                    <Link className="text-button" href="/despesas-fixas">
                      Ver recorrência
                    </Link>
                  </>
                ) : transaction.salary ? (
                  <Link className="text-button" href="/salarios">
                    Ver salário
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
            );
          })}
        </section>
      )}
    </>
  );
}

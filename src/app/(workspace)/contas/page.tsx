import Link from "next/link";

import { AccountDeleteForm } from "@/components/account-delete-form";
import { AccountStatusActionForm } from "@/components/account-status-action-form";

import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import {
  contextHref,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import {
  deleteArchivedAccountFormAction,
  toggleAccountActiveFormAction,
} from "@/modules/accounts/application/account-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";

const accountTypeLabels = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CASH: "Dinheiro",
  DIGITAL: "Conta digital",
  INVESTMENT: "Investimento",
  OTHER: "Outra",
} as const;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(await searchParams),
  );
  const {
    accounts,
    activeAccounts,
    archivedAccounts,
    availableBalance,
    investmentBalance,
    ownerGroups,
    totalBalance,
  } = await getAccountBalances(access.workspaceId, true, contextState.current.id);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Organização</p>
          <h1>Contas</h1>
          <p>O dinheiro disponível fica separado dos investimentos e do patrimônio financeiro.</p>
        </div>
        <Link className="primary-button" href={contextHref("/contas/nova", contextState.current.id)}>
          <Icon name="add" />
          Nova conta
        </Link>
      </section>

      <section className="metric-grid" aria-label="Resumo das contas">
        <article className="metric-card metric-card-featured">
          <span>Dinheiro disponível</span>
          <strong>{formatCurrency(availableBalance)}</strong>
          <small>{activeAccounts.filter(({ type }) => type !== "INVESTMENT").length} contas operacionais</small>
        </article>
        <article className="metric-card">
          <span>Investimentos</span>
          <strong>{formatCurrency(investmentBalance)}</strong>
          <small>{activeAccounts.filter(({ type }) => type === "INVESTMENT").length} contas de investimento</small>
        </article>
        <article className="metric-card">
          <span>Patrimônio financeiro</span>
          <strong>{formatCurrency(totalBalance)}</strong>
          <small>{activeAccounts.length} contas ativas</small>
        </article>
      </section>

      {accounts.length === 0 ? (
        <EmptyState
          action={{ href: contextHref("/contas/nova", contextState.current.id), label: "Criar conta" }}
          description="Crie a primeira conta para registrar saldos, lançamentos e transferências."
          icon="account"
          title="Nenhuma conta cadastrada"
        />
      ) : (
        <>
          {ownerGroups.length === 0 ? (
            <section className="summary-strip" aria-label="Contas ativas">
              <span>Nenhuma conta ativa</span>
              <strong>{formatCurrency(0)}</strong>
              <small>Reative uma conta arquivada ou crie uma nova.</small>
            </section>
          ) : (
            <section className="fixed-expense-person-groups" aria-label="Contas ativas por responsável">
              {ownerGroups.map((group) => (
                <section className="fixed-expense-person-section" key={group.key}>
                  <header className="fixed-expense-person-heading">
                    <div>
                      <p className="eyebrow">Responsável</p>
                      <h2>{group.label}</h2>
                    </div>
                    <div className="fixed-expense-person-totals" aria-label={`Resumo de ${group.label}`}>
                      <span>
                        Disponível <strong>{formatCurrency(group.availableBalance)}</strong>
                      </span>
                      <span>
                        Investido <strong>{formatCurrency(group.investmentBalance)}</strong>
                      </span>
                      <span>
                        Total <strong>{formatCurrency(group.totalBalance)}</strong>
                      </span>
                    </div>
                  </header>
                  <div className="entity-list">
                    {group.accounts.map((account) => (
                      <article className="entity-row account-row" key={account.id}>
                        <span className="entity-color" style={{ backgroundColor: account.color ?? "#256b4b" }} />
                        <div className="entity-main">
                          <strong>{account.name}</strong>
                          <span>{accountTypeLabels[account.type]}</span>
                        </div>
                        <div className="entity-value">
                          <strong>{formatCurrency(account.balance)}</strong>
                          <span className="status-pill status-settled">Ativa</span>
                        </div>
                        <div className="row-actions">
                          <Link className="text-button" href={contextHref(`/contas/${account.id}/editar`, contextState.current.id)}>
                            Editar
                          </Link>
                          <Link className="text-button" href={contextHref(`/contas/${account.id}/ajustar`, contextState.current.id)}>
                            Ajustar saldo atual
                          </Link>
                          <AccountStatusActionForm
                            stateAction={toggleAccountActiveFormAction}
                            accountId={account.id}
                            active={false}
                            version={account.version}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </section>
          )}

          {archivedAccounts.length > 0 ? (
            <details className="installment-details">
              <summary>Ver contas arquivadas</summary>
              <section className="entity-list" aria-label="Contas arquivadas">
                {archivedAccounts.map((account) => {
                  const dependencyCount =
                    account._count.balanceAdjustments +
                    account._count.fixedExpenses +
                    account._count.incoming +
                    account._count.outgoing +
                    account._count.salaries +
                    account._count.transactions;

                  return (
                  <article className="entity-row account-row entity-row-muted" key={account.id}>
                    <span className="entity-color" style={{ backgroundColor: account.color ?? "#256b4b" }} />
                    <div className="entity-main">
                      <strong>{account.name}</strong>
                      <span>
                        {accountTypeLabels[account.type]} · {account.ownerEditor?.displayName ?? "Compartilhada"} · {dependencyCount === 0 ? "sem vínculos" : `${dependencyCount} vínculos`}
                      </span>
                    </div>
                    <div className="entity-value">
                      <strong>{formatCurrency(account.balance)}</strong>
                      <span className="status-pill status-canceled">Arquivada</span>
                    </div>
                    <div className="row-actions">
                      <Link className="text-button" href={contextHref(`/contas/${account.id}/editar`, contextState.current.id)}>
                        Editar
                      </Link>
                      <AccountStatusActionForm
                        stateAction={toggleAccountActiveFormAction}
                        accountId={account.id}
                        active={true}
                        version={account.version}
                      />
                      {dependencyCount === 0 ? (
                        <AccountDeleteForm
                          stateAction={deleteArchivedAccountFormAction}
                          accountId={account.id}
                          version={account.version}
                        />
                      ) : null}
                    </div>
                  </article>
                  );
                })}
              </section>
            </details>
          ) : null}
        </>
      )}
    </>
  );
}

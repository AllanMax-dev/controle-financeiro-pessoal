import Link from "next/link";

import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import { toggleAccountActiveAction } from "@/modules/accounts/application/account-actions";

const accountTypeLabels = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CASH: "Dinheiro",
  DIGITAL: "Conta digital",
  OTHER: "Outra",
} as const;

export default async function AccountsPage() {
  const access = await requireCurrentAccess();
  const { accounts, totalBalance } = await getAccountBalances(access.workspaceId);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Organização</p>
          <h1>Contas</h1>
          <p>O saldo consolidado considera lançamentos realizados e transferências concluídas.</p>
        </div>
        <Link className="primary-button" href="/contas/nova">
          Nova conta
        </Link>
      </section>

      <section className="summary-strip" aria-label="Resumo das contas">
        <span>Saldo total</span>
        <strong>{formatCurrency(totalBalance)}</strong>
        <small>{accounts.filter(({ active }) => active).length} contas ativas</small>
      </section>

      {accounts.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhuma conta cadastrada</h2>
          <p>Crie a primeira conta para começar a registrar suas movimentações.</p>
          <Link className="primary-button" href="/contas/nova">
            Criar conta
          </Link>
        </section>
      ) : (
        <section className="entity-list" aria-label="Contas cadastradas">
          {accounts.map((account) => (
            <article className={`entity-row${account.active ? "" : " entity-row-muted"}`} key={account.id}>
              <span className="entity-color" style={{ backgroundColor: account.color ?? "#256b4b" }} />
              <div className="entity-main">
                <strong>{account.name}</strong>
                <span>{accountTypeLabels[account.type]}</span>
              </div>
              <div className="entity-value">
                <strong>{formatCurrency(account.balance)}</strong>
                <span>{account.active ? "Ativa" : "Arquivada"}</span>
              </div>
              <div className="row-actions">
                <Link className="text-button" href={`/contas/${account.id}/editar`}>
                  Editar
                </Link>
                <form action={toggleAccountActiveAction}>
                  <input name="id" type="hidden" value={account.id} />
                  <input name="version" type="hidden" value={account.version} />
                  <input name="active" type="hidden" value={String(!account.active)} />
                  <button className="text-button" type="submit">
                    {account.active ? "Arquivar" : "Reativar"}
                  </button>
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

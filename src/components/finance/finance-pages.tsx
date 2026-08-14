import type { CSSProperties, ReactNode } from "react";

import {
  createAccountAction,
  createBalanceAdjustmentAction,
  createCategoryAction,
  createCreditCardAction,
  createCreditCardPurchaseAction,
  createDebtAction,
  createFixedExpenseAction,
  createInvestmentAction,
  createSalaryAction,
  createSavingsGoalMovementAction,
  createSavingsGoalAction,
  createTransactionAction,
  createTransferAction,
  confirmSalaryReceiptAction,
  deleteAccountAction,
  deleteBalanceAdjustmentAction,
  deleteCategoryAction,
  deleteCreditCardAction,
  deleteCreditCardInstallmentPaymentAction,
  deleteCreditCardPurchaseAction,
  deleteDebtAction,
  deleteDebtInstallmentPaymentAction,
  deleteFixedExpenseAction,
  deleteInvestmentAction,
  deleteSalaryAction,
  deleteSavingsGoalAction,
  deleteSavingsGoalMovementAction,
  deleteTransactionAction,
  deleteTransferAction,
  payDebtInstallmentAction,
  payCreditCardInstallmentAction,
  payFixedExpenseAction,
  updateAccountAction,
  updateBalanceAdjustmentAction,
  updateCategoryAction,
  updateCreditCardAction,
  updateCreditCardInvoicePaymentAction,
  updateCreditCardPurchaseAction,
  updateDebtAction,
  updateFixedExpenseAction,
  updateInvestmentAction,
  updateSalaryAction,
  updateSavingsGoalAction,
  updateSavingsGoalMovementAction,
  updateTransactionAction,
  updateTransferAction,
} from "@/modules/finance/application/finance-actions";
import { FinanceDashboardChart } from "@/components/finance/dashboard-chart";
import { MonthNavigator } from "@/components/finance/month-navigator";
import { PersonSegment } from "@/components/finance/person-segment";
import type { getFinanceOptions, getFinanceOverview } from "@/modules/finance/application/finance-queries";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { monthlyDueDate } from "@/modules/finance/domain/finance-calculations";
import { money, sumMoney } from "@/modules/shared/domain/money";

type Overview = Awaited<ReturnType<typeof getFinanceOverview>>;
type Options = Awaited<ReturnType<typeof getFinanceOptions>>;
type CardPurchase = Overview["cardPurchases"][number];
type MoneyLike = ReturnType<typeof money>;

const personColors = ["#5f6fb2", "#357a68", "#2f855a"];

function moneyInputValue(value: { toFixed: (places: number) => string }) {
  return value.toFixed(2).replace(".", ",");
}

function monthInputValue(value: Date) {
  return toDateInputValue(value).slice(0, 7);
}

function spendingPercentLabel(paid: MoneyLike, income: MoneyLike) {
  return income.greaterThan(0) ? `${paid.div(income).times(100).toDecimalPlaces(0).toString()}%` : "Sem renda";
}

function ReturnFields({ month, returnTo }: { month: string; returnTo: string }) {
  return (
    <>
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="month" type="hidden" value={month} />
    </>
  );
}

function PersonSelect({ defaultValue, label = "Pessoa", people }: { defaultValue?: string; label?: string; people: Options["people"] }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <select defaultValue={defaultValue} name="personEditorId" required>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AccountSelect({ accounts, defaultValue, label = "Conta", name = "accountId", optional = true }: { accounts: Options["accounts"]; defaultValue?: string | null; label?: string; name?: string; optional?: boolean }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <select defaultValue={defaultValue ?? ""} name={name} required={!optional}>
        {optional ? <option value="">Sem conta</option> : null}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.personEditor.displayName} · {account.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CategorySelect({ categories, defaultValue, kind }: { categories: Options["categories"]; defaultValue?: string | null; kind: "EXPENSE" | "INCOME" }) {
  return (
    <label className="finance-field">
      <span>Categoria</span>
      <select defaultValue={defaultValue ?? ""} name="categoryId">
        <option value="">Sem categoria</option>
        {categories
          .filter((category) => category.kind === kind)
          .map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function TextInput({ defaultValue, label, name, placeholder, required = true, type = "text" }: { defaultValue?: string | number | null; label: string; name: string; placeholder?: string; required?: boolean; type?: string }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <input defaultValue={defaultValue ?? undefined} name={name} placeholder={placeholder} required={required} type={type} />
    </label>
  );
}

function MoneyInput({ defaultValue, label, name = "amount", required = true }: { defaultValue?: string; label: string; name?: string; required?: boolean }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <input defaultValue={defaultValue} inputMode="decimal" name={name} placeholder="0,00" required={required} type="text" />
    </label>
  );
}

type SplitInstallment = {
  shares: unknown[];
};

function splitModeDefault(installments: SplitInstallment[]) {
  return installments.some((installment) => installment.shares.length > 0) ? "EQUAL" : "OWNER";
}

function SplitModeSelect({ defaultValue = "OWNER" }: { defaultValue?: "OWNER" | "EQUAL" }) {
  return (
    <label className="finance-field">
      <span>Divisão</span>
      <select defaultValue={defaultValue} name="splitMode">
        <option value="OWNER">Somente responsável</option>
        <option value="EQUAL">Dividir igualmente</option>
      </select>
    </label>
  );
}

function CardResponsibilitySelect({ defaultValue, people }: { defaultValue?: string; people: Options["people"] }) {
  return (
    <label className="finance-field">
      <span>Responsável</span>
      <select defaultValue={defaultValue} name="responsibilityTarget" required>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
        <option value="COUPLE">Casal</option>
      </select>
    </label>
  );
}

function cardPurchaseUsesCouple(purchase: CardPurchase) {
  return purchase.installments.some((installment) => installment.shares.length > 0);
}

function cardPurchaseShareDefaultValues(purchase: CardPurchase) {
  const values = new Map<string, MoneyLike>();

  for (const installment of purchase.installments) {
    for (const share of installment.shares) {
      const current = values.get(share.personEditorId);
      values.set(share.personEditorId, current ? current.plus(share.amount) : money(share.amount));
    }
  }

  return values;
}

function CardShareFields({ defaultValues, people }: { defaultValues?: Map<string, MoneyLike>; people: Options["people"] }) {
  return (
    <fieldset className="card-share-fields finance-field-wide">
      <legend>Divisão do valor total</legend>
      <div className="card-share-grid">
        {people.map((person) => (
          <MoneyInput
            key={person.id}
            defaultValue={defaultValues?.get(person.id) ? moneyInputValue(defaultValues.get(person.id)!) : undefined}
            label={person.name}
            name={`cardShareAmount:${person.id}`}
            required={false}
          />
        ))}
      </div>
    </fieldset>
  );
}

function cardPurchaseMonthInstallments(purchase: CardPurchase, month: string) {
  return purchase.installments.filter((installment) => monthInputValue(installment.dueMonth) === month);
}

function cardPurchaseMonthTotal(purchase: CardPurchase, month: string) {
  return sumMoney(cardPurchaseMonthInstallments(purchase, month).map((installment) => installment.amount));
}

function cardPurchaseMonthShares(purchase: CardPurchase, month: string) {
  const values = new Map<string, { amount: MoneyLike; id: string; name: string }>();

  for (const installment of cardPurchaseMonthInstallments(purchase, month)) {
    for (const share of installment.shares) {
      const current = values.get(share.personEditorId);
      values.set(share.personEditorId, {
        amount: current ? current.amount.plus(share.amount) : money(share.amount),
        id: share.personEditorId,
        name: share.personEditor.displayName,
      });
    }
  }

  return Array.from(values.values());
}

function cardPurchaseInstallmentDueDate(purchase: CardPurchase, installment: CardPurchase["installments"][number]) {
  return monthlyDueDate(purchase.firstDueDate, installment.number - 1);
}

function NotesField({ defaultValue }: { defaultValue?: string | null } = {}) {
  return (
    <label className="finance-field finance-field-wide">
      <span>Observação</span>
      <textarea defaultValue={defaultValue ?? undefined} maxLength={1000} name="notes" rows={3} />
    </label>
  );
}

function CategoryInlineForm({ kind, month, returnTo }: { kind: "EXPENSE" | "INCOME"; month: string; returnTo: string }) {
  return (
    <form action={createCategoryAction} className="inline-category-form">
      <ReturnFields month={month} returnTo={returnTo} />
      <input name="kind" type="hidden" value={kind} />
      <input name="name" placeholder="+ Nova categoria" required type="text" />
      <input aria-label="Cor" defaultValue={kind === "INCOME" ? "#2f855a" : "#b2554a"} name="color" type="color" />
      <button type="submit">Adicionar</button>
    </form>
  );
}

type FormAction = (formData: FormData) => void | Promise<void>;

function ItemActions({ children }: { children: ReactNode }) {
  return <div className="finance-list-actions">{children}</div>;
}

function EditDetails({ children }: { children: ReactNode }) {
  return (
    <details className="finance-edit-details">
      <summary>Editar</summary>
      {children}
    </details>
  );
}

function DeleteForm({
  action,
  buttonLabel = "Excluir de vez",
  confirmDescription = "Esta ação não poderá ser desfeita.",
  confirmTitle = "Excluir este item?",
  idName,
  idValue,
  month,
  returnTo,
  summaryLabel = "Excluir",
}: {
  action: FormAction;
  buttonLabel?: string;
  confirmDescription?: string;
  confirmTitle?: string;
  idName: string;
  idValue: string;
  month: string;
  returnTo: string;
  summaryLabel?: string;
}) {
  return (
    <form action={action} className="delete-form">
      <ReturnFields month={month} returnTo={returnTo} />
      <input name={idName} type="hidden" value={idValue} />
      <details className="destructive-confirm">
        <summary>{summaryLabel}</summary>
        <div>
          <strong>{confirmTitle}</strong>
          <small>{confirmDescription}</small>
          <button className="finance-danger" type="submit">{buttonLabel}</button>
        </div>
      </details>
    </form>
  );
}

function getActiveTotal(overview: Overview) {
  return overview.activeView === "casal"
    ? overview.coupleTotal
    : overview.totalsByPerson.find((person) => person.id === overview.activeView)?.total ?? overview.coupleTotal;
}

function getVisibleTotalCards(overview: Overview) {
  return overview.activeView === "casal"
    ? [{ id: "casal", name: "Casal", total: overview.coupleTotal }, ...overview.totalsByPerson]
    : overview.totalsByPerson.filter((person) => person.id === overview.activeView);
}

function getVisiblePeople(overview: Overview) {
  return overview.activeView === "casal" ? overview.people : overview.people.filter((person) => person.id === overview.activeView);
}

export function PageHeader({ month, showMonth = true, subtitle, title }: { month: string; showMonth?: boolean; subtitle: string; title: string }) {
  return (
    <section className="finance-page-header">
      <div>
        <p>{subtitle}</p>
        <h1>{title}</h1>
      </div>
      {showMonth ? <MonthNavigator month={month} /> : null}
    </section>
  );
}

export function PersonTabs({ month, overview }: { month: string; overview: Overview }) {
  return <PersonSegment activeView={overview.activeView} month={month} people={overview.people.map((person) => ({ id: person.id, name: person.name }))} />;
}

export function DashboardPageContent({ month, overview }: { month: string; overview: Overview }) {
  const cards = getVisibleTotalCards(overview);
  const chartCards = overview.activeView === "casal" ? overview.totalsByPerson : cards;
  const paymentItems = [
    ...overview.transactions
      .filter(
        (transaction) =>
          transaction.type === "EXPENSE" &&
          transaction.status === "PENDING" &&
          !transaction.creditCardInstallmentId &&
          !transaction.debtInstallmentId &&
          !transaction.fixedExpenseId &&
          !transaction.salaryId,
      )
      .map((transaction) => ({
        amount: transaction.amount,
        dueDate: transaction.dueDate ?? transaction.competenceDate,
        id: `transaction-${transaction.id}`,
        name: transaction.description,
        person: transaction.personEditor.displayName,
        status: transaction.category?.name ?? "Gasto variavel",
      })),
    ...overview.fixedExpenseOccurrences
      .filter((expense) => expense.status === "PENDING")
      .map((expense) => ({
        amount: expense.amount,
        dueDate: expense.dueDate,
        id: `fixed-${expense.id}`,
        name: expense.description,
        person: expense.personEditor.displayName,
        status: "Gasto fixo",
      })),
    ...overview.debtInstallments
      .filter((installment) => installment.status === "PENDING")
      .map((installment) => ({
        amount: installment.amount,
        dueDate: installment.dueDate,
        id: `debt-${installment.id}`,
        name: installment.debt.description,
        person: installment.personEditor.displayName,
        status: `Divida - parcela ${installment.number}`,
      })),
    ...overview.cardInstallments
      .filter((installment) => installment.status === "OPEN")
      .map((installment) => ({
        amount: installment.amount,
        dueDate: installment.dueMonth,
        id: `card-${installment.id}`,
        name: installment.purchase.description,
        person: installment.personEditor.displayName,
        status: `Cartao - ${installment.card.name}`,
      })),
  ].sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime()).slice(0, 6);
  const receivableItems = [
    ...overview.salaryOccurrences
      .filter((salary) => salary.status === "PENDING")
      .map((salary) => ({
      amount: salary.amount,
      dueDate: salary.dueDate,
      id: `salary-${salary.id}`,
      name: salary.description,
      person: salary.personEditor.displayName,
      status: "Salario pendente",
    })),
    ...overview.transactions
      .filter((transaction) => transaction.type === "INCOME" && transaction.status === "PENDING" && !transaction.salaryId)
      .map((transaction) => ({
        amount: transaction.amount,
        dueDate: transaction.dueDate ?? transaction.competenceDate,
        id: `receivable-${transaction.id}`,
        name: transaction.description,
        person: transaction.personEditor.displayName,
        status: transaction.category?.name ?? "Recebimento pendente",
      })),
  ].sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime()).slice(0, 6);
  const chartData = chartCards.map((card) => ({
    gastos: Number(card.total.expenses.toString()),
    name: card.name,
    recebimentos: Number(card.total.income.toString()),
    saldo: Number(card.total.available.toString()),
  }));

  return (
    <>
      <PageHeader month={month} subtitle="Resumo financeiro pessoal" title="Dashboard" />
      <PersonTabs month={month} overview={overview} />
      <section className="snapshot-grid" aria-label="Resumo Allan, Mayara e Casal">
        {cards.map((card, index) => (
          <article className="snapshot-card" key={card.id} style={{ "--tone": personColors[index % personColors.length] } as CSSProperties}>
            <span>{card.name}</span>
            <strong>{formatCurrency(card.total.available)}</strong>
            <small>Saldo disponível</small>
            <dl>
              <div>
                <dt>Gastos</dt>
                <dd>{formatCurrency(card.total.expenses)}</dd>
              </div>
              <div>
                <dt>Recebimentos</dt>
                <dd>{formatCurrency(card.total.income)}</dd>
              </div>
              <div>
                <dt>A receber</dt>
                <dd>{formatCurrency(card.total.receivable)}</dd>
              </div>
              <div>
                <dt>Falta pagar</dt>
                <dd>{formatCurrency(card.total.pending)}</dd>
              </div>
              <div>
                <dt>Investido</dt>
                <dd>{formatCurrency(card.total.investments)}</dd>
              </div>
              <div>
                <dt>Patrimônio</dt>
                <dd>{formatCurrency(card.total.wealth)}</dd>
              </div>
              <div>
                <dt>Resultado</dt>
                <dd>{formatCurrency(card.total.net)}</dd>
              </div>
              <div>
                <dt>Uso da renda</dt>
                <dd>{spendingPercentLabel(card.total.paid, card.total.income)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      <section className="finance-dashboard-grid">
        <article className="finance-panel">
          <h2>Panorama do mês</h2>
          <FinanceDashboardChart data={chartData} />
        </article>
        <article className="finance-panel">
          <h2>Próximos pagamentos</h2>
          <ul className="finance-list">
            {paymentItems.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.person} - {item.status}{item.dueDate ? ` - ${formatDate(item.dueDate)}` : ""}</small>
                </span>
                <b>{formatCurrency(item.amount)}</b>
              </li>
            ))}
          </ul>
          {paymentItems.length === 0 ? <p className="empty-state">Nenhum pagamento pendente no mês.</p> : null}
        </article>
        <article className="finance-panel">
          <h2>Próximos recebimentos</h2>
          <ul className="finance-list">
            {receivableItems.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.person} - {item.status}{item.dueDate ? ` - ${formatDate(item.dueDate)}` : ""}</small>
                </span>
                <b>{formatCurrency(item.amount)}</b>
              </li>
            ))}
          </ul>
          {receivableItems.length === 0 ? <p className="empty-state">Nenhum recebimento pendente no mês.</p> : null}
        </article>
      </section>
    </>
  );
}

function CreatePanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="finance-workspace finance-workspace-form-only finance-create-section">
      <details className="finance-panel finance-create-sheet card-admin-panel" id="finance-create">
        <summary>
          <span>{title}</span>
          <strong>Adicionar</strong>
        </summary>
        <div className="finance-create-body">{children}</div>
      </details>
    </section>
  );
}

function WorkspacePage({ children, formTitle, month, showMonth = true, subtitle, title }: { children: ReactNode; formTitle: string; listTitle: string; month: string; showMonth?: boolean; subtitle: string; title: string }) {
  return (
    <>
      <PageHeader month={month} showMonth={showMonth} subtitle={subtitle} title={title} />
      <CreatePanel title={formTitle}>{children}</CreatePanel>
    </>
  );
}

export function BanksPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  const activeTotal = getActiveTotal(overview);
  const accountGroups = getVisiblePeople(overview)
    .map((person) => {
      const accounts = overview.accounts.filter((account) => account.personEditorId === person.id);

      return {
        investments: accounts.filter((account) => account.type === "INVESTMENT"),
        operational: accounts.filter((account) => account.type !== "INVESTMENT"),
        person,
      };
    })
    .filter((group) => group.operational.length > 0 || group.investments.length > 0);
  const renderAccountItem = (account: (typeof overview.accounts)[number]) => {
    const accountAdjustments = overview.balanceAdjustments.filter((adjustment) => adjustment.accountId === account.id);

    return (
      <li key={account.id}>
        <div className="finance-item-main">
          <span>
            <strong>{account.name}</strong>
            <small>{account.personEditor.displayName} · {account.institution ?? "Sem instituição"}</small>
          </span>
          <b>{formatCurrency(account.balance)}</b>
        </div>
        <ItemActions>
          <EditDetails>
            <form action={updateAccountAction} className="finance-edit-form">
              <ReturnFields month={month} returnTo="/bancos" />
              <input name="accountId" type="hidden" value={account.id} />
              <PersonSelect defaultValue={account.personEditorId} people={options.people} />
              <TextInput defaultValue={account.institution} label="Instituição" name="institution" required={false} />
              <TextInput defaultValue={account.name} label="Nome" name="name" />
              <label className="finance-field">
                <span>Tipo</span>
                <select defaultValue={account.type} name="type" required>
                  <option value="CHECKING">Conta corrente</option>
                  <option value="DIGITAL">Conta digital</option>
                  <option value="SAVINGS">Poupança</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="INVESTMENT">Investimento</option>
                  <option value="OTHER">Outra</option>
                </select>
              </label>
              <MoneyInput defaultValue={moneyInputValue(account.initialBalance)} label="Saldo inicial" name="initialBalance" />
              <TextInput defaultValue={account.color} label="Cor" name="color" required={false} type="color" />
              <button className="finance-secondary" type="submit">Salvar</button>
            </form>
            <form action={createBalanceAdjustmentAction} className="finance-edit-form account-balance-adjustment-form">
              <ReturnFields month={month} returnTo="/bancos" />
              <input name="accountId" type="hidden" value={account.id} />
              <MoneyInput defaultValue={moneyInputValue(account.balance)} label="Saldo real hoje" name="targetBalance" />
              <TextInput label="Data" name="effectiveAt" type="date" />
              <NotesField />
              <button className="finance-secondary" type="submit">Ajustar saldo atual</button>
            </form>
            {accountAdjustments.length > 0 ? (
              <div className="account-adjustment-history">
                <strong>Ajustes deste mês</strong>
                <ul className="finance-list">
                  {accountAdjustments.map((adjustment) => (
                    <li key={adjustment.id}>
                      <div className="finance-item-main">
                        <span>
                          <strong>{formatDate(adjustment.effectiveAt)}</strong>
                          <small>Saldo real informado</small>
                        </span>
                        <b>{formatCurrency(adjustment.targetBalance)}</b>
                      </div>
                      <ItemActions>
                        <EditDetails>
                          <form action={updateBalanceAdjustmentAction} className="finance-edit-form">
                            <ReturnFields month={month} returnTo="/bancos" />
                            <input name="adjustmentId" type="hidden" value={adjustment.id} />
                            <MoneyInput defaultValue={moneyInputValue(adjustment.targetBalance)} label="Saldo real" name="targetBalance" />
                            <TextInput defaultValue={toDateInputValue(adjustment.effectiveAt)} label="Data" name="effectiveAt" type="date" />
                            <NotesField defaultValue={adjustment.notes} />
                            <button className="finance-secondary" type="submit">Salvar</button>
                          </form>
                        </EditDetails>
                        <DeleteForm action={deleteBalanceAdjustmentAction} idName="adjustmentId" idValue={adjustment.id} month={month} returnTo="/bancos" />
                      </ItemActions>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </EditDetails>
          <DeleteForm action={deleteAccountAction} idName="accountId" idValue={account.id} month={month} returnTo="/bancos" />
        </ItemActions>
      </li>
    );
  };

  return (
    <>
      <PageHeader month={month} subtitle="Bancos e dinheiro" title="Bancos" />
      <PersonTabs month={month} overview={overview} />
      <section className="card-month-summary" aria-label="Resumo de dinheiro e investimentos">
        <article className="card-month-card">
          <span>Dinheiro disponível</span>
          <strong>{formatCurrency(activeTotal.available)}</strong>
          <small>Contas de uso diário, sem investimentos</small>
        </article>
        <article className="card-month-card">
          <span>Investimentos</span>
          <strong>{formatCurrency(activeTotal.investments)}</strong>
          <small>Separado do dinheiro disponível</small>
        </article>
        <article className="card-month-card">
          <span>Patrimônio financeiro</span>
          <strong>{formatCurrency(activeTotal.wealth)}</strong>
          <small>Disponível + investido</small>
        </article>
      </section>
      <section className="compact-card">
        <h2>Contas</h2>
        {accountGroups.length === 0 ? <p className="empty-state">Nenhuma conta cadastrada.</p> : null}
        <div className="person-group-stack">
          {accountGroups.map((group) => (
            <section className="person-group" key={group.person.id}>
              <h2>{group.person.name}</h2>
              {group.operational.length > 0 ? (
                <>
                  <h3>Contas</h3>
                  <ul className="finance-list account-list">
                    {group.operational.map(renderAccountItem)}
                  </ul>
                </>
              ) : null}
              {group.investments.length > 0 ? (
                <>
                  <h3>Investimentos</h3>
                  <ul className="finance-list account-list">
                    {group.investments.map(renderAccountItem)}
                  </ul>
                </>
              ) : null}
            </section>
          ))}
        </div>
      </section>
      <CreatePanel title="Nova conta">
        <form action={createAccountAction} className="finance-form">
          <ReturnFields month={month} returnTo="/bancos" />
          <PersonSelect people={options.people} />
          <TextInput label="Instituição" name="institution" required={false} />
          <TextInput label="Nome" name="name" placeholder="Conta principal" />
          <label className="finance-field">
            <span>Tipo</span>
            <select name="type" required>
              <option value="CHECKING">Conta corrente</option>
              <option value="DIGITAL">Conta digital</option>
              <option value="SAVINGS">Poupança</option>
              <option value="CASH">Dinheiro</option>
              <option value="INVESTMENT">Investimento</option>
              <option value="OTHER">Outra</option>
            </select>
          </label>
          <MoneyInput label="Saldo inicial" name="initialBalance" />
          <TextInput defaultValue="#357a68" label="Cor" name="color" required={false} type="color" />
          <button className="finance-primary" type="submit">Criar conta</button>
        </form>
      </CreatePanel>
    </>
  );
}

export function TransactionPageContent({ kind, month, options, overview, title }: { kind: "EXPENSE" | "INCOME"; month: string; options: Options; overview: Overview; title: string }) {
  const returnPath = kind === "INCOME" ? "/recebimentos" : "/gastos-variaveis";
  const transactions = overview.transactions
    .filter((transaction) => transaction.type === (kind === "INCOME" ? "INCOME" : "EXPENSE"))
    .filter((transaction) => {
      if (kind === "INCOME") {
        return !transaction.salaryId;
      }

      return !transaction.creditCardInstallmentId && !transaction.debtInstallmentId && !transaction.fixedExpenseId && !transaction.salaryId;
    });

  return (
    <>
      <WorkspacePage formTitle={kind === "INCOME" ? "Registrar recebimento" : "Adicionar lançamento"} listTitle="Lançamentos do mês" month={month} subtitle="Movimentações mensais" title={title}>
        <form action={createTransactionAction} className="finance-form">
          <ReturnFields month={month} returnTo={returnPath} />
          <input name="type" type="hidden" value={kind} />
          <PersonSelect people={options.people} />
          <TextInput label="Descrição" name="description" />
          <MoneyInput label="Valor" />
          <TextInput label="Data" name="date" type="date" />
          <CategorySelect categories={options.categories} kind={kind} />
          <AccountSelect accounts={options.accounts} optional={false} />
          <label className="finance-field">
            <span>Status</span>
            <select name="status">
              <option value="SETTLED">Realizado</option>
              <option value="PENDING">Pendente</option>
            </select>
          </label>
          <NotesField />
          <button className="finance-primary" type="submit">{kind === "INCOME" ? "Registrar recebimento" : "Adicionar lançamento"}</button>
        </form>
        <CategoryInlineForm kind={kind} month={month} returnTo={returnPath} />
      </WorkspacePage>
      <ul className="finance-list detached-list">
        {transactions.map((transaction) => (
            <li key={transaction.id}>
              <div className="finance-item-main">
                <span>
                <strong>{transaction.description}</strong>
                <small>{transaction.personEditor.displayName} · {transaction.category?.name ?? "Sem categoria"}</small>
                </span>
                <b>{formatCurrency(transaction.amount)}</b>
              </div>
              <ItemActions>
                <EditDetails>
                  <form action={updateTransactionAction} className="finance-edit-form">
                    <ReturnFields month={month} returnTo={returnPath} />
                    <input name="transactionId" type="hidden" value={transaction.id} />
                    <input name="type" type="hidden" value={kind} />
                    <PersonSelect defaultValue={transaction.personEditorId} people={options.people} />
                    <TextInput defaultValue={transaction.description} label="Descricao" name="description" />
                    <MoneyInput defaultValue={moneyInputValue(transaction.amount)} label="Valor" />
                    <TextInput defaultValue={toDateInputValue(transaction.competenceDate)} label="Data" name="date" type="date" />
                    <CategorySelect categories={options.categories} defaultValue={transaction.categoryId} kind={kind} />
                    <AccountSelect accounts={options.accounts} defaultValue={transaction.accountId} optional={false} />
                    <label className="finance-field">
                      <span>Status</span>
                      <select defaultValue={transaction.status} name="status">
                        <option value="SETTLED">Realizado</option>
                        <option value="PENDING">Pendente</option>
                      </select>
                    </label>
                    <NotesField defaultValue={transaction.notes} />
                    <button className="finance-secondary" type="submit">Salvar</button>
                  </form>
                </EditDetails>
                <DeleteForm action={deleteTransactionAction} idName="transactionId" idValue={transaction.id} month={month} returnTo={returnPath} />
              </ItemActions>
            </li>
          ))}
      </ul>
    </>
  );
}

export function FixedExpensesPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  const showPersonGroups = overview.activeView === "casal";
  const recurringGroups = overview.people
    .map((person) => ({
      expenses: overview.fixedExpenses.filter((expense) => expense.personEditorId === person.id),
      person,
    }))
    .filter(({ expenses }) => expenses.length > 0);
  const fixedSummaryCards = getVisiblePeople(overview).map((person) => {
    const expenses = overview.fixedExpenses.filter((expense) => expense.personEditorId === person.id);
    const occurrences = overview.fixedExpenseOccurrences.filter((expense) => expense.personEditorId === person.id);

    return {
      id: person.id,
      name: person.name,
      paid: sumMoney(occurrences.filter((expense) => expense.status === "SETTLED").map((expense) => expense.amount)),
      pending: sumMoney(occurrences.filter((expense) => expense.status === "PENDING").map((expense) => expense.amount)),
      total: sumMoney(expenses.map((expense) => expense.amount)),
    };
  });
  const fixedCoupleSummary = {
    id: "casal",
    name: "Casal",
    paid: sumMoney(fixedSummaryCards.map((summary) => summary.paid)),
    pending: sumMoney(fixedSummaryCards.map((summary) => summary.pending)),
    total: sumMoney(fixedSummaryCards.map((summary) => summary.total)),
  };
  const visibleFixedSummaryCards = overview.activeView === "casal" ? [fixedCoupleSummary, ...fixedSummaryCards] : fixedSummaryCards;
  const currentMonthOccurrences = new Map(overview.fixedExpenseOccurrences.map((expense) => [expense.fixedExpenseId, expense]));
  const renderRecurring = (expense: Overview["fixedExpenses"][number]) => {
    const occurrence = currentMonthOccurrences.get(expense.id);
    const amount = occurrence?.amount ?? expense.amount;
    const dueDate = occurrence?.dueDate;

    return (
    <li key={expense.id}>
    <div className="finance-item-main">
      <span>
      <strong>{expense.description}</strong>
      <small>{expense.personEditor.displayName} · vence {dueDate ? formatDate(dueDate) : `dia ${expense.dueDay}`}</small>
      </span>
      <b>{formatCurrency(amount)}</b>
    </div>
    <ItemActions>
      {occurrence ? (
        <span className="finance-status" data-status={occurrence.status}>
          {occurrence.status === "SETTLED" ? "Pago" : "Pendente"}
        </span>
      ) : null}
      {occurrence?.status === "PENDING" ? (
        <details className="inline-payment-details">
          <summary>Pagar</summary>
          <form action={payFixedExpenseAction} className="inline-payment-form">
            <ReturnFields month={month} returnTo="/despesas-fixas" />
            <input name="fixedExpenseId" type="hidden" value={expense.id} />
            <input name="dueDate" type="hidden" value={toDateInputValue(occurrence.dueDate)} />
            <MoneyInput defaultValue={moneyInputValue(amount)} label="Pagamento" name="amount" />
            <TextInput defaultValue={toDateInputValue(occurrence.dueDate)} label="Data" name="paidAt" type="date" />
            <AccountSelect accounts={options.accounts} defaultValue={occurrence.accountId} label="Conta" name="accountId" optional={false} />
            <button className="finance-secondary" type="submit">Pagar</button>
          </form>
        </details>
      ) : null}
      <EditDetails>
        <form action={updateFixedExpenseAction} className="finance-edit-form">
          <ReturnFields month={month} returnTo="/despesas-fixas" />
          <input name="fixedExpenseId" type="hidden" value={expense.id} />
          <PersonSelect defaultValue={expense.personEditorId} people={options.people} />
          <TextInput defaultValue={expense.description} label="Descricao" name="description" />
          <MoneyInput defaultValue={moneyInputValue(expense.amount)} label="Valor" />
          <TextInput defaultValue={monthInputValue(expense.startMonth)} label="Mes inicial" name="startMonth" type="month" />
          <TextInput defaultValue={expense.dueDay} label="Dia de vencimento" name="dueDay" type="number" />
          <CategorySelect categories={options.categories} defaultValue={expense.categoryId} kind="EXPENSE" />
          <AccountSelect accounts={options.accounts} defaultValue={expense.accountId} />
          <label className="finance-field">
            <span>Status padrao</span>
            <select defaultValue={expense.status} name="status">
              <option value="PENDING">Pendente</option>
              <option value="SETTLED">Realizado</option>
            </select>
          </label>
          <NotesField defaultValue={expense.notes} />
          <button className="finance-secondary" type="submit">Salvar</button>
        </form>
      </EditDetails>
      <DeleteForm action={deleteFixedExpenseAction} idName="fixedExpenseId" idValue={expense.id} month={month} returnTo="/despesas-fixas" />
    </ItemActions>
  </li>
  );
  };
  const renderRecurringList = (expenses: Overview["fixedExpenses"]) =>
    expenses.length === 0 ? (
      <p className="empty-state">Nenhum gasto fixo cadastrado.</p>
    ) : (
      <ul className="finance-list detached-list">
        {expenses.map(renderRecurring)}
      </ul>
    );

  return (
    <>
      <WorkspacePage formTitle="Novo gasto fixo" listTitle="Recorrências ativas" month={month} showMonth={false} subtitle="Compromissos recorrentes" title="Gastos fixos">
        <form action={createFixedExpenseAction} className="finance-form">
          <ReturnFields month={month} returnTo="/despesas-fixas" />
          <PersonSelect people={options.people} />
          <TextInput label="Descrição" name="description" />
          <MoneyInput label="Valor" />
          <TextInput label="Mês inicial" name="startMonth" type="month" />
          <TextInput label="Dia de vencimento" name="dueDay" type="number" />
          <CategorySelect categories={options.categories} kind="EXPENSE" />
          <AccountSelect accounts={options.accounts} />
          <label className="finance-field">
            <span>Status padrão</span>
            <select name="status">
              <option value="PENDING">Pendente</option>
              <option value="SETTLED">Realizado</option>
            </select>
          </label>
          <NotesField />
          <button className="finance-primary" type="submit">Criar recorrência</button>
        </form>
      </WorkspacePage>
      <PersonTabs month={month} overview={overview} />
      <section className="card-month-summary" aria-label="Resumo dos gastos fixos">
        {visibleFixedSummaryCards.map((summary) => (
          <article className="card-month-card" data-active={overview.activeView === summary.id ? "true" : undefined} key={summary.id}>
            <span>{summary.name}</span>
            <strong>{formatCurrency(summary.total)}</strong>
            <small>Compromisso mensal fixo</small>
            <dl>
              <div>
                <dt>Pendente no mês</dt>
                <dd>{formatCurrency(summary.pending)}</dd>
              </div>
              <div>
                <dt>Pago no mês</dt>
                <dd>{formatCurrency(summary.paid)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      <section className="compact-card">
        <h2>Gastos fixos</h2>
        {showPersonGroups ? (
          <div className="person-group-stack recurring-group-stack">
            {recurringGroups.length === 0 ? <p className="empty-state">Nenhum gasto fixo cadastrado.</p> : null}
            {recurringGroups.map(({ expenses, person }) => (
              <section className="person-group" key={person.id}>
                <h2>{person.name}</h2>
                {renderRecurringList(expenses)}
              </section>
            ))}
          </div>
        ) : (
          renderRecurringList(overview.fixedExpenses)
        )}
      </section>
    </>
  );
}

export function ReceiptsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  const salarySummaryCards = getVisiblePeople(overview).map((person) => {
    const salaries = overview.salaries.filter((salary) => salary.personEditorId === person.id);
    const occurrences = overview.salaryOccurrences.filter((salary) => salary.personEditorId === person.id);

    return {
      id: person.id,
      name: person.name,
      received: sumMoney(occurrences.filter((salary) => salary.status === "SETTLED").map((salary) => salary.amount)),
      receivable: sumMoney(occurrences.filter((salary) => salary.status === "PENDING").map((salary) => salary.amount)),
      total: sumMoney(salaries.map((salary) => salary.amount)),
    };
  });
  const salaryCoupleSummary = {
    id: "casal",
    name: "Casal",
    received: sumMoney(salarySummaryCards.map((summary) => summary.received)),
    receivable: sumMoney(salarySummaryCards.map((summary) => summary.receivable)),
    total: sumMoney(salarySummaryCards.map((summary) => summary.total)),
  };
  const visibleSalarySummaryCards = overview.activeView === "casal" ? [salaryCoupleSummary, ...salarySummaryCards] : salarySummaryCards;

  return (
    <>
      <TransactionPageContent kind="INCOME" month={month} options={options} overview={overview} title="Recebimentos" />
      <PersonTabs month={month} overview={overview} />
      <section className="card-month-summary" aria-label="Resumo de salários">
        {visibleSalarySummaryCards.map((summary) => (
          <article className="card-month-card" data-active={overview.activeView === summary.id ? "true" : undefined} key={summary.id}>
            <span>{summary.name}</span>
            <strong>{formatCurrency(summary.total)}</strong>
            <small>Renda recorrente mensal</small>
            <dl>
              <div>
                <dt>Recebido</dt>
                <dd>{formatCurrency(summary.received)}</dd>
              </div>
              <div>
                <dt>A receber</dt>
                <dd>{formatCurrency(summary.receivable)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      {overview.salaryOccurrences.length > 0 ? (
        <section className="compact-card">
          <h2>Salarios do mes</h2>
          <ul className="finance-list">
            {overview.salaryOccurrences.map((salary) => (
              <li key={salary.id}>
                <div className="finance-item-main">
                  <span>
                    <strong>{salary.description}</strong>
                    <small>{salary.personEditor.displayName} - vence {formatDate(salary.dueDate)} - parcela {salary.installmentNumber}</small>
                  </span>
                  <b>{formatCurrency(salary.amount)}</b>
                </div>
                <div className="finance-list-actions">
                  <span className="finance-status" data-status={salary.status}>
                    {salary.status === "SETTLED" ? "Confirmado" : "Pendente"}
                  </span>
                  {salary.status === "PENDING" ? (
                    <form action={confirmSalaryReceiptAction} className="inline-confirm-form">
                      <ReturnFields month={month} returnTo="/recebimentos" />
                      <input name="salaryId" type="hidden" value={salary.salaryId} />
                      <input name="dueDate" type="hidden" value={toDateInputValue(salary.dueDate)} />
                      <button className="finance-secondary" type="submit">Confirmar</button>
                    </form>
                  ) : null}
                  {salary.status === "SETTLED" && salary.transactionId ? (
                    <DeleteForm action={deleteTransactionAction} idName="transactionId" idValue={salary.transactionId} month={month} returnTo="/recebimentos" />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <details className="compact-card">
        <summary>Gerenciar salarios recorrentes</summary>
      <form action={createSalaryAction} className="finance-form">
        <ReturnFields month={month} returnTo="/recebimentos" />
        <h2>Salário recorrente</h2>
        <PersonSelect people={options.people} />
        <TextInput label="Descrição" name="description" placeholder="Salário" />
        <MoneyInput label="Valor mensal liquido" />
        <TextInput label="Mês inicial" name="startMonth" type="month" />
        <TextInput label="Dia de pagamento" name="paymentDay" type="number" />
        <label className="finance-field finance-field-wide">
          <span>Frequência</span>
          <select name="frequency">
            <option value="MONTHLY">Mensal</option>
            <option value="FORTNIGHTLY">Quinzenal, dividido entre o dia informado e o fim do mes</option>
          </select>
        </label>
        <CategorySelect categories={options.categories} kind="INCOME" />
        <AccountSelect accounts={options.accounts} optional={false} />
        <button className="finance-secondary" type="submit">Cadastrar salário</button>
      </form>
      <ul className="finance-list detached-list">
        {overview.salaries.map((salary) => (
          <li key={salary.id}>
            <div className="finance-item-main">
              <span>
              <strong>{salary.description}</strong>
              <small>{salary.personEditor.displayName} · dia {salary.paymentDay}</small>
              </span>
              <b>{formatCurrency(salary.amount)}</b>
            </div>
            <ItemActions>
              <EditDetails>
                <form action={updateSalaryAction} className="finance-edit-form">
                  <ReturnFields month={month} returnTo="/recebimentos" />
                  <input name="salaryId" type="hidden" value={salary.id} />
                  <PersonSelect defaultValue={salary.personEditorId} people={options.people} />
                  <TextInput defaultValue={salary.description} label="Descricao" name="description" />
                  <MoneyInput defaultValue={moneyInputValue(salary.amount)} label="Valor mensal liquido" />
                  <TextInput defaultValue={monthInputValue(salary.startMonth)} label="Mes inicial" name="startMonth" type="month" />
                  <TextInput defaultValue={salary.paymentDay} label="Dia de pagamento" name="paymentDay" type="number" />
                  <label className="finance-field">
                    <span>Frequencia</span>
                    <select defaultValue={salary.frequency} name="frequency">
                      <option value="MONTHLY">Mensal</option>
                      <option value="FORTNIGHTLY">Quinzenal</option>
                    </select>
                  </label>
                  <CategorySelect categories={options.categories} defaultValue={salary.categoryId} kind="INCOME" />
                  <AccountSelect accounts={options.accounts} defaultValue={salary.accountId} optional={false} />
                  <NotesField defaultValue={salary.notes} />
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteSalaryAction} idName="salaryId" idValue={salary.id} month={month} returnTo="/recebimentos" />
            </ItemActions>
          </li>
        ))}
      </ul>
      </details>
    </>
  );
}

export function DebtsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  const returnTo = "/dividas";
  const visiblePeople = getVisiblePeople(overview);
  const visiblePersonIds = new Set(visiblePeople.map((person) => person.id));
  const monthlyDebtRows = overview.debts
    .map((debt) => ({
      currentInstallments: overview.debtInstallments.filter((installment) => installment.debt.id === debt.id),
      debt,
    }))
    .filter(({ currentInstallments }) => currentInstallments.length > 0);
  const currentMonthOccurrences = new Map(overview.fixedExpenseOccurrences.map((expense) => [expense.fixedExpenseId, expense]));
  const fixedGroups = visiblePeople
    .map((person) => ({
      expenses: overview.fixedExpenses.filter((expense) => expense.personEditorId === person.id),
      person,
    }))
    .filter(({ expenses }) => expenses.length > 0);
  const sharedPurchases = overview.cardPurchases.filter(cardPurchaseUsesCouple);
  const purchaseGroups = (
    overview.activeView === "casal"
      ? [
          { id: "casal", name: "Casal", purchases: sharedPurchases },
          ...visiblePeople.map((person) => ({
            id: person.id,
            name: person.name,
            purchases: overview.cardPurchases.filter((purchase) => !cardPurchaseUsesCouple(purchase) && purchase.personEditorId === person.id),
          })),
        ]
      : visiblePeople.map((person) => ({
          id: person.id,
          name: person.name,
          purchases: overview.cardPurchases,
        }))
  ).filter((group) => group.purchases.length > 0);
  const monthlyDebtSummaryCards = visiblePeople.map((person) => {
    const installments = overview.debtInstallments.filter((installment) => installment.personEditorId === person.id);
    const cardInstallments = overview.cardInstallments.filter((installment) => installment.personEditorId === person.id);
    const fixedOccurrences = overview.fixedExpenseOccurrences.filter((expense) => expense.personEditorId === person.id);
    const fixedTotal = sumMoney(fixedOccurrences.map((expense) => expense.amount));
    const installmentTotal = sumMoney([...installments.map((installment) => installment.amount), ...cardInstallments.map((installment) => installment.amount)]);

    return {
      id: person.id,
      name: person.name,
      fixed: fixedTotal,
      installments: installmentTotal,
      paid: sumMoney([
        ...installments.filter((installment) => installment.status === "PAID").map((installment) => installment.amount),
        ...cardInstallments.filter((installment) => installment.status === "PAID").map((installment) => installment.amount),
        ...fixedOccurrences.filter((expense) => expense.status === "SETTLED").map((expense) => expense.amount),
      ]),
      pending: sumMoney([
        ...installments.filter((installment) => installment.status === "PENDING").map((installment) => installment.amount),
        ...cardInstallments.filter((installment) => installment.status === "OPEN").map((installment) => installment.amount),
        ...fixedOccurrences.filter((expense) => expense.status === "PENDING").map((expense) => expense.amount),
      ]),
      total: installmentTotal.plus(fixedTotal),
    };
  });
  const monthlyDebtCoupleSummary = {
    id: "casal",
    name: "Casal",
    fixed: sumMoney(monthlyDebtSummaryCards.map((summary) => summary.fixed)),
    installments: sumMoney(monthlyDebtSummaryCards.map((summary) => summary.installments)),
    paid: sumMoney(monthlyDebtSummaryCards.map((summary) => summary.paid)),
    pending: sumMoney(monthlyDebtSummaryCards.map((summary) => summary.pending)),
    total: sumMoney(monthlyDebtSummaryCards.map((summary) => summary.total)),
  };
  const visibleMonthlyDebtSummaryCards = overview.activeView === "casal" ? [monthlyDebtCoupleSummary, ...monthlyDebtSummaryCards] : monthlyDebtSummaryCards;
  const renderFixedExpense = (expense: Overview["fixedExpenses"][number]) => {
    const occurrence = currentMonthOccurrences.get(expense.id);
    const amount = occurrence?.amount ?? expense.amount;
    const dueDate = occurrence?.dueDate;

    return (
      <li key={expense.id}>
        <div className="finance-item-main">
          <span>
            <strong>{expense.description}</strong>
            <small>{expense.personEditor.displayName} · vence {dueDate ? formatDate(dueDate) : `dia ${expense.dueDay}`}</small>
          </span>
          <b>{formatCurrency(amount)}</b>
        </div>
        <ItemActions>
          {occurrence ? (
            <span className="finance-status" data-status={occurrence.status}>
              {occurrence.status === "SETTLED" ? "Pago" : "Pendente"}
            </span>
          ) : null}
          {occurrence?.status === "PENDING" ? (
            <details className="inline-payment-details">
              <summary>Pagar</summary>
              <form action={payFixedExpenseAction} className="inline-payment-form">
                <ReturnFields month={month} returnTo={returnTo} />
                <input name="fixedExpenseId" type="hidden" value={expense.id} />
                <input name="dueDate" type="hidden" value={toDateInputValue(occurrence.dueDate)} />
                <MoneyInput defaultValue={moneyInputValue(amount)} label="Pagamento" name="amount" />
                <TextInput defaultValue={toDateInputValue(occurrence.dueDate)} label="Data" name="paidAt" type="date" />
                <AccountSelect accounts={options.accounts} defaultValue={occurrence.accountId} label="Conta" name="accountId" optional={false} />
                <button className="finance-secondary" type="submit">Pagar</button>
              </form>
            </details>
          ) : null}
          <EditDetails>
            <form action={updateFixedExpenseAction} className="finance-edit-form">
              <ReturnFields month={month} returnTo={returnTo} />
              <input name="fixedExpenseId" type="hidden" value={expense.id} />
              <PersonSelect defaultValue={expense.personEditorId} people={options.people} />
              <TextInput defaultValue={expense.description} label="Descrição" name="description" />
              <MoneyInput defaultValue={moneyInputValue(expense.amount)} label="Valor" />
              <TextInput defaultValue={monthInputValue(expense.startMonth)} label="Mês inicial" name="startMonth" type="month" />
              <TextInput defaultValue={expense.dueDay} label="Dia de vencimento" name="dueDay" type="number" />
              <CategorySelect categories={options.categories} defaultValue={expense.categoryId} kind="EXPENSE" />
              <AccountSelect accounts={options.accounts} defaultValue={expense.accountId} />
              <label className="finance-field">
                <span>Status padrão</span>
                <select defaultValue={expense.status} name="status">
                  <option value="PENDING">Pendente</option>
                  <option value="SETTLED">Realizado</option>
                </select>
              </label>
              <NotesField defaultValue={expense.notes} />
              <button className="finance-secondary" type="submit">Salvar</button>
            </form>
          </EditDetails>
          <DeleteForm action={deleteFixedExpenseAction} idName="fixedExpenseId" idValue={expense.id} month={month} returnTo={returnTo} />
        </ItemActions>
      </li>
    );
  };
  const renderFixedList = (expenses: Overview["fixedExpenses"]) =>
    expenses.length === 0 ? (
      <p className="empty-state">Nenhum gasto fixo cadastrado.</p>
    ) : (
      <ul className="finance-list detached-list">
        {expenses.map(renderFixedExpense)}
      </ul>
    );

  return (
    <>
      <WorkspacePage formTitle="Nova dívida parcelada" listTitle="Dívidas cadastradas" month={month} subtitle="Parceladas, fixas e cartão no mesmo lugar" title="Dívidas">
        <form action={createDebtAction} className="finance-form">
          <ReturnFields month={month} returnTo={returnTo} />
          <PersonSelect people={options.people} />
          <TextInput label="Descrição" name="description" />
          <MoneyInput label="Valor total" name="totalAmount" />
          <TextInput label="Data da compra" name="startDate" type="date" />
          <TextInput label="Primeiro vencimento" name="firstDueDate" type="date" />
          <TextInput label="Número de parcelas" name="installmentCount" type="number" />
          <label className="finance-field">
            <span>Frequência</span>
            <select name="frequency">
              <option value="MONTHLY">Mensal</option>
              <option value="FORTNIGHTLY">Quinzenal</option>
            </select>
          </label>
          <CategorySelect categories={options.categories} kind="EXPENSE" />
          <SplitModeSelect />
          <NotesField />
          <button className="finance-primary" type="submit">Criar dívida</button>
        </form>
      </WorkspacePage>
      <section className="credit-card-workspace">
        <details className="compact-card card-admin-panel">
          <summary>
            <span>Novo gasto fixo</span>
            <strong>Cadastrar</strong>
          </summary>
          <div className="finance-create-body">
            <form action={createFixedExpenseAction} className="finance-form">
              <ReturnFields month={month} returnTo={returnTo} />
              <PersonSelect people={options.people} />
              <TextInput label="Descrição" name="description" />
              <MoneyInput label="Valor" />
              <TextInput label="Mês inicial" name="startMonth" type="month" />
              <TextInput label="Dia de vencimento" name="dueDay" type="number" />
              <CategorySelect categories={options.categories} kind="EXPENSE" />
              <AccountSelect accounts={options.accounts} />
              <label className="finance-field">
                <span>Status padrão</span>
                <select name="status">
                  <option value="PENDING">Pendente</option>
                  <option value="SETTLED">Realizado</option>
                </select>
              </label>
              <NotesField />
              <button className="finance-secondary" type="submit">Criar gasto fixo</button>
            </form>
          </div>
        </details>

        <details className="compact-card card-admin-panel card-purchase-panel">
          <summary>
            <span>Nova compra no cartão</span>
            <strong>Cadastrar</strong>
          </summary>
          <div className="finance-create-body">
            <form action={createCreditCardPurchaseAction} className="finance-form card-purchase-form">
              <ReturnFields month={month} returnTo={returnTo} />
              <label className="finance-field">
                <span>Cartão</span>
                <select name="cardId" required>
                  {options.cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.personEditor.displayName} · {card.name}
                    </option>
                  ))}
                </select>
              </label>
              <CardResponsibilitySelect people={options.people} />
              <TextInput label="Descrição" name="description" />
              <MoneyInput label="Valor total" name="totalAmount" />
              <TextInput label="Parcelas" name="installmentCount" type="number" />
              <TextInput label="Data da compra" name="purchaseDate" type="date" />
              <TextInput label="Primeira parcela (opcional)" name="firstDueDate" required={false} type="date" />
              <CategorySelect categories={options.categories} kind="EXPENSE" />
              <CardShareFields people={options.people} />
              <NotesField />
              <button className="finance-secondary" type="submit">Registrar compra</button>
            </form>
          </div>
        </details>

        <details className="compact-card card-admin-panel">
          <summary>
            <span>Novo cartão</span>
            <strong>Adicionar</strong>
          </summary>
          <div className="finance-create-body">
            <form action={createCreditCardAction} className="finance-form">
              <ReturnFields month={month} returnTo={returnTo} />
              <PersonSelect people={options.people} />
              <TextInput label="Nome" name="name" />
              <TextInput label="Instituição" name="institution" required={false} />
              <MoneyInput label="Limite" name="limit" />
              <TextInput label="Fechamento" name="closingDay" type="number" />
              <TextInput label="Vencimento" name="dueDay" type="number" />
              <AccountSelect accounts={options.accounts} label="Conta de pagamento" name="paymentAccountId" />
              <TextInput defaultValue="#357a68" label="Cor" name="color" required={false} type="color" />
              <button className="finance-secondary" type="submit">Criar cartão</button>
            </form>
          </div>
        </details>
      </section>
      <PersonTabs month={month} overview={overview} />
      <section className="card-month-summary" aria-label="Resumo mensal de dívidas">
        {visibleMonthlyDebtSummaryCards.map((summary) => (
          <article className="card-month-card" data-active={overview.activeView === summary.id ? "true" : undefined} key={summary.id}>
            <span>{summary.name}</span>
            <strong>{formatCurrency(summary.total)}</strong>
            <small>Total no mês selecionado</small>
            <dl>
              <div>
                <dt>Parceladas</dt>
                <dd>{formatCurrency(summary.installments)}</dd>
              </div>
              <div>
                <dt>Fixas</dt>
                <dd>{formatCurrency(summary.fixed)}</dd>
              </div>
              <div>
                <dt>Pendente</dt>
                <dd>{formatCurrency(summary.pending)}</dd>
              </div>
              <div>
                <dt>Pago</dt>
                <dd>{formatCurrency(summary.paid)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      <section className="compact-card">
        <h2>Dívidas parceladas</h2>
        {monthlyDebtRows.length === 0 ? (
          <p className="empty-state">Nenhuma parcela de dívida neste mês.</p>
        ) : (
          <ul className="finance-list detached-list debt-list">
            {monthlyDebtRows.map(({ currentInstallments, debt }) => {
              const paidCount = debt.installments.filter((installment) => installment.status === "PAID").length;
              const debtSplitMode = splitModeDefault(debt.installments);
              const currentTotal = sumMoney(currentInstallments.map((installment) => installment.amount));
              const currentRootInstallments = Array.from(new Map(currentInstallments.map((installment) => [installment.rootInstallmentId, installment])).values());
              const currentStatus = currentInstallments.some((installment) => installment.status === "PENDING")
                ? "PENDING"
                : currentInstallments.some((installment) => installment.status === "PAID")
                  ? "SETTLED"
                  : "CANCELED";
              const currentDescription = currentRootInstallments
                .map((installment) => `parcela ${installment.number} - vence ${formatDate(installment.dueDate)}`)
                .join(" - ");
              const hasSharedCurrentInstallments = new Set(currentInstallments.map((installment) => installment.personEditorId)).size > 1;
              const currentShares = hasSharedCurrentInstallments
                ? currentInstallments.map((installment) => `${installment.personEditor.displayName}: ${formatCurrency(installment.amount)}`).join(" - ")
                : null;

              return (
                <li key={debt.id}>
                  <details className="debt-details">
                    <summary>
                      <div className="finance-item-main">
                        <span>
                          <strong>{debt.description}</strong>
                          <small>{debt.personEditor.displayName} - {currentDescription}</small>
                          <small>{paidCount}/{debt.installmentCount} parcelas pagas</small>
                          {currentShares ? <small>{currentShares}</small> : null}
                        </span>
                        <span className="purchase-amount-stack">
                          <b>{formatCurrency(currentTotal)}</b>
                          <small>Total {formatCurrency(debt.totalAmount)}</small>
                        </span>
                      </div>
                    </summary>
                    <div className="debt-detail-body">
                      <dl className="debt-metadata">
                        <div>
                          <dt>Status do mês</dt>
                          <dd>
                            <span className="finance-status" data-status={currentStatus}>
                              {currentStatus === "SETTLED" ? "Pago" : currentStatus === "CANCELED" ? "Cancelado" : "Pendente"}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt>Compra</dt>
                          <dd>{formatDate(debt.startDate)}</dd>
                        </div>
                        <div>
                          <dt>Vencimento inicial</dt>
                          <dd>{formatDate(debt.firstDueDate)}</dd>
                        </div>
                        <div>
                          <dt>Frequencia</dt>
                          <dd>{debt.frequency === "FORTNIGHTLY" ? "Quinzenal" : "Mensal"}</dd>
                        </div>
                        <div>
                          <dt>Categoria</dt>
                          <dd>{debt.category?.name ?? "Sem categoria"}</dd>
                        </div>
                      </dl>
                      <ul className="installment-list">
                        {debt.installments.map((installment) => {
                          const visibleShares = installment.shares.filter((share) => visiblePersonIds.has(share.personEditorId));

                          return (
                            <li key={installment.id}>
                              <span>
                                <strong>Parcela {installment.number}</strong>
                                <small>Vence {formatDate(installment.dueDate)}</small>
                                {visibleShares.length > 0 ? (
                                  <small>{visibleShares.map((share) => `${share.personEditor.displayName}: ${formatCurrency(share.amount)}`).join(" - ")}</small>
                                ) : null}
                              </span>
                              <b>{formatCurrency(installment.amount)}</b>
                              <span className="finance-status" data-status={installment.status === "PAID" ? "SETTLED" : installment.status === "CANCELED" ? "CANCELED" : "PENDING"}>
                                {installment.status === "PAID" ? "Pago" : installment.status === "CANCELED" ? "Cancelado" : "Pendente"}
                              </span>
                              {installment.status === "PENDING" ? (
                                <details className="inline-payment-details">
                                  <summary>Pagar</summary>
                                  <form action={payDebtInstallmentAction} className="inline-payment-form">
                                    <ReturnFields month={month} returnTo="/dividas" />
                                    <input name="installmentId" type="hidden" value={installment.id} />
                                    <MoneyInput defaultValue={moneyInputValue(installment.amount)} label="Pagamento" name="amount" />
                                    <TextInput defaultValue={toDateInputValue(installment.dueDate)} label="Data" name="paidAt" type="date" />
                                    <AccountSelect accounts={options.accounts} label="Conta" name="accountId" optional={false} />
                                    <NotesField />
                                    <button className="finance-secondary" type="submit">Pagar parcela</button>
                                  </form>
                                </details>
                              ) : null}
                              {installment.status === "PAID" && installment.transaction ? (
                                <DeleteForm action={deleteDebtInstallmentPaymentAction} idName="installmentId" idValue={installment.id} month={month} returnTo="/dividas" />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      <ItemActions>
                        <EditDetails>
                          <form action={updateDebtAction} className="finance-edit-form">
                            <ReturnFields month={month} returnTo="/dividas" />
                            <input name="debtId" type="hidden" value={debt.id} />
                            <PersonSelect defaultValue={debt.personEditorId} people={options.people} />
                            <TextInput defaultValue={debt.description} label="Descricao" name="description" />
                            <MoneyInput defaultValue={moneyInputValue(debt.totalAmount)} label="Valor total" name="totalAmount" />
                            <TextInput defaultValue={toDateInputValue(debt.startDate)} label="Data da compra" name="startDate" type="date" />
                            <TextInput defaultValue={toDateInputValue(debt.firstDueDate)} label="Primeiro vencimento" name="firstDueDate" type="date" />
                            <TextInput defaultValue={debt.installmentCount} label="Numero de parcelas" name="installmentCount" type="number" />
                            <label className="finance-field">
                              <span>Frequencia</span>
                              <select defaultValue={debt.frequency} name="frequency">
                                <option value="MONTHLY">Mensal</option>
                                <option value="FORTNIGHTLY">Quinzenal</option>
                              </select>
                            </label>
                            <CategorySelect categories={options.categories} defaultValue={debt.categoryId} kind="EXPENSE" />
                            <SplitModeSelect defaultValue={debtSplitMode} />
                            <NotesField defaultValue={debt.notes} />
                            <button className="finance-secondary" type="submit">Salvar</button>
                          </form>
                        </EditDetails>
                        <DeleteForm action={deleteDebtAction} idName="debtId" idValue={debt.id} month={month} returnTo={returnTo} />
                      </ItemActions>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="compact-card">
        <h2>Dívidas fixas</h2>
        {overview.activeView === "casal" ? (
          <div className="person-group-stack recurring-group-stack">
            {fixedGroups.length === 0 ? <p className="empty-state">Nenhum gasto fixo cadastrado.</p> : null}
            {fixedGroups.map(({ expenses, person }) => (
              <section className="person-group" key={person.id}>
                <h2>{person.name}</h2>
                {renderFixedList(expenses)}
              </section>
            ))}
          </div>
        ) : (
          renderFixedList(overview.fixedExpenses)
        )}
      </section>
      <section className="purchase-section">
        <h2>Cartões cadastrados</h2>
        <ul className="card-grid credit-card-list">
          {overview.cards.map((card) => (
            <li key={card.id}>
              <span>{card.personEditor.displayName}</span>
              <strong>{card.name}</strong>
              <small>Fatura {formatCurrency(card.invoiceAmount)} · disponível {formatCurrency(card.limitAvailable)}</small>
              <progress max={Number(card.limit)} value={Number(card.committed)} />
              <ItemActions>
                <EditDetails>
                  <form action={updateCreditCardAction} className="finance-edit-form">
                    <ReturnFields month={month} returnTo={returnTo} />
                    <input name="cardId" type="hidden" value={card.id} />
                    <PersonSelect defaultValue={card.personEditorId} people={options.people} />
                    <TextInput defaultValue={card.name} label="Nome" name="name" />
                    <TextInput defaultValue={card.institution} label="Instituição" name="institution" required={false} />
                    <MoneyInput defaultValue={moneyInputValue(card.limit)} label="Limite" name="limit" />
                    <TextInput defaultValue={card.closingDay} label="Fechamento" name="closingDay" type="number" />
                    <TextInput defaultValue={card.dueDay} label="Vencimento" name="dueDay" type="number" />
                    <AccountSelect accounts={options.accounts} defaultValue={card.paymentAccountId} label="Conta de pagamento" name="paymentAccountId" />
                    <TextInput defaultValue={card.color} label="Cor" name="color" required={false} type="color" />
                    <button className="finance-secondary" type="submit">Salvar</button>
                  </form>
                </EditDetails>
                <DeleteForm action={deleteCreditCardAction} idName="cardId" idValue={card.id} month={month} returnTo={returnTo} />
              </ItemActions>
            </li>
          ))}
        </ul>
      </section>
      <section className="purchase-section">
        <h2>Compras parceladas no cartão</h2>
        {purchaseGroups.length === 0 ? (
          <p className="empty-state">Nenhuma compra de cartão neste mês.</p>
        ) : (
          <div className="card-purchase-groups">
            {purchaseGroups.map((group) => {
              const groupMonthTotal = sumMoney(group.purchases.map((purchase) => {
                const monthShares = cardPurchaseMonthShares(purchase, month);
                const visibleMonthShares = monthShares.filter((share) => visiblePersonIds.has(share.id));

                return monthShares.length > 0 ? sumMoney(visibleMonthShares.map((share) => share.amount)) : cardPurchaseMonthTotal(purchase, month);
              }));

              return (
                <section className="card-purchase-group" key={group.id}>
                  <header>
                    <h3>{group.name}</h3>
                    <strong>{formatCurrency(groupMonthTotal)}</strong>
                  </header>
                  <ul className="finance-list detached-list purchase-list">
                    {group.purchases.map((purchase) => {
                      const monthShares = cardPurchaseMonthShares(purchase, month);
                      const visibleMonthShares = monthShares.filter((share) => visiblePersonIds.has(share.id));
                      const monthTotal = monthShares.length > 0 ? sumMoney(visibleMonthShares.map((share) => share.amount)) : cardPurchaseMonthTotal(purchase, month);
                      const purchaseInstallments = cardPurchaseMonthInstallments(purchase, month);
                      const responsibilityLabel = cardPurchaseUsesCouple(purchase) ? "Casal" : purchase.personEditor.displayName;
                      const shareDefaults = cardPurchaseShareDefaultValues(purchase);

                      return (
                        <li key={purchase.id}>
                          <details className="purchase-details">
                            <summary>
                              <div className="finance-item-main">
                                <span className="purchase-summary-copy">
                                  <strong>{purchase.description}</strong>
                                  <small>{purchase.card.name} - {purchase.installmentCount}x</small>
                                  <small>Compra {formatDate(purchase.purchaseDate)} - primeira parcela {formatDate(purchase.firstDueDate)}</small>
                                  {visibleMonthShares.length > 0 ? (
                                    <small className="purchase-share-line">{visibleMonthShares.map((share) => `${share.name}: ${formatCurrency(share.amount)}`).join(" - ")}</small>
                                  ) : (
                                    <small>{responsibilityLabel}</small>
                                  )}
                                </span>
                                <span className="purchase-amount-stack">
                                  <b>{formatCurrency(monthTotal)}</b>
                                  <small>Total {formatCurrency(purchase.totalAmount)}</small>
                                </span>
                              </div>
                            </summary>
                            <div className="purchase-detail-body">
                              <dl className="debt-metadata">
                                <div>
                                  <dt>Cartão</dt>
                                  <dd>{purchase.card.name}</dd>
                                </div>
                                <div>
                                  <dt>Responsável</dt>
                                  <dd>{responsibilityLabel}</dd>
                                </div>
                                <div>
                                  <dt>Categoria</dt>
                                  <dd>{purchase.category?.name ?? "Sem categoria"}</dd>
                                </div>
                                <div>
                                  <dt>Parcela do mês</dt>
                                  <dd>{purchaseInstallments.map((installment) => `${installment.number}/${purchase.installmentCount}`).join(", ") || "-"}</dd>
                                </div>
                              </dl>
                              <ul className="installment-list">
                                {purchase.installments.map((installment) => {
                                  const installmentDueDate = cardPurchaseInstallmentDueDate(purchase, installment);
                                  const linkedPayment = installment.invoicePayment;
                                  const paymentAccounts = options.accounts.filter((account) => account.personEditorId === purchase.card.personEditorId);
                                  const cardPaymentAccounts = paymentAccounts.length > 0 ? paymentAccounts : options.accounts;
                                  const defaultPaymentAccountId = linkedPayment?.accountId ?? purchase.card.paymentAccountId;

                                  return (
                                    <li key={installment.id}>
                                      <span>
                                        <strong>Parcela {installment.number}</strong>
                                        <small>Vence {formatDate(installmentDueDate)}</small>
                                        {installment.shares.length > 0 ? (
                                          <small>{installment.shares.filter((share) => visiblePersonIds.has(share.personEditorId)).map((share) => `${share.personEditor.displayName}: ${formatCurrency(share.amount)}`).join(" - ")}</small>
                                        ) : null}
                                      </span>
                                      <b>{formatCurrency(installment.amount)}</b>
                                      <span className="finance-status" data-status={installment.status === "PAID" ? "SETTLED" : installment.status === "CANCELED" ? "CANCELED" : "PENDING"}>
                                        {installment.status === "PAID" ? "Paga" : installment.status === "CANCELED" ? "Cancelada" : "Aberta"}
                                      </span>
                                      {installment.status === "OPEN" ? (
                                        <details className="inline-payment-details">
                                          <summary>Adiantar</summary>
                                          <form action={payCreditCardInstallmentAction} className="inline-payment-form">
                                            <ReturnFields month={month} returnTo={returnTo} />
                                            <input name="installmentId" type="hidden" value={installment.id} />
                                            <TextInput defaultValue={toDateInputValue(installmentDueDate)} label="Data" name="paidAt" type="date" />
                                            <AccountSelect accounts={cardPaymentAccounts} defaultValue={defaultPaymentAccountId} label="Conta" name="accountId" optional={false} />
                                            <NotesField />
                                            <button className="finance-secondary" type="submit">Adiantar parcela</button>
                                          </form>
                                        </details>
                                      ) : null}
                                      {installment.status === "PAID" ? (
                                        <ItemActions>
                                          <EditDetails>
                                            {linkedPayment ? (
                                              <form action={updateCreditCardInvoicePaymentAction} className="finance-edit-form">
                                                <ReturnFields month={month} returnTo={returnTo} />
                                                <input name="paymentId" type="hidden" value={linkedPayment.id} />
                                                <input name="amount" type="hidden" value={moneyInputValue(linkedPayment.amount)} />
                                                <TextInput defaultValue={toDateInputValue(linkedPayment.paidAt)} label="Data" name="paidAt" type="date" />
                                                <AccountSelect accounts={cardPaymentAccounts} defaultValue={defaultPaymentAccountId} label="Conta" name="accountId" optional={false} />
                                                <NotesField defaultValue={linkedPayment.notes} />
                                                <button className="finance-secondary" type="submit">Salvar pagamento</button>
                                              </form>
                                            ) : (
                                              <form action={payCreditCardInstallmentAction} className="finance-edit-form">
                                                <ReturnFields month={month} returnTo={returnTo} />
                                                <input name="installmentId" type="hidden" value={installment.id} />
                                                <TextInput defaultValue={toDateInputValue(installmentDueDate)} label="Data" name="paidAt" type="date" />
                                                <AccountSelect accounts={cardPaymentAccounts} defaultValue={defaultPaymentAccountId} label="Conta" name="accountId" optional={false} />
                                                <NotesField />
                                                <button className="finance-secondary" type="submit">Salvar pagamento</button>
                                              </form>
                                            )}
                                          </EditDetails>
                                          {linkedPayment ? (
                                            <DeleteForm action={deleteCreditCardInstallmentPaymentAction} idName="installmentId" idValue={installment.id} month={month} returnTo={returnTo} />
                                          ) : null}
                                        </ItemActions>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                              <ItemActions>
                                <EditDetails>
                                  <form action={updateCreditCardPurchaseAction} className="finance-edit-form">
                                    <ReturnFields month={month} returnTo={returnTo} />
                                    <input name="purchaseId" type="hidden" value={purchase.id} />
                                    <label className="finance-field">
                                      <span>Cartão</span>
                                      <select defaultValue={purchase.cardId} name="cardId" required>
                                        {options.cards.map((card) => (
                                          <option key={card.id} value={card.id}>
                                            {card.personEditor.displayName} - {card.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <CardResponsibilitySelect defaultValue={cardPurchaseUsesCouple(purchase) ? "COUPLE" : purchase.personEditorId} people={options.people} />
                                    <TextInput defaultValue={purchase.description} label="Descrição" name="description" />
                                    <MoneyInput defaultValue={moneyInputValue(purchase.totalAmount)} label="Valor total" name="totalAmount" />
                                    <TextInput defaultValue={purchase.installmentCount} label="Parcelas" name="installmentCount" type="number" />
                                    <TextInput defaultValue={toDateInputValue(purchase.purchaseDate)} label="Data da compra" name="purchaseDate" type="date" />
                                    <TextInput defaultValue={toDateInputValue(purchase.firstDueDate)} label="Primeira parcela (opcional)" name="firstDueDate" required={false} type="date" />
                                    <CategorySelect categories={options.categories} defaultValue={purchase.categoryId} kind="EXPENSE" />
                                    <CardShareFields defaultValues={shareDefaults} people={options.people} />
                                    <NotesField defaultValue={purchase.notes} />
                                    <button className="finance-secondary" type="submit">Salvar</button>
                                  </form>
                                </EditDetails>
                                <DeleteForm action={deleteCreditCardPurchaseAction} idName="purchaseId" idValue={purchase.id} month={month} returnTo={returnTo} />
                              </ItemActions>
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export function CardsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  const cardSummaryCards = [overview.cardCoupleTotal, ...overview.cardTotalsByPerson];
  const sharedPurchases = overview.cardPurchases.filter(cardPurchaseUsesCouple);
  const purchaseGroups = [
    { id: "casal", name: "Casal", purchases: sharedPurchases },
    ...overview.people.map((person) => ({
      id: person.id,
      name: person.name,
      purchases: overview.cardPurchases.filter((purchase) => !cardPurchaseUsesCouple(purchase) && purchase.personEditorId === person.id),
    })),
  ].filter((group) => group.purchases.length > 0);

  return (
    <>
      <PageHeader month={month} subtitle="Compras parceladas, faturas e responsáveis" title="Cartões de crédito" />
      <PersonTabs month={month} overview={overview} />

      <section className="card-month-summary" aria-label="Gastos de cartão no mês">
        {cardSummaryCards.map((summary) => (
          <article className="card-month-card" data-active={overview.activeView === summary.id ? "true" : undefined} key={summary.id}>
            <span>{summary.name}</span>
            <strong>{formatCurrency(summary.total)}</strong>
            <small>No mês selecionado</small>
            <dl>
              <div>
                <dt>Aberto</dt>
                <dd>{formatCurrency(summary.pending)}</dd>
              </div>
              <div>
                <dt>Pago</dt>
                <dd>{formatCurrency(summary.paid)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>

      <section className="credit-card-workspace">
        <details className="compact-card card-admin-panel card-purchase-panel">
          <summary>
            <span>Nova compra parcelada</span>
            <strong>Cadastrar</strong>
          </summary>
          <div className="finance-create-body">
          <form action={createCreditCardPurchaseAction} className="finance-form card-purchase-form">
            <ReturnFields month={month} returnTo="/cartoes" />
            <label className="finance-field">
              <span>Cartão</span>
              <select name="cardId" required>
                {options.cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.personEditor.displayName} · {card.name}
                  </option>
                ))}
              </select>
            </label>
            <CardResponsibilitySelect people={options.people} />
            <TextInput label="Descrição" name="description" />
            <MoneyInput label="Valor total" name="totalAmount" />
            <TextInput label="Parcelas" name="installmentCount" type="number" />
            <TextInput label="Data da compra" name="purchaseDate" type="date" />
              <TextInput label="Primeira parcela (opcional)" name="firstDueDate" required={false} type="date" />
            <CategorySelect categories={options.categories} kind="EXPENSE" />
            <CardShareFields people={options.people} />
            <NotesField />
            <button className="finance-primary" type="submit">Registrar compra</button>
          </form>
          </div>
        </details>

        <details className="compact-card card-admin-panel">
          <summary>
            <span>Novo cartão</span>
            <strong>Adicionar</strong>
          </summary>
          <div className="finance-create-body">
            <form action={createCreditCardAction} className="finance-form">
              <ReturnFields month={month} returnTo="/cartoes" />
              <PersonSelect people={options.people} />
              <TextInput label="Nome" name="name" />
              <TextInput label="Instituição" name="institution" required={false} />
              <MoneyInput label="Limite" name="limit" />
              <TextInput label="Fechamento" name="closingDay" type="number" />
              <TextInput label="Vencimento" name="dueDay" type="number" />
              <AccountSelect accounts={options.accounts} label="Conta de pagamento" name="paymentAccountId" />
              <TextInput defaultValue="#357a68" label="Cor" name="color" required={false} type="color" />
              <button className="finance-secondary" type="submit">Criar cartão</button>
            </form>
          </div>
        </details>
      </section>

      <section className="purchase-section">
        <h2>Cartões e faturas</h2>
        <ul className="card-grid credit-card-list">
          {overview.cards.map((card) => (
            <li key={card.id}>
              <span>{card.personEditor.displayName}</span>
              <strong>{card.name}</strong>
              <small>Fatura {formatCurrency(card.invoiceAmount)} · disponível {formatCurrency(card.limitAvailable)}</small>
              <progress max={Number(card.limit)} value={Number(card.committed)} />
              <ItemActions>
                <EditDetails>
                  <form action={updateCreditCardAction} className="finance-edit-form">
                    <ReturnFields month={month} returnTo="/cartoes" />
                    <input name="cardId" type="hidden" value={card.id} />
                    <PersonSelect defaultValue={card.personEditorId} people={options.people} />
                    <TextInput defaultValue={card.name} label="Nome" name="name" />
                    <TextInput defaultValue={card.institution} label="Instituicao" name="institution" required={false} />
                    <MoneyInput defaultValue={moneyInputValue(card.limit)} label="Limite" name="limit" />
                    <TextInput defaultValue={card.closingDay} label="Fechamento" name="closingDay" type="number" />
                    <TextInput defaultValue={card.dueDay} label="Vencimento" name="dueDay" type="number" />
                    <AccountSelect accounts={options.accounts} defaultValue={card.paymentAccountId} label="Conta de pagamento" name="paymentAccountId" />
                    <TextInput defaultValue={card.color} label="Cor" name="color" required={false} type="color" />
                    <button className="finance-secondary" type="submit">Salvar</button>
                  </form>
                </EditDetails>
                <DeleteForm action={deleteCreditCardAction} idName="cardId" idValue={card.id} month={month} returnTo="/cartoes" />
              </ItemActions>
            </li>
          ))}
        </ul>
      </section>

      <section className="purchase-section">
        <h2>Compras parceladas</h2>
        {purchaseGroups.length === 0 ? (
          <p className="empty-state">Nenhuma compra de cartão neste mês.</p>
        ) : (
          <div className="card-purchase-groups">
            {purchaseGroups.map((group) => {
              const groupMonthTotal = sumMoney(group.purchases.map((purchase) => cardPurchaseMonthTotal(purchase, month)));

              return (
                <section className="card-purchase-group" key={group.id}>
                  <header>
                    <h3>{group.name}</h3>
                    <strong>{formatCurrency(groupMonthTotal)}</strong>
                  </header>
                  <ul className="finance-list detached-list purchase-list">
                    {group.purchases.map((purchase) => {
                      const monthTotal = cardPurchaseMonthTotal(purchase, month);
                      const monthShares = cardPurchaseMonthShares(purchase, month);
                      const purchaseInstallments = cardPurchaseMonthInstallments(purchase, month);
                      const responsibilityLabel = cardPurchaseUsesCouple(purchase) ? "Casal" : purchase.personEditor.displayName;
                      const shareDefaults = cardPurchaseShareDefaultValues(purchase);

                      return (
                        <li key={purchase.id}>
                          <details className="purchase-details">
                            <summary>
                              <div className="finance-item-main">
                                <span className="purchase-summary-copy">
                                  <strong>{purchase.description}</strong>
                                  <small>{purchase.card.name} - {purchase.installmentCount}x</small>
                                  <small>Compra {formatDate(purchase.purchaseDate)} - primeira parcela {formatDate(purchase.firstDueDate)}</small>
                                  {monthShares.length > 0 ? (
                                    <small className="purchase-share-line">{monthShares.map((share) => `${share.name}: ${formatCurrency(share.amount)}`).join(" - ")}</small>
                                  ) : (
                                    <small>{responsibilityLabel}</small>
                                  )}
                                </span>
                                <span className="purchase-amount-stack">
                                  <b>{formatCurrency(monthTotal)}</b>
                                  <small>Total {formatCurrency(purchase.totalAmount)}</small>
                                </span>
                              </div>
                            </summary>
                            <div className="purchase-detail-body">
                              <dl className="debt-metadata">
                                <div>
                                  <dt>Cartão</dt>
                                  <dd>{purchase.card.name}</dd>
                                </div>
                                <div>
                                  <dt>Responsável</dt>
                                  <dd>{responsibilityLabel}</dd>
                                </div>
                                <div>
                                  <dt>Categoria</dt>
                                  <dd>{purchase.category?.name ?? "Sem categoria"}</dd>
                                </div>
                                <div>
                                  <dt>Parcela do mês</dt>
                                  <dd>{purchaseInstallments.map((installment) => `${installment.number}/${purchase.installmentCount}`).join(", ") || "-"}</dd>
                                </div>
                              </dl>
                              <ul className="installment-list">
                                {purchase.installments.map((installment) => {
                                  const installmentDueDate = cardPurchaseInstallmentDueDate(purchase, installment);
                                  const linkedPayment = installment.invoicePayment;
                                  const paymentAccounts = options.accounts.filter((account) => account.personEditorId === purchase.card.personEditorId);
                                  const cardPaymentAccounts = paymentAccounts.length > 0 ? paymentAccounts : options.accounts;
                                  const defaultPaymentAccountId = linkedPayment?.accountId ?? purchase.card.paymentAccountId;

                                  return (
                                    <li key={installment.id}>
                                      <span>
                                        <strong>Parcela {installment.number}</strong>
                                        <small>Vence {formatDate(installmentDueDate)}</small>
                                        {installment.shares.length > 0 ? (
                                          <small>{installment.shares.map((share) => `${share.personEditor.displayName}: ${formatCurrency(share.amount)}`).join(" - ")}</small>
                                        ) : null}
                                      </span>
                                      <b>{formatCurrency(installment.amount)}</b>
                                      <span className="finance-status" data-status={installment.status === "PAID" ? "SETTLED" : installment.status === "CANCELED" ? "CANCELED" : "PENDING"}>
                                        {installment.status === "PAID" ? "Paga" : installment.status === "CANCELED" ? "Cancelada" : "Aberta"}
                                      </span>
                                      {installment.status === "OPEN" ? (
                                        <details className="inline-payment-details">
                                          <summary>Adiantar</summary>
                                          <form action={payCreditCardInstallmentAction} className="inline-payment-form">
                                            <ReturnFields month={month} returnTo="/cartoes" />
                                            <input name="installmentId" type="hidden" value={installment.id} />
                                            <TextInput defaultValue={toDateInputValue(installmentDueDate)} label="Data" name="paidAt" type="date" />
                                            <AccountSelect accounts={cardPaymentAccounts} defaultValue={defaultPaymentAccountId} label="Conta" name="accountId" optional={false} />
                                            <NotesField />
                                            <button className="finance-secondary" type="submit">Adiantar parcela</button>
                                          </form>
                                        </details>
                                      ) : null}
                                      {installment.status === "PAID" ? (
                                        <ItemActions>
                                          <EditDetails>
                                            {linkedPayment ? (
                                              <form action={updateCreditCardInvoicePaymentAction} className="finance-edit-form">
                                                <ReturnFields month={month} returnTo="/cartoes" />
                                                <input name="paymentId" type="hidden" value={linkedPayment.id} />
                                                <input name="amount" type="hidden" value={moneyInputValue(linkedPayment.amount)} />
                                                <TextInput defaultValue={toDateInputValue(linkedPayment.paidAt)} label="Data" name="paidAt" type="date" />
                                                <AccountSelect accounts={cardPaymentAccounts} defaultValue={defaultPaymentAccountId} label="Conta" name="accountId" optional={false} />
                                                <NotesField defaultValue={linkedPayment.notes} />
                                                <button className="finance-secondary" type="submit">Salvar pagamento</button>
                                              </form>
                                            ) : (
                                              <form action={payCreditCardInstallmentAction} className="finance-edit-form">
                                                <ReturnFields month={month} returnTo="/cartoes" />
                                                <input name="installmentId" type="hidden" value={installment.id} />
                                                <TextInput defaultValue={toDateInputValue(installmentDueDate)} label="Data" name="paidAt" type="date" />
                                                <AccountSelect accounts={cardPaymentAccounts} defaultValue={defaultPaymentAccountId} label="Conta" name="accountId" optional={false} />
                                                <NotesField />
                                                <button className="finance-secondary" type="submit">Salvar pagamento</button>
                                              </form>
                                            )}
                                          </EditDetails>
                                          {linkedPayment ? (
                                            <DeleteForm action={deleteCreditCardInstallmentPaymentAction} idName="installmentId" idValue={installment.id} month={month} returnTo="/cartoes" />
                                          ) : null}
                                        </ItemActions>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                              <ItemActions>
                                <EditDetails>
                                  <form action={updateCreditCardPurchaseAction} className="finance-edit-form">
                                    <ReturnFields month={month} returnTo="/cartoes" />
                                    <input name="purchaseId" type="hidden" value={purchase.id} />
                                    <label className="finance-field">
                                      <span>Cartão</span>
                                      <select defaultValue={purchase.cardId} name="cardId" required>
                                        {options.cards.map((card) => (
                                          <option key={card.id} value={card.id}>
                                            {card.personEditor.displayName} - {card.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <CardResponsibilitySelect defaultValue={cardPurchaseUsesCouple(purchase) ? "COUPLE" : purchase.personEditorId} people={options.people} />
                                    <TextInput defaultValue={purchase.description} label="Descricao" name="description" />
                                    <MoneyInput defaultValue={moneyInputValue(purchase.totalAmount)} label="Valor total" name="totalAmount" />
                                    <TextInput defaultValue={purchase.installmentCount} label="Parcelas" name="installmentCount" type="number" />
                                    <TextInput defaultValue={toDateInputValue(purchase.purchaseDate)} label="Data da compra" name="purchaseDate" type="date" />
                                    <TextInput defaultValue={toDateInputValue(purchase.firstDueDate)} label="Primeira parcela (opcional)" name="firstDueDate" required={false} type="date" />
                                    <CategorySelect categories={options.categories} defaultValue={purchase.categoryId} kind="EXPENSE" />
                                    <CardShareFields defaultValues={shareDefaults} people={options.people} />
                                    <NotesField defaultValue={purchase.notes} />
                                    <button className="finance-secondary" type="submit">Salvar</button>
                                  </form>
                                </EditDetails>
                                <DeleteForm action={deleteCreditCardPurchaseAction} idName="purchaseId" idValue={purchase.id} month={month} returnTo="/cartoes" />
                              </ItemActions>
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

export function GoalsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Novo cofrinho" listTitle="Metas" month={month} subtitle="Reservas sem duplicar patrimônio" title="Cofrinhos">
        <form action={createSavingsGoalAction} className="finance-form">
          <ReturnFields month={month} returnTo="/cofrinhos" />
          <PersonSelect people={options.people} />
          <TextInput label="Nome" name="name" />
          <MoneyInput label="Meta" name="targetAmount" />
          <TextInput label="Prazo" name="deadline" required={false} type="date" />
          <AccountSelect accounts={options.accounts} label="Conta vinculada" />
          <NotesField />
          <button className="finance-primary" type="submit">Criar cofrinho</button>
        </form>
      </WorkspacePage>
      <ul className="card-grid">
        {overview.goals.map((goal) => (
          <li key={goal.id}>
            <span>{goal.personEditor.displayName}</span>
            <strong>{goal.name}</strong>
            <small>{formatCurrency(goal.currentAmount)} de {formatCurrency(goal.targetAmount)}</small>
            <progress max={Number(goal.targetAmount)} value={Number(goal.currentAmount)} />
            <ItemActions>
              <EditDetails>
                <form action={updateSavingsGoalAction} className="finance-edit-form">
                  <ReturnFields month={month} returnTo="/cofrinhos" />
                  <input name="goalId" type="hidden" value={goal.id} />
                  <PersonSelect defaultValue={goal.personEditorId} people={options.people} />
                  <TextInput defaultValue={goal.name} label="Nome" name="name" />
                  <MoneyInput defaultValue={moneyInputValue(goal.targetAmount)} label="Meta" name="targetAmount" />
                  <TextInput defaultValue={goal.deadline ? toDateInputValue(goal.deadline) : null} label="Prazo" name="deadline" required={false} type="date" />
                  <AccountSelect accounts={options.accounts} defaultValue={goal.accountId} label="Conta vinculada" />
                  <label className="finance-field finance-field-wide">
                    <span>Descricao</span>
                    <textarea defaultValue={goal.description ?? undefined} name="description" rows={3} />
                  </label>
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteSavingsGoalAction} idName="goalId" idValue={goal.id} month={month} returnTo="/cofrinhos" />
            </ItemActions>
          </li>
        ))}
      </ul>
      <form action={createSavingsGoalMovementAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/cofrinhos" />
        <h2>Movimentar cofrinho</h2>
        <label className="finance-field">
          <span>Cofrinho</span>
          <select name="goalId" required>
            {options.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.personEditor.displayName} · {goal.name}
              </option>
            ))}
          </select>
        </label>
        <label className="finance-field">
          <span>Tipo</span>
          <select name="type">
            <option value="DEPOSIT">Reservar</option>
            <option value="WITHDRAWAL">Retirar</option>
          </select>
        </label>
        <MoneyInput label="Valor" />
        <TextInput label="Data" name="movementDate" type="date" />
        <NotesField />
        <button className="finance-secondary" type="submit">Salvar movimento</button>
      </form>
      <ul className="finance-list detached-list">
        {overview.goalMovements.map((movement) => (
          <li key={movement.id}>
            <div className="finance-item-main">
              <span>
                <strong>{movement.goal.name}</strong>
                <small>{movement.personEditor.displayName} - {movement.type === "DEPOSIT" ? "Reserva" : "Retirada"} - {formatDate(movement.movementDate)}</small>
              </span>
              <b>{formatCurrency(movement.amount)}</b>
            </div>
            <ItemActions>
              <EditDetails>
                <form action={updateSavingsGoalMovementAction} className="finance-edit-form">
                  <ReturnFields month={month} returnTo="/cofrinhos" />
                  <input name="movementId" type="hidden" value={movement.id} />
                  <label className="finance-field">
                    <span>Tipo</span>
                    <select defaultValue={movement.type} name="type">
                      <option value="DEPOSIT">Reservar</option>
                      <option value="WITHDRAWAL">Retirar</option>
                    </select>
                  </label>
                  <MoneyInput defaultValue={moneyInputValue(movement.amount)} label="Valor" />
                  <TextInput defaultValue={toDateInputValue(movement.movementDate)} label="Data" name="movementDate" type="date" />
                  <NotesField defaultValue={movement.notes} />
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteSavingsGoalMovementAction} idName="movementId" idValue={movement.id} month={month} returnTo="/cofrinhos" />
            </ItemActions>
          </li>
        ))}
      </ul>
    </>
  );
}

export function InvestmentsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Novo investimento" listTitle="Investimentos" month={month} subtitle="Separados do saldo disponível" title="Investimentos">
        <form action={createInvestmentAction} className="finance-form">
          <ReturnFields month={month} returnTo="/investimentos" />
          <PersonSelect people={options.people} />
          <TextInput label="Nome" name="name" />
          <TextInput label="Instituição" name="institution" required={false} />
          <MoneyInput label="Valor atual" />
          <TextInput label="Data de referência" name="referenceDate" type="date" />
          <AccountSelect accounts={options.accounts} label="Conta vinculada" />
          <NotesField />
          <button className="finance-primary" type="submit">Registrar investimento</button>
        </form>
      </WorkspacePage>
      <ul className="finance-list detached-list">
        {overview.investments.map((investment) => (
          <li key={investment.id}>
            <div className="finance-item-main">
              <span>
              <strong>{investment.name}</strong>
              <small>{investment.personEditor.displayName} · {investment.institution ?? "Sem instituição"}</small>
              </span>
              <b>{formatCurrency(investment.amount)}</b>
            </div>
            <ItemActions>
              <EditDetails>
                <form action={updateInvestmentAction} className="finance-edit-form">
                  <ReturnFields month={month} returnTo="/investimentos" />
                  <input name="investmentId" type="hidden" value={investment.id} />
                  <PersonSelect defaultValue={investment.personEditorId} people={options.people} />
                  <TextInput defaultValue={investment.name} label="Nome" name="name" />
                  <TextInput defaultValue={investment.institution} label="Instituicao" name="institution" required={false} />
                  <MoneyInput defaultValue={moneyInputValue(investment.amount)} label="Valor atual" />
                  <TextInput defaultValue={toDateInputValue(investment.referenceDate)} label="Data de referencia" name="referenceDate" type="date" />
                  <AccountSelect accounts={options.accounts} defaultValue={investment.accountId} label="Conta vinculada" />
                  <NotesField defaultValue={investment.notes} />
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteInvestmentAction} idName="investmentId" idValue={investment.id} month={month} returnTo="/investimentos" />
            </ItemActions>
          </li>
        ))}
      </ul>
    </>
  );
}

export function TransfersPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Nova transferência" listTitle="Transferências" month={month} subtitle="Não altera patrimônio do casal" title="Transferências">
        <form action={createTransferAction} className="finance-form">
          <ReturnFields month={month} returnTo="/transferencias" />
          <AccountSelect accounts={options.accounts} label="Origem" name="sourceAccountId" optional={false} />
          <AccountSelect accounts={options.accounts} label="Destino" name="destinationAccountId" optional={false} />
          <MoneyInput label="Valor" />
          <TextInput label="Data" name="transferDate" type="date" />
          <NotesField />
          <button className="finance-primary" type="submit">Transferir</button>
        </form>
      </WorkspacePage>
      <ul className="finance-list detached-list">
        {overview.transfers.map((transfer) => (
          <li key={transfer.id}>
            <div className="finance-item-main">
              <span>
              <strong>{transfer.sourceAccount.name} → {transfer.destinationAccount.name}</strong>
              <small>{formatDate(transfer.transferDate)}</small>
              </span>
              <b>{formatCurrency(transfer.amount)}</b>
            </div>
            <ItemActions>
              <EditDetails>
                <form action={updateTransferAction} className="finance-edit-form">
                  <ReturnFields month={month} returnTo="/transferencias" />
                  <input name="transferId" type="hidden" value={transfer.id} />
                  <AccountSelect accounts={options.accounts} defaultValue={transfer.sourceAccountId} label="Origem" name="sourceAccountId" optional={false} />
                  <AccountSelect accounts={options.accounts} defaultValue={transfer.destinationAccountId} label="Destino" name="destinationAccountId" optional={false} />
                  <MoneyInput defaultValue={moneyInputValue(transfer.amount)} label="Valor" />
                  <TextInput defaultValue={toDateInputValue(transfer.transferDate)} label="Data" name="transferDate" type="date" />
                  <NotesField defaultValue={transfer.notes} />
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteTransferAction} idName="transferId" idValue={transfer.id} month={month} returnTo="/transferencias" />
            </ItemActions>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CategoriesPageContent({ month, options }: { month: string; options: Options }) {
  return (
    <>
      <PageHeader month={month} subtitle="Globais ao sistema" title="Categorias" />
      <section className="finance-workspace category-workspace">
        <article className="finance-panel category-list-panel">
          <h2>Categorias compartilhadas</h2>
          <ul className="finance-list category-list">
            {options.categories.map((category) => (
              <li key={category.id}>
                <div className="finance-item-main">
                  <span>
                    <strong>{category.name}</strong>
                    <small>{category.kind === "INCOME" ? "Receita" : "Despesa"}</small>
                  </span>
                  <i style={{ background: category.color ?? "#357a68" }} />
                </div>
                <ItemActions>
                  <EditDetails>
                    <form action={updateCategoryAction} className="finance-edit-form">
                      <ReturnFields month={month} returnTo="/categorias" />
                      <input name="categoryId" type="hidden" value={category.id} />
                      <TextInput defaultValue={category.name} label="Nome" name="name" />
                      <label className="finance-field">
                        <span>Tipo</span>
                        <select defaultValue={category.kind} name="kind">
                          <option value="EXPENSE">Despesa</option>
                          <option value="INCOME">Receita</option>
                        </select>
                      </label>
                      <TextInput defaultValue={category.color} label="Cor" name="color" required={false} type="color" />
                      <button className="finance-secondary" type="submit">Salvar</button>
                    </form>
                  </EditDetails>
                  <DeleteForm action={deleteCategoryAction} idName="categoryId" idValue={category.id} month={month} returnTo="/categorias" />
                </ItemActions>
              </li>
            ))}
          </ul>
        </article>
        <details className="finance-panel finance-create-sheet category-create-panel" id="finance-create">
          <summary>
            <span>Nova categoria</span>
            <strong>Adicionar</strong>
          </summary>
          <div className="finance-create-body">
            <CategoryInlineForm kind="EXPENSE" month={month} returnTo="/categorias" />
            <CategoryInlineForm kind="INCOME" month={month} returnTo="/categorias" />
          </div>
        </details>
      </section>
    </>
  );
}

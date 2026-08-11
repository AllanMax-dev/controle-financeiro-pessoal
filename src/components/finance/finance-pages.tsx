import Link from "next/link";
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
  deleteCreditCardInvoicePaymentAction,
  deleteCreditCardPurchaseAction,
  deleteDebtAction,
  deleteFixedExpenseAction,
  deleteInvestmentAction,
  deleteSalaryAction,
  deleteSavingsGoalAction,
  deleteSavingsGoalMovementAction,
  deleteTransactionAction,
  deleteTransferAction,
  payCreditCardInvoiceAction,
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
import type { getFinanceOptions, getFinanceOverview } from "@/modules/finance/application/finance-queries";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";

type Overview = Awaited<ReturnType<typeof getFinanceOverview>>;
type Options = Awaited<ReturnType<typeof getFinanceOptions>>;

const personColors = ["#5f6fb2", "#357a68", "#2f855a"];

function moneyInputValue(value: { toFixed: (places: number) => string }) {
  return value.toFixed(2).replace(".", ",");
}

function monthInputValue(value: Date) {
  return toDateInputValue(value).slice(0, 7);
}

function ReturnFields({ month, returnTo }: { month: string; returnTo: string }) {
  return (
    <>
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="month" type="hidden" value={month} />
    </>
  );
}

function PersonSelect({ defaultValue, people }: { defaultValue?: string; people: Options["people"] }) {
  return (
    <label className="finance-field">
      <span>Pessoa</span>
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

function MoneyInput({ defaultValue, label, name = "amount" }: { defaultValue?: string; label: string; name?: string }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <input defaultValue={defaultValue} inputMode="decimal" name={name} placeholder="0,00" required type="text" />
    </label>
  );
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

function DeleteForm({ action, idName, idValue, month, returnTo }: { action: FormAction; idName: string; idValue: string; month: string; returnTo: string }) {
  return (
    <form action={action}>
      <ReturnFields month={month} returnTo={returnTo} />
      <input name={idName} type="hidden" value={idValue} />
      <button className="finance-danger" type="submit">Excluir</button>
    </form>
  );
}

export function PageHeader({ month, subtitle, title }: { month: string; subtitle: string; title: string }) {
  return (
    <section className="finance-page-header">
      <div>
        <p>{subtitle}</p>
        <h1>{title}</h1>
      </div>
      <form className="finance-month-form" method="get">
        <label>
          <span>Mês</span>
          <input defaultValue={month} name="month" type="month" />
        </label>
        <button type="submit">Aplicar</button>
      </form>
    </section>
  );
}

export function PersonTabs({ month, overview }: { month: string; overview: Overview }) {
  const tabs = [{ id: "casal", name: "Casal" }, ...overview.people.map((person) => ({ id: person.id, name: person.name }))];

  return (
    <nav className="person-tabs" aria-label="Filtro financeiro">
      {tabs.map((tab) => (
        <Link aria-current={overview.activeView === tab.id ? "page" : undefined} href={`?month=${month}&view=${tab.id}`} key={tab.id}>
          {tab.name}
        </Link>
      ))}
    </nav>
  );
}

export function DashboardPageContent({ month, overview }: { month: string; overview: Overview }) {
  const cards =
    overview.activeView === "casal"
      ? [{ id: "casal", name: "Casal", total: overview.coupleTotal }, ...overview.totalsByPerson]
      : overview.totalsByPerson.filter((person) => person.id === overview.activeView);
  const chartCards = overview.activeView === "casal" ? overview.totalsByPerson : cards;
  const dueItems = [
    ...overview.salaryOccurrences.map((salary) => ({
      amount: salary.amount,
      dueDate: salary.dueDate,
      id: `salary-${salary.id}`,
      name: salary.description,
      person: salary.personEditor.displayName,
      status: salary.status === "SETTLED" ? "Confirmado" : "Pendente",
    })),
    ...overview.fixedExpenses.map((expense) => ({
      amount: expense.amount,
      dueDate: null,
      id: `fixed-${expense.id}`,
      name: expense.description,
      person: expense.personEditor.displayName,
      status: "Pendente",
    })),
    ...overview.debtInstallments.map((installment) => ({
      amount: installment.amount,
      dueDate: installment.dueDate,
      id: `debt-${installment.id}`,
      name: installment.debt.description,
      person: installment.personEditor.displayName,
      status: `parcela ${installment.number}`,
    })),
  ].slice(0, 6);

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
                <dt>Falta pagar</dt>
                <dd>{formatCurrency(card.total.pending)}</dd>
              </div>
              <div>
                <dt>Investido</dt>
                <dd>{formatCurrency(card.total.investments)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
      <section className="finance-dashboard-grid">
        <article className="finance-panel">
          <h2>Evolução do saldo</h2>
          <div className="balance-chart" aria-label="Gráfico visual de saldo">
            {chartCards.map((card) => (
              <span key={card.id} style={{ height: `${Math.max(8, Math.min(96, Number(card.total.available) / 100))}%` }}>
                {card.name}
              </span>
            ))}
          </div>
        </article>
        <article className="finance-panel">
          <h2>Próximos vencimentos</h2>
          <ul className="finance-list">
            {dueItems.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.person} - {item.status}{item.dueDate ? ` - ${formatDate(item.dueDate)}` : ""}</small>
                </span>
                <b>{formatCurrency(item.amount)}</b>
              </li>
            ))}
          </ul>
        </article>
        <article className="finance-panel">
          <h2>Seus cartões</h2>
          <ul className="finance-list">
            {overview.cards.slice(0, 4).map((card) => (
              <li key={card.id}>
                <span>
                  <strong>{card.name}</strong>
                  <small>{card.personEditor.displayName} · vence {formatDate(card.invoiceDueDate)}</small>
                </span>
                <b>{formatCurrency(card.invoiceAmount)}</b>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}

function WorkspacePage({ children, formTitle, listTitle, month, subtitle, title }: { children: ReactNode; formTitle: string; listTitle: string; month: string; subtitle: string; title: string }) {
  return (
    <>
      <PageHeader month={month} subtitle={subtitle} title={title} />
      <section className="finance-workspace">
        <article className="finance-panel">
          <h2>{formTitle}</h2>
          {children}
        </article>
        <article className="finance-panel finance-panel-list">
          <h2>{listTitle}</h2>
          <div id="finance-list-slot" />
        </article>
      </section>
    </>
  );
}

export function BanksPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Nova conta" listTitle="Contas cadastradas" month={month} subtitle="Bancos e dinheiro" title="Bancos">
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
              <option value="OTHER">Outra</option>
            </select>
          </label>
          <MoneyInput label="Saldo inicial" name="initialBalance" />
          <TextInput defaultValue="#357a68" label="Cor" name="color" required={false} type="color" />
          <button className="finance-primary" type="submit">Criar conta</button>
        </form>
      </WorkspacePage>
      <ul className="finance-list detached-list">
        {overview.accounts.map((account) => (
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
              </EditDetails>
              <DeleteForm action={deleteAccountAction} idName="accountId" idValue={account.id} month={month} returnTo="/bancos" />
            </ItemActions>
          </li>
        ))}
      </ul>
      <form action={createBalanceAdjustmentAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/bancos" />
        <AccountSelect accounts={options.accounts} label="Conta para ajustar" name="accountId" optional={false} />
        <MoneyInput label="Saldo real hoje" name="targetBalance" />
        <TextInput label="Data" name="effectiveAt" type="date" />
        <NotesField />
        <button className="finance-secondary" type="submit">Ajustar saldo atual</button>
      </form>
      {overview.balanceAdjustments.length > 0 ? (
        <ul className="finance-list detached-list">
          {overview.balanceAdjustments.map((adjustment) => (
            <li key={adjustment.id}>
              <div className="finance-item-main">
                <span>
                  <strong>{adjustment.account.name}</strong>
                  <small>{adjustment.personEditor.displayName} - ajuste em {formatDate(adjustment.effectiveAt)}</small>
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
      ) : null}
    </>
  );
}

export function TransactionPageContent({ kind, month, options, overview, title }: { kind: "EXPENSE" | "INCOME"; month: string; options: Options; overview: Overview; title: string }) {
  const returnPath = kind === "INCOME" ? "/recebimentos" : "/gastos-variaveis";

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
        {overview.transactions
          .filter((transaction) => transaction.type === (kind === "INCOME" ? "INCOME" : "EXPENSE"))
          .filter((transaction) => !(kind === "INCOME" && transaction.salaryId))
          .map((transaction) => (
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
  return (
    <>
      <WorkspacePage formTitle="Novo gasto fixo" listTitle="Recorrências ativas" month={month} subtitle="Compromissos recorrentes" title="Gastos fixos">
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
      <ul className="finance-list detached-list">
        {overview.fixedExpenses.map((expense) => (
          <li key={expense.id}>
            <div className="finance-item-main">
              <span>
              <strong>{expense.description}</strong>
              <small>{expense.personEditor.displayName} · vence dia {expense.dueDay}</small>
              </span>
              <b>{formatCurrency(expense.amount)}</b>
            </div>
            <ItemActions>
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
        ))}
      </ul>
    </>
  );
}

export function ReceiptsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <TransactionPageContent kind="INCOME" month={month} options={options} overview={overview} title="Recebimentos" />
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
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form action={createSalaryAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/recebimentos" />
        <h2>Salário recorrente</h2>
        <PersonSelect people={options.people} />
        <TextInput label="Descrição" name="description" placeholder="Salário" />
        <MoneyInput label="Valor" />
        <TextInput label="Mês inicial" name="startMonth" type="month" />
        <TextInput label="Dia de pagamento" name="paymentDay" type="number" />
        <label className="finance-field">
          <span>Frequência</span>
          <select name="frequency">
            <option value="MONTHLY">Mensal</option>
            <option value="FORTNIGHTLY">Quinzenal</option>
          </select>
        </label>
        <CategorySelect categories={options.categories} kind="INCOME" />
        <AccountSelect accounts={options.accounts} />
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
                  <MoneyInput defaultValue={moneyInputValue(salary.amount)} label="Valor" />
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
                  <AccountSelect accounts={options.accounts} defaultValue={salary.accountId} />
                  <NotesField defaultValue={salary.notes} />
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteSalaryAction} idName="salaryId" idValue={salary.id} month={month} returnTo="/recebimentos" />
            </ItemActions>
          </li>
        ))}
      </ul>
    </>
  );
}

export function DebtsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Nova dívida" listTitle="Dívidas cadastradas" month={month} subtitle="Dívidas parceladas" title="Dívidas">
        <form action={createDebtAction} className="finance-form">
          <ReturnFields month={month} returnTo="/dividas" />
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
          <NotesField />
          <button className="finance-primary" type="submit">Criar dívida</button>
        </form>
      </WorkspacePage>
      <ul className="finance-list detached-list debt-list">
        {overview.debts.map((debt) => {
          const paidCount = debt.installments.filter((installment) => installment.status === "PAID").length;

          return (
            <li key={debt.id}>
              <details className="debt-details">
                <summary>
                  <div className="finance-item-main">
                    <span>
                      <strong>{debt.description}</strong>
                      <small>{debt.personEditor.displayName} - {paidCount}/{debt.installmentCount} parcelas pagas - primeira em {formatDate(debt.firstDueDate)}</small>
                    </span>
                    <b>{formatCurrency(debt.totalAmount)}</b>
                  </div>
                </summary>
                <div className="debt-detail-body">
                  <dl className="debt-metadata">
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
                    {debt.installments.map((installment) => (
                      <li key={installment.id}>
                        <span>
                          <strong>Parcela {installment.number}</strong>
                          <small>Vence {formatDate(installment.dueDate)}</small>
                        </span>
                        <b>{formatCurrency(installment.amount)}</b>
                        <span className="finance-status" data-status={installment.status === "PAID" ? "SETTLED" : installment.status === "CANCELED" ? "CANCELED" : "PENDING"}>
                          {installment.status === "PAID" ? "Pago" : installment.status === "CANCELED" ? "Cancelado" : "Pendente"}
                        </span>
                      </li>
                    ))}
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
                        <NotesField defaultValue={debt.notes} />
                        <button className="finance-secondary" type="submit">Salvar</button>
                      </form>
                    </EditDetails>
                    <DeleteForm action={deleteDebtAction} idName="debtId" idValue={debt.id} month={month} returnTo="/dividas" />
                  </ItemActions>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function CardsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Novo cartão" listTitle="Seus cartões" month={month} subtitle="Faturas e limite" title="Cartões de crédito">
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
          <button className="finance-primary" type="submit">Criar cartão</button>
        </form>
      </WorkspacePage>
      <ul className="card-grid">
        {overview.cards.map((card) => (
          <li key={card.id}>
            <span>{card.personEditor.displayName}</span>
            <strong>{card.name}</strong>
            <small>Fatura {formatCurrency(card.invoiceAmount)} · disponível {formatCurrency(card.limitAvailable)}</small>
            <progress max={Number(card.limit)} value={Number(card.committed)} />
            {card.invoiceId ? (
              <form action={payCreditCardInvoiceAction} className="inline-payment-form">
                <ReturnFields month={month} returnTo="/cartoes" />
                <input name="invoiceId" type="hidden" value={card.invoiceId} />
                <MoneyInput label="Pagamento" name="amount" />
                <TextInput label="Data" name="paidAt" type="date" />
                <AccountSelect accounts={options.accounts} label="Conta" name="accountId" />
                <button className="finance-secondary" type="submit">Pagar fatura</button>
              </form>
            ) : null}
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
      <form action={createCreditCardPurchaseAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/cartoes" />
        <h2>Compra no cartão</h2>
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
        <TextInput label="Descrição" name="description" />
        <MoneyInput label="Valor total" name="totalAmount" />
        <TextInput label="Parcelas" name="installmentCount" type="number" />
        <TextInput label="Data" name="purchaseDate" type="date" />
        <CategorySelect categories={options.categories} kind="EXPENSE" />
        <NotesField />
        <button className="finance-secondary" type="submit">Registrar compra</button>
      </form>
      <ul className="finance-list detached-list">
        {overview.cardPurchases.map((purchase) => (
          <li key={purchase.id}>
            <div className="finance-item-main">
              <span>
                <strong>{purchase.description}</strong>
                <small>{purchase.personEditor.displayName} - {purchase.card.name} - {formatDate(purchase.purchaseDate)}</small>
              </span>
              <b>{formatCurrency(purchase.totalAmount)}</b>
            </div>
            <ItemActions>
              <EditDetails>
                <form action={updateCreditCardPurchaseAction} className="finance-edit-form">
                  <ReturnFields month={month} returnTo="/cartoes" />
                  <input name="purchaseId" type="hidden" value={purchase.id} />
                  <label className="finance-field">
                    <span>Cartao</span>
                    <select defaultValue={purchase.cardId} name="cardId" required>
                      {options.cards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.personEditor.displayName} - {card.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextInput defaultValue={purchase.description} label="Descricao" name="description" />
                  <MoneyInput defaultValue={moneyInputValue(purchase.totalAmount)} label="Valor total" name="totalAmount" />
                  <TextInput defaultValue={purchase.installmentCount} label="Parcelas" name="installmentCount" type="number" />
                  <TextInput defaultValue={toDateInputValue(purchase.purchaseDate)} label="Data" name="purchaseDate" type="date" />
                  <CategorySelect categories={options.categories} defaultValue={purchase.categoryId} kind="EXPENSE" />
                  <NotesField defaultValue={purchase.notes} />
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteCreditCardPurchaseAction} idName="purchaseId" idValue={purchase.id} month={month} returnTo="/cartoes" />
            </ItemActions>
          </li>
        ))}
      </ul>
      <ul className="finance-list detached-list">
        {overview.invoicePayments.map((payment) => (
          <li key={payment.id}>
            <div className="finance-item-main">
              <span>
                <strong>Pagamento - {payment.invoice.card.name}</strong>
                <small>{payment.personEditor.displayName} - {payment.account.name} - {formatDate(payment.paidAt)}</small>
              </span>
              <b>{formatCurrency(payment.amount)}</b>
            </div>
            <ItemActions>
              <EditDetails>
                <form action={updateCreditCardInvoicePaymentAction} className="finance-edit-form">
                  <ReturnFields month={month} returnTo="/cartoes" />
                  <input name="paymentId" type="hidden" value={payment.id} />
                  <MoneyInput defaultValue={moneyInputValue(payment.amount)} label="Valor" />
                  <TextInput defaultValue={toDateInputValue(payment.paidAt)} label="Data" name="paidAt" type="date" />
                  <AccountSelect accounts={options.accounts} defaultValue={payment.accountId} label="Conta" name="accountId" optional={false} />
                  <NotesField defaultValue={payment.notes} />
                  <button className="finance-secondary" type="submit">Salvar</button>
                </form>
              </EditDetails>
              <DeleteForm action={deleteCreditCardInvoicePaymentAction} idName="paymentId" idValue={payment.id} month={month} returnTo="/cartoes" />
            </ItemActions>
          </li>
        ))}
      </ul>
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
      <section className="finance-workspace">
        <article className="finance-panel">
          <h2>Nova categoria</h2>
          <CategoryInlineForm kind="EXPENSE" month={month} returnTo="/categorias" />
          <CategoryInlineForm kind="INCOME" month={month} returnTo="/categorias" />
        </article>
        <article className="finance-panel">
          <h2>Categorias compartilhadas</h2>
          <ul className="finance-list">
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
      </section>
    </>
  );
}

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import {
  archiveFixedExpenseAction,
  archiveSalaryAction,
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
  payCreditCardInvoiceAction,
} from "@/modules/finance/application/finance-actions";
import type { getFinanceOptions, getFinanceOverview } from "@/modules/finance/application/finance-queries";
import { formatCurrency, formatDate } from "@/lib/format";

type Overview = Awaited<ReturnType<typeof getFinanceOverview>>;
type Options = Awaited<ReturnType<typeof getFinanceOptions>>;

const personColors = ["#6f4dd7", "#d73a12", "#1d7f4a"];

function ReturnFields({ month, returnTo, view }: { month: string; returnTo: string; view?: string }) {
  const target = `${returnTo}?month=${encodeURIComponent(month)}${view ? `&view=${encodeURIComponent(view)}` : ""}`;

  return (
    <>
      <input name="returnTo" type="hidden" value={target} />
      <input name="month" type="hidden" value={month} />
    </>
  );
}

function PersonSelect({ activeView, people }: { activeView?: string; people: Options["people"] }) {
  const selectedPersonId = activeView && activeView !== "casal" ? activeView : undefined;

  return (
    <label className="finance-field">
      <span>Pessoa</span>
      <select defaultValue={selectedPersonId} name="personEditorId" required>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AccountSelect({ accounts, label = "Conta", name = "accountId", optional = true }: { accounts: Options["accounts"]; label?: string; name?: string; optional?: boolean }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <select name={name} required={!optional}>
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

function CategorySelect({ categories, kind }: { categories: Options["categories"]; kind: "EXPENSE" | "INCOME" }) {
  return (
    <label className="finance-field">
      <span>Categoria</span>
      <select name="categoryId">
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

function TextInput({ label, name, placeholder, required = true, type = "text" }: { label: string; name: string; placeholder?: string; required?: boolean; type?: string }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <input name={name} placeholder={placeholder} required={required} type={type} />
    </label>
  );
}

function MoneyInput({ label, name = "amount" }: { label: string; name?: string }) {
  return (
    <label className="finance-field">
      <span>{label}</span>
      <input inputMode="decimal" name={name} placeholder="0,00" required type="text" />
    </label>
  );
}

function NotesField() {
  return (
    <label className="finance-field finance-field-wide">
      <span>Observação</span>
      <textarea maxLength={1000} name="notes" rows={3} />
    </label>
  );
}

function CategoryInlineForm({ kind, month, returnTo, view }: { kind: "EXPENSE" | "INCOME"; month: string; returnTo: string; view?: string }) {
  return (
    <form action={createCategoryAction} className="inline-category-form">
      <ReturnFields month={month} returnTo={returnTo} view={view} />
      <input name="kind" type="hidden" value={kind} />
      <input name="name" placeholder="+ Nova categoria" required type="text" />
      <input aria-label="Cor" defaultValue={kind === "INCOME" ? "#1d7f4a" : "#d73a12"} name="color" type="color" />
      <button type="submit">Adicionar</button>
    </form>
  );
}

export function PageHeader({ month, subtitle, title, view }: { month: string; subtitle: string; title: string; view?: string }) {
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
        {view ? <input name="view" type="hidden" value={view} /> : null}
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

function MonthlyFlowSummary({ overview }: { overview: Overview }) {
  const cards = [{ id: "casal", name: "Casal", total: overview.coupleTotal }, ...overview.totalsByPerson];

  return (
    <section className="snapshot-grid" aria-label="Valores mensais a pagar e a receber">
      {cards.map((card, index) => (
        <article className="snapshot-card" key={card.id} style={{ "--tone": personColors[index % personColors.length] } as CSSProperties}>
          <span>{card.name}</span>
          <strong>{formatCurrency(card.total.pending)}</strong>
          <small>A pagar no mês</small>
          <dl>
            <div>
              <dt>A receber</dt>
              <dd>{formatCurrency(card.total.income)}</dd>
            </div>
            <div>
              <dt>Saldo</dt>
              <dd>{formatCurrency(card.total.available)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </section>
  );
}

export function DashboardPageContent({ month, overview }: { month: string; overview: Overview }) {
  const cards = [{ id: "casal", name: "Casal", total: overview.coupleTotal }, ...overview.totalsByPerson];

  return (
    <>
      <PageHeader month={month} subtitle="Resumo financeiro pessoal" title="Dashboard" view={overview.activeView} />
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
            {cards.slice(1).map((card) => (
              <span key={card.id} style={{ height: `${Math.max(8, Math.min(96, Number(card.total.available) / 100))}%` }}>
                {card.name}
              </span>
            ))}
          </div>
        </article>
        <article className="finance-panel">
          <h2>Próximos vencimentos</h2>
          <ul className="finance-list">
            {[...overview.fixedExpenses, ...overview.debtInstallments].slice(0, 6).map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{"description" in item ? item.description : item.debt.description}</strong>
                  <small>{item.personEditor.displayName}</small>
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

function WorkspacePage({ children, formTitle, listTitle, month, overview, subtitle, title }: { children: ReactNode; formTitle: string; listTitle: string; month: string; overview: Overview; subtitle: string; title: string }) {
  return (
    <>
      <PageHeader month={month} subtitle={subtitle} title={title} view={overview.activeView} />
      <PersonTabs month={month} overview={overview} />
      <MonthlyFlowSummary overview={overview} />
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
      <WorkspacePage formTitle="Nova conta" listTitle="Contas cadastradas" month={month} overview={overview} subtitle="Bancos e dinheiro" title="Bancos">
        <form action={createAccountAction} className="finance-form">
          <ReturnFields month={month} returnTo="/bancos" view={overview.activeView} />
          <PersonSelect activeView={overview.activeView} people={options.people} />
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
          <TextInput label="Cor" name="color" required={false} type="color" />
          <button className="finance-primary" type="submit">Criar conta</button>
        </form>
      </WorkspacePage>
      <ul className="finance-list detached-list">
        {overview.accounts.map((account) => (
          <li key={account.id}>
            <span>
              <strong>{account.name}</strong>
              <small>{account.personEditor.displayName} · {account.institution ?? "Sem instituição"}</small>
            </span>
            <b>{formatCurrency(account.balance)}</b>
          </li>
        ))}
      </ul>
      <form action={createBalanceAdjustmentAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/bancos" view={overview.activeView} />
        <AccountSelect accounts={options.accounts} label="Conta para ajustar" name="accountId" optional={false} />
        <MoneyInput label="Saldo real hoje" name="targetBalance" />
        <TextInput label="Data" name="effectiveAt" type="date" />
        <NotesField />
        <button className="finance-secondary" type="submit">Ajustar saldo atual</button>
      </form>
    </>
  );
}

export function TransactionPageContent({ kind, month, options, overview, title }: { kind: "EXPENSE" | "INCOME"; month: string; options: Options; overview: Overview; title: string }) {
  const returnPath = kind === "INCOME" ? "/recebimentos" : "/gastos-variaveis";

  return (
    <>
      <WorkspacePage formTitle={kind === "INCOME" ? "Registrar recebimento" : "Adicionar lançamento"} listTitle="Lançamentos do mês" month={month} overview={overview} subtitle="Movimentações mensais" title={title}>
        <form action={createTransactionAction} className="finance-form">
          <ReturnFields month={month} returnTo={returnPath} view={overview.activeView} />
          <input name="type" type="hidden" value={kind} />
          <PersonSelect activeView={overview.activeView} people={options.people} />
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
        <CategoryInlineForm kind={kind} month={month} returnTo={returnPath} view={overview.activeView} />
      </WorkspacePage>
      <ul className="finance-list detached-list">
        {overview.transactions
          .filter((transaction) => transaction.type === (kind === "INCOME" ? "INCOME" : "EXPENSE"))
          .map((transaction) => (
            <li key={transaction.id}>
              <span>
                <strong>{transaction.description}</strong>
                <small>{transaction.personEditor.displayName} · {transaction.category?.name ?? "Sem categoria"}</small>
              </span>
              <b>{formatCurrency(transaction.amount)}</b>
            </li>
          ))}
      </ul>
    </>
  );
}

export function FixedExpensesPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Novo gasto fixo" listTitle="Recorrências ativas" month={month} overview={overview} subtitle="Compromissos recorrentes" title="Gastos fixos">
        <form action={createFixedExpenseAction} className="finance-form">
          <ReturnFields month={month} returnTo="/despesas-fixas" view={overview.activeView} />
          <PersonSelect activeView={overview.activeView} people={options.people} />
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
            <span>
              <strong>{expense.description}</strong>
              <small>{expense.personEditor.displayName} · vence dia {expense.dueDay}</small>
            </span>
            <b>{formatCurrency(expense.amount)}</b>
            <form action={archiveFixedExpenseAction}>
              <ReturnFields month={month} returnTo="/despesas-fixas" view={overview.activeView} />
              <input name="fixedExpenseId" type="hidden" value={expense.id} />
              <button className="finance-secondary" type="submit">Encerrar</button>
            </form>
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
      <form action={createSalaryAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/recebimentos" view={overview.activeView} />
        <h2>Salário recorrente</h2>
        <PersonSelect activeView={overview.activeView} people={options.people} />
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
            <span>
              <strong>{salary.description}</strong>
              <small>{salary.personEditor.displayName} · dia {salary.paymentDay}</small>
            </span>
            <b>{formatCurrency(salary.amount)}</b>
            <form action={archiveSalaryAction}>
              <ReturnFields month={month} returnTo="/recebimentos" view={overview.activeView} />
              <input name="salaryId" type="hidden" value={salary.id} />
              <button className="finance-secondary" type="submit">Encerrar</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}

export function DebtsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Nova dívida" listTitle="Parcelas do mês" month={month} overview={overview} subtitle="Parcelas determinísticas" title="Dívidas">
        <form action={createDebtAction} className="finance-form">
          <ReturnFields month={month} returnTo="/dividas" view={overview.activeView} />
          <PersonSelect activeView={overview.activeView} people={options.people} />
          <TextInput label="Descrição" name="description" />
          <MoneyInput label="Valor total" name="totalAmount" />
          <TextInput label="Data inicial" name="startDate" type="date" />
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
      <ul className="finance-list detached-list">
        {overview.debtInstallments.map((installment) => (
          <li key={installment.id}>
            <span>
              <strong>{installment.debt.description}</strong>
              <small>{installment.personEditor.displayName} · parcela {installment.number}</small>
            </span>
            <b>{formatCurrency(installment.amount)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CardsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Novo cartão" listTitle="Seus cartões" month={month} overview={overview} subtitle="Faturas e limite" title="Cartões de crédito">
        <form action={createCreditCardAction} className="finance-form">
          <ReturnFields month={month} returnTo="/cartoes" view={overview.activeView} />
          <PersonSelect activeView={overview.activeView} people={options.people} />
          <TextInput label="Nome" name="name" />
          <TextInput label="Instituição" name="institution" required={false} />
          <MoneyInput label="Limite" name="limit" />
          <TextInput label="Fechamento" name="closingDay" type="number" />
          <TextInput label="Vencimento" name="dueDay" type="number" />
          <AccountSelect accounts={options.accounts} label="Conta de pagamento" name="paymentAccountId" />
          <TextInput label="Cor" name="color" required={false} type="color" />
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
                <ReturnFields month={month} returnTo="/cartoes" view={overview.activeView} />
                <input name="invoiceId" type="hidden" value={card.invoiceId} />
                <MoneyInput label="Pagamento" name="amount" />
                <TextInput label="Data" name="paidAt" type="date" />
                <AccountSelect accounts={options.accounts} label="Conta" name="accountId" />
                <button className="finance-secondary" type="submit">Pagar fatura</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <form action={createCreditCardPurchaseAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/cartoes" view={overview.activeView} />
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
    </>
  );
}

export function GoalsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Novo cofrinho" listTitle="Metas" month={month} overview={overview} subtitle="Reservas sem duplicar patrimônio" title="Cofrinhos">
        <form action={createSavingsGoalAction} className="finance-form">
          <ReturnFields month={month} returnTo="/cofrinhos" view={overview.activeView} />
          <PersonSelect activeView={overview.activeView} people={options.people} />
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
          </li>
        ))}
      </ul>
      <form action={createSavingsGoalMovementAction} className="finance-form compact-card">
        <ReturnFields month={month} returnTo="/cofrinhos" view={overview.activeView} />
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
    </>
  );
}

export function InvestmentsPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Novo investimento" listTitle="Investimentos" month={month} overview={overview} subtitle="Separados do saldo disponível" title="Investimentos">
        <form action={createInvestmentAction} className="finance-form">
          <ReturnFields month={month} returnTo="/investimentos" view={overview.activeView} />
          <PersonSelect activeView={overview.activeView} people={options.people} />
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
            <span>
              <strong>{investment.name}</strong>
              <small>{investment.personEditor.displayName} · {investment.institution ?? "Sem instituição"}</small>
            </span>
            <b>{formatCurrency(investment.amount)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

export function TransfersPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <WorkspacePage formTitle="Nova transferência" listTitle="Transferências" month={month} overview={overview} subtitle="Não altera patrimônio do casal" title="Transferências">
        <form action={createTransferAction} className="finance-form">
          <ReturnFields month={month} returnTo="/transferencias" view={overview.activeView} />
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
            <span>
              <strong>{transfer.sourceAccount.name} → {transfer.destinationAccount.name}</strong>
              <small>{formatDate(transfer.transferDate)}</small>
            </span>
            <b>{formatCurrency(transfer.amount)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CategoriesPageContent({ month, options, overview }: { month: string; options: Options; overview: Overview }) {
  return (
    <>
      <PageHeader month={month} subtitle="Globais ao sistema" title="Categorias" view={overview.activeView} />
      <PersonTabs month={month} overview={overview} />
      <MonthlyFlowSummary overview={overview} />
      <section className="finance-workspace">
        <article className="finance-panel">
          <h2>Nova categoria</h2>
          <CategoryInlineForm kind="EXPENSE" month={month} returnTo="/categorias" view={overview.activeView} />
          <CategoryInlineForm kind="INCOME" month={month} returnTo="/categorias" view={overview.activeView} />
        </article>
        <article className="finance-panel">
          <h2>Categorias compartilhadas</h2>
          <ul className="finance-list">
            {options.categories.map((category) => (
              <li key={category.id}>
                <span>
                  <strong>{category.name}</strong>
                  <small>{category.kind === "INCOME" ? "Receita" : "Despesa"}</small>
                </span>
                <i style={{ background: category.color ?? "#d73a12" }} />
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}

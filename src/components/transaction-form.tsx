"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type TransactionFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type TransactionFormDefaults = {
  accountId: string;
  amount: string;
  categoryId: string;
  competenceDate: string;
  description: string;
  dueDate: string;
  id?: string;
  notes: string;
  settledDate: string;
  status: "PENDING" | "SETTLED";
  type: "INCOME" | "EXPENSE";
  version?: number;
};

export function TransactionForm({
  accounts,
  action,
  categories,
  defaults,
  submitLabel,
}: {
  accounts: { id: string; name: string }[];
  action: TransactionFormAction;
  categories: { id: string; kind: "INCOME" | "EXPENSE"; name: string }[];
  defaults: TransactionFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [type, setType] = useState(defaults.type);
  const [status, setStatus] = useState(defaults.status);
  const compatibleCategories = categories.filter((category) => category.kind === type);

  return (
    <form action={formAction} className="entity-form transaction-form">
      {defaults.id ? <input name="id" type="hidden" value={defaults.id} /> : null}
      {defaults.version ? <input name="version" type="hidden" value={defaults.version} /> : null}

      <div className="form-section-title field-wide">
        <h2>Classificação e valor</h2>
        <p>Defina se o lançamento é receita ou despesa e associe conta e categoria.</p>
      </div>

      <label className="field">
        <span>Tipo</span>
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value as "INCOME" | "EXPENSE")}
          required
        >
          <option value="EXPENSE">Despesa</option>
          <option value="INCOME">Receita</option>
        </select>
      </label>

      <label className="field field-wide-on-mobile">
        <span>Descrição</span>
        <input
          name="description"
          type="text"
          minLength={2}
          maxLength={160}
          defaultValue={defaults.description}
          placeholder="Ex.: Mercado do mês"
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span>Valor</span>
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          defaultValue={defaults.amount}
          placeholder="0,00"
          required
        />
      </label>

      <label className="field">
        <span>Conta</span>
        <select name="accountId" defaultValue={defaults.accountId} required>
          <option value="" disabled>
            Selecione
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Categoria</span>
        <select name="categoryId" defaultValue={defaults.categoryId} key={type}>
          <option value="">Sem categoria</option>
          {compatibleCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <div className="form-section-title field-wide">
        <h2>Datas, status e observações</h2>
        <p>Valores pendentes ficam separados dos realizados até a data de pagamento ou recebimento.</p>
      </div>

      <label className="field">
        <span>Competência</span>
        <input name="competenceDate" type="date" defaultValue={defaults.competenceDate} required />
      </label>

      <label className="field">
        <span>Vencimento</span>
        <input name="dueDate" type="date" defaultValue={defaults.dueDate} />
      </label>

      <label className="field">
        <span>Status</span>
        <select
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as "PENDING" | "SETTLED")}
          required
        >
          <option value="PENDING">Pendente</option>
          <option value="SETTLED">Realizado</option>
        </select>
      </label>

      <label className="field">
        <span>{type === "INCOME" ? "Data do recebimento" : "Data do pagamento"}</span>
        <input
          name="settledDate"
          type="date"
          defaultValue={defaults.settledDate}
          required={status === "SETTLED"}
          disabled={status !== "SETTLED"}
        />
      </label>

      <label className="field field-wide">
        <span>Observações</span>
        <textarea name="notes" maxLength={1000} defaultValue={defaults.notes} rows={4} />
      </label>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="form-actions field-wide">
        <Link className="secondary-button" href="/lancamentos">
          Cancelar
        </Link>
        <FormSubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

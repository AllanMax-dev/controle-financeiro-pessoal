"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type FixedExpenseFormAction = (
  state: ActionState,
  formData: FormData,
) => Promise<ActionState>;

type FixedExpenseFormDefaults = {
  accountId: string;
  amount: string;
  categoryId: string;
  description: string;
  dueDay: number;
  editorId: string;
  id?: string;
  notes: string;
  startMonth: string;
  version?: number;
};

export function FixedExpenseForm({
  accounts,
  action,
  categories,
  currentMonth,
  currentEditorId,
  defaults,
  editors,
  submitLabel = "Cadastrar despesa fixa",
}: {
  accounts: { id: string; name: string }[];
  action: FixedExpenseFormAction;
  categories: { id: string; name: string }[];
  currentMonth: string;
  currentEditorId: string;
  defaults?: FixedExpenseFormDefaults;
  editors: { id: string; displayName: string }[];
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const values = defaults ?? {
    accountId: "",
    amount: "",
    categoryId: "",
    description: "",
    dueDay: 10,
    editorId: currentEditorId,
    notes: "",
    startMonth: currentMonth,
  };

  return (
    <form action={formAction} className="entity-form fixed-expense-form">
      {values.id ? <input name="id" type="hidden" value={values.id} /> : null}
      {values.version ? <input name="version" type="hidden" value={values.version} /> : null}
      <div className="form-section-title field-wide">
        <h2>Dados da despesa</h2>
        <p>Cadastre compromissos mensais como aluguel, feira, internet e assinaturas.</p>
      </div>

      <label className="field">
        <span>Descrição</span>
        <input
          name="description"
          type="text"
          minLength={2}
          maxLength={160}
          placeholder="Ex.: Aluguel"
          defaultValue={values.description}
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span>Valor mensal previsto</span>
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          defaultValue={values.amount}
          placeholder="0,00"
          required
        />
        <small>O valor poderá ser ajustado no momento do pagamento.</small>
      </label>

      <label className="field">
        <span>Conta de pagamento</span>
        <select name="accountId" defaultValue={values.accountId} required>
          <option value="" disabled>Selecione</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Categoria</span>
        <select name="categoryId" defaultValue={values.categoryId} required>
          <option value="" disabled>Selecione</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>

      <div className="form-section-title field-wide">
        <h2>Recorrência mensal</h2>
        <p>Defina quando a despesa começa e o dia padrão de vencimento.</p>
      </div>

      <label className="field">
        <span>Mês inicial</span>
        <input name="startMonth" type="month" defaultValue={values.startMonth} required />
      </label>

      <label className="field">
        <span>Dia do vencimento</span>
        <input name="dueDay" type="number" min={1} max={31} defaultValue={values.dueDay} required />
        <small>Em meses mais curtos será usado o último dia disponível.</small>
      </label>

      <label className="field">
        <span>Pessoa responsável</span>
        <select name="editorId" defaultValue={values.editorId} required>
          {editors.map((editor) => (
            <option key={editor.id} value={editor.id}>{editor.displayName}</option>
          ))}
        </select>
      </label>

      <label className="field field-wide">
        <span>Observações</span>
        <textarea name="notes" maxLength={1000} defaultValue={values.notes} rows={4} />
      </label>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}

      <div className="form-actions field-wide">
        <Link className="secondary-button" href="/despesas-fixas">Cancelar</Link>
        <FormSubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

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

export function FixedExpenseForm({
  accounts,
  action,
  categories,
  currentEditorId,
  editors,
}: {
  accounts: { id: string; name: string }[];
  action: FixedExpenseFormAction;
  categories: { id: string; name: string }[];
  currentEditorId: string;
  editors: { id: string; displayName: string }[];
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <form action={formAction} className="entity-form fixed-expense-form">
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
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span>Valor mensal previsto</span>
        <input name="amount" type="text" inputMode="decimal" placeholder="0,00" required />
        <small>O valor poderá ser ajustado no momento do pagamento.</small>
      </label>

      <label className="field">
        <span>Conta de pagamento</span>
        <select name="accountId" defaultValue="" required>
          <option value="" disabled>Selecione</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Categoria</span>
        <select name="categoryId" defaultValue="" required>
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
        <input name="startMonth" type="month" defaultValue={currentMonth} required />
      </label>

      <label className="field">
        <span>Dia do vencimento</span>
        <input name="dueDay" type="number" min={1} max={31} defaultValue={10} required />
        <small>Em meses mais curtos será usado o último dia disponível.</small>
      </label>

      <label className="field">
        <span>Pessoa responsável</span>
        <select name="editorId" defaultValue={currentEditorId} required>
          {editors.map((editor) => (
            <option key={editor.id} value={editor.id}>{editor.displayName}</option>
          ))}
        </select>
      </label>

      <label className="field field-wide">
        <span>Observações</span>
        <textarea name="notes" maxLength={1000} rows={4} />
      </label>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}

      <div className="form-actions field-wide">
        <Link className="secondary-button" href="/despesas-fixas">Cancelar</Link>
        <FormSubmitButton label="Cadastrar despesa fixa" />
      </div>
    </form>
  );
}

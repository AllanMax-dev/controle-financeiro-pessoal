"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type SalaryFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function SalaryForm({
  accounts,
  action,
  categories,
  currentMonth,
  currentEditorId,
  editors,
}: {
  accounts: { id: string; name: string }[];
  action: SalaryFormAction;
  categories: { id: string; name: string }[];
  currentMonth: string;
  currentEditorId: string;
  editors: { id: string; displayName: string }[];
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [frequency, setFrequency] = useState<"MONTHLY" | "FORTNIGHTLY">("MONTHLY");
  return (
    <form action={formAction} className="entity-form fixed-expense-form">
      <div className="form-section-title field-wide">
        <h2>Dados do salário</h2>
        <p>Cadastre a renda recorrente de cada pessoa e a conta que receberá o valor.</p>
      </div>

      <label className="field">
        <span>Descrição</span>
        <input
          name="description"
          type="text"
          minLength={2}
          maxLength={160}
          placeholder="Ex.: Salário Allan"
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span>Valor mensal total</span>
        <input name="amount" type="text" inputMode="decimal" placeholder="0,00" required />
        <small>No modo quinzenal, o total será dividido entre os dias 15 e 30.</small>
      </label>

      <label className="field">
        <span>Conta de recebimento</span>
        <select name="accountId" defaultValue="" required>
          <option value="" disabled>Selecione</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Categoria de receita</span>
        <select name="categoryId" defaultValue="" required>
          <option value="" disabled>Selecione</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>

      <div className="form-section-title field-wide">
        <h2>Frequência de recebimento</h2>
        <p>Escolha um pagamento mensal ou dois recebimentos por mês.</p>
      </div>

      <label className="field">
        <span>Frequência</span>
        <select
          name="frequency"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as "MONTHLY" | "FORTNIGHTLY")}
        >
          <option value="MONTHLY">Mensal</option>
          <option value="FORTNIGHTLY">Quinzenal — dias 15 e 30</option>
        </select>
      </label>

      <label className="field">
        <span>{frequency === "MONTHLY" ? "Dia do recebimento" : "Dias do recebimento"}</span>
        {frequency === "MONTHLY" ? (
          <input key="monthly" name="paymentDay" type="number" min={1} max={31} defaultValue={5} required />
        ) : (
          <input key="fortnightly" type="text" value="15 e 30" readOnly disabled />
        )}
        <small>Em meses mais curtos será usado o último dia disponível.</small>
      </label>

      <label className="field">
        <span>Mês inicial</span>
        <input name="startMonth" type="month" defaultValue={currentMonth} required />
      </label>

      <label className="field">
        <span>Pessoa que recebe</span>
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
        <Link className="secondary-button" href="/salarios">Cancelar</Link>
        <FormSubmitButton label="Cadastrar salário" />
      </div>
    </form>
  );
}

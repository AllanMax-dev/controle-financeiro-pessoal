"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type BudgetFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function BudgetForm({
  action,
  amount,
  budgetId,
  categoryId,
  categoryName,
  contextId,
  month,
  version,
}: {
  action: BudgetFormAction;
  amount: string;
  budgetId?: string;
  categoryId: string;
  categoryName: string;
  contextId: string;
  month: string;
  version?: number;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="budget-form">
      <input name="id" type="hidden" value={budgetId ?? ""} />
      <input name="version" type="hidden" value={version ?? ""} />
      <input name="categoryId" type="hidden" value={categoryId} />
      <input name="contextId" type="hidden" value={contextId} />
      <input name="month" type="hidden" value={month} />
      <label className="budget-field">
        <span>Limite mensal</span>
        <input
          aria-label={`Orçamento de ${categoryName}`}
          name="amount"
          type="text"
          inputMode="decimal"
          defaultValue={amount}
          placeholder="0,00"
          required
        />
      </label>
      <FormSubmitButton label="Salvar" />
      {state.error ? (
        <small className="inline-error" role="alert">
          {state.error}
        </small>
      ) : null}
      {state.success ? <small className="inline-success">{state.success}</small> : null}
    </form>
  );
}

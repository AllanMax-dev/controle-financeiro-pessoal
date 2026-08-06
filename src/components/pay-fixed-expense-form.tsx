"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type PaymentAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function PayFixedExpenseForm({
  action,
  amount,
  fixedExpenseId,
  month,
}: {
  action: PaymentAction;
  amount: string;
  fixedExpenseId: string;
  month: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="fixed-expense-payment-form">
      <input name="id" type="hidden" value={fixedExpenseId} />
      <input name="month" type="hidden" value={month} />
      <label>
        <span>Valor pago</span>
        <input name="amount" type="text" inputMode="decimal" defaultValue={amount} required />
      </label>
      <label>
        <span>Data do pagamento</span>
        <input
          name="paymentDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          required
        />
      </label>
      <FormSubmitButton label="Registrar pagamento" />
      {state.error ? <small className="inline-error" role="alert">{state.error}</small> : null}
      {state.success ? <small className="inline-success" role="status">{state.success}</small> : null}
    </form>
  );
}

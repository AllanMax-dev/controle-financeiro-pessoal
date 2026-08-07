"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type ReceiptAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function ReceiveSalaryForm({
  action,
  amount,
  currentDate,
  installment,
  month,
  salaryId,
}: {
  action: ReceiptAction;
  amount: string;
  currentDate: string;
  installment: number;
  month: string;
  salaryId: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="fixed-expense-payment-form">
      <input name="id" type="hidden" value={salaryId} />
      <input name="installment" type="hidden" value={installment} />
      <input name="month" type="hidden" value={month} />
      <label>
        <span>Valor recebido</span>
        <input name="amount" type="text" inputMode="decimal" defaultValue={amount} required />
      </label>
      <label>
        <span>Data do recebimento</span>
        <input
          name="receiptDate"
          type="date"
          defaultValue={currentDate}
          required
        />
      </label>
      <FormSubmitButton label="Registrar recebimento" />
      {state.error ? <small className="inline-error" role="alert">{state.error}</small> : null}
      {state.success ? <small className="inline-success" role="status">{state.success}</small> : null}
    </form>
  );
}

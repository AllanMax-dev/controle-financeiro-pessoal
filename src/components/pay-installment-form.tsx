"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type PaymentAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function PayInstallmentForm({
  accounts,
  action,
  installmentId,
  version,
}: {
  accounts: { id: string; name: string }[];
  action: PaymentAction;
  installmentId: string;
  version: number;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="installment-payment-form">
      <input name="id" type="hidden" value={installmentId} />
      <input name="version" type="hidden" value={version} />
      <label>
        <span>Conta do pagamento</span>
        <select name="accountId" defaultValue="" required>
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
      <label>
        <span>Data do pagamento</span>
        <input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
      </label>
      <FormSubmitButton label="Marcar como paga" />
      {state.error ? (
        <small className="inline-error" role="alert">
          {state.error}
        </small>
      ) : null}
    </form>
  );
}

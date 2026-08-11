"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type TransferFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type TransferFormDefaults = {
  amount: string;
  description: string;
  destinationAccountId: string;
  contextId: string;
  id?: string;
  notes: string;
  settledDate: string;
  sourceAccountId: string;
  status: "PENDING" | "SETTLED";
  transferDate: string;
  version?: number;
};

export function TransferForm({
  accounts,
  action,
  defaults,
  submitLabel,
}: {
  accounts: { financialContext?: { name: string }; id: string; name: string }[];
  action: TransferFormAction;
  defaults: TransferFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [status, setStatus] = useState(defaults.status);

  return (
    <form action={formAction} className="entity-form transaction-form">
      {defaults.id ? <input name="id" type="hidden" value={defaults.id} /> : null}
      {defaults.version ? <input name="version" type="hidden" value={defaults.version} /> : null}

      <input name="contextId" type="hidden" value={defaults.contextId} />
      <div className="form-section-title field-wide">
        <h2>Origem, destino e valor</h2>
        <p>Transferências movimentam contas sem classificar receita ou despesa.</p>
      </div>

      <label className="field field-wide-on-mobile">
        <span>Descrição</span>
        <input
          name="description"
          type="text"
          minLength={2}
          maxLength={160}
          defaultValue={defaults.description}
          placeholder="Ex.: Reserva do mês"
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
        <span>Conta de origem</span>
        <select name="sourceAccountId" defaultValue={defaults.sourceAccountId} required>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}{account.financialContext ? ` · ${account.financialContext.name}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Conta de destino</span>
        <select name="destinationAccountId" defaultValue={defaults.destinationAccountId} required>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}{account.financialContext ? ` · ${account.financialContext.name}` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="form-section-title field-wide">
        <h2>Datas, status e observações</h2>
        <p>Somente transferências realizadas alteram os saldos consolidados.</p>
      </div>

      <label className="field">
        <span>Data da transferência</span>
        <input name="transferDate" type="date" defaultValue={defaults.transferDate} required />
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
          <option value="SETTLED">Realizada</option>
        </select>
      </label>

      <label className="field">
        <span>Data de realização</span>
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
        <Link className="secondary-button" href="/transferencias">
          Cancelar
        </Link>
        <FormSubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

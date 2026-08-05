"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type AccountFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type AccountFormDefaults = {
  color: string;
  id?: string;
  initialBalance: string;
  name: string;
  type: "CHECKING" | "SAVINGS" | "CASH" | "DIGITAL" | "OTHER";
  version?: number;
};

const accountTypes = [
  { value: "CHECKING", label: "Conta corrente" },
  { value: "DIGITAL", label: "Conta digital" },
  { value: "SAVINGS", label: "Poupança" },
  { value: "CASH", label: "Dinheiro" },
  { value: "OTHER", label: "Outra" },
] as const;

export function AccountForm({
  action,
  defaults,
  submitLabel,
}: {
  action: AccountFormAction;
  defaults: AccountFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="entity-form">
      {defaults.id ? <input name="id" type="hidden" value={defaults.id} /> : null}
      {defaults.version ? <input name="version" type="hidden" value={defaults.version} /> : null}

      <label className="field field-wide">
        <span>Nome da conta</span>
        <input
          name="name"
          type="text"
          minLength={2}
          maxLength={100}
          defaultValue={defaults.name}
          placeholder="Ex.: Conta principal"
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span>Tipo</span>
        <select name="type" defaultValue={defaults.type} required>
          {accountTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Saldo inicial</span>
        <input
          name="initialBalance"
          type="text"
          inputMode="decimal"
          defaultValue={defaults.initialBalance}
          placeholder="0,00"
          required
        />
      </label>

      <label className="field field-color">
        <span>Cor</span>
        <input name="color" type="color" defaultValue={defaults.color} required />
      </label>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="form-actions field-wide">
        <Link className="secondary-button" href="/contas">
          Cancelar
        </Link>
        <FormSubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

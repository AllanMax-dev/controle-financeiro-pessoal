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
  contextId: string;
  id?: string;
  initialBalance: string;
  name: string;
  ownerEditorId: string | null;
  type: "CHECKING" | "SAVINGS" | "CASH" | "DIGITAL" | "INVESTMENT" | "OTHER";
  version?: number;
};

const accountTypes = [
  { value: "CHECKING", label: "Conta corrente" },
  { value: "DIGITAL", label: "Conta digital" },
  { value: "SAVINGS", label: "Poupança" },
  { value: "CASH", label: "Dinheiro" },
  { value: "INVESTMENT", label: "Investimento" },
  { value: "OTHER", label: "Outra" },
] as const;

export function AccountForm({
  action,
  defaults,
  editors,
  initialBalanceLocked = false,
  submitLabel,
  typeLocked = false,
}: {
  action: AccountFormAction;
  defaults: AccountFormDefaults;
  editors: { id: string; displayName: string }[];
  initialBalanceLocked?: boolean;
  submitLabel: string;
  typeLocked?: boolean;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="entity-form">
      {defaults.id ? <input name="id" type="hidden" value={defaults.id} /> : null}
      {defaults.version ? <input name="version" type="hidden" value={defaults.version} /> : null}
      <input name="contextId" type="hidden" value={defaults.contextId} />

      <div className="form-section-title field-wide">
        <h2>Identificação da conta</h2>
        <p>Dados usados para exibir a conta, calcular saldos e diferenciar registros.</p>
      </div>

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
        {typeLocked ? <input name="type" type="hidden" value={defaults.type} /> : null}
        <select name="type" defaultValue={defaults.type} disabled={typeLocked} required>
          {accountTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {typeLocked ? <small>O tipo fica bloqueado depois que a conta possui histórico.</small> : null}
      </label>
      <label className="field">
        <span>Responsável</span>
        <select name="ownerEditorId" defaultValue={defaults.ownerEditorId ?? ""}>
          <option value="">Compartilhada / casal</option>
          {editors.map((editor) => (
            <option key={editor.id} value={editor.id}>
              {editor.displayName}
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
          readOnly={initialBalanceLocked}
          required
        />
        {initialBalanceLocked ? <small>Use Ajustar saldo atual para conciliar esta conta.</small> : null}
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

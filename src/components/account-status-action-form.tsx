"use client";

import { useActionState } from "react";

import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type AccountStatusAction = (formData: FormData) => Promise<ActionState>;

export function AccountStatusActionForm({
  stateAction,
  active,
  accountId,
  version,
}: {
  stateAction: AccountStatusAction;
  active: boolean;
  accountId: string;
  version: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>((_state, formData) => stateAction(formData), INITIAL_ACTION_STATE);
  const label = active ? "Reativar" : "Arquivar";

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!active && !window.confirm("Arquivar esta conta? Ela precisa estar sem saldo, recorrências e pendências.")) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={accountId} />
      <input name="version" type="hidden" value={version} />
      <input name="active" type="hidden" value={String(active)} />
      <button className="text-button" type="submit">
        {label}
      </button>
      {state.error ? (
        <small className="inline-error" role="alert">
          {state.error}
        </small>
      ) : null}
    </form>
  );
}
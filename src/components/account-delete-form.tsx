"use client";

import { useActionState } from "react";

import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type AccountDeleteAction = (formData: FormData) => Promise<ActionState>;

export function AccountDeleteForm({
  stateAction,
  accountId,
  version,
}: {
  stateAction: AccountDeleteAction;
  accountId: string;
  version: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>((_state, formData) => stateAction(formData), INITIAL_ACTION_STATE);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Excluir definitivamente esta conta arquivada?")) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={accountId} />
      <input name="version" type="hidden" value={version} />
      <button className="text-button text-button-danger" type="submit">
        Excluir
      </button>
      {state.error ? (
        <small className="inline-error" role="alert">
          {state.error}
        </small>
      ) : null}
    </form>
  );
}
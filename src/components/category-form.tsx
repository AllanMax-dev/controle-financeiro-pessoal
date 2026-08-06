"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type CategoryFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type CategoryFormDefaults = {
  color: string;
  id?: string;
  kind: "INCOME" | "EXPENSE";
  name: string;
  version?: number;
};

export function CategoryForm({
  action,
  defaults,
  submitLabel,
}: {
  action: CategoryFormAction;
  defaults: CategoryFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="entity-form">
      {defaults.id ? <input name="id" type="hidden" value={defaults.id} /> : null}
      {defaults.version ? <input name="version" type="hidden" value={defaults.version} /> : null}

      <div className="form-section-title field-wide">
        <h2>Definição da categoria</h2>
        <p>Nome, aplicação e cor usados para classificar lançamentos e relatórios.</p>
      </div>

      <label className="field field-wide">
        <span>Nome da categoria</span>
        <input
          name="name"
          type="text"
          minLength={2}
          maxLength={100}
          defaultValue={defaults.name}
          placeholder="Ex.: Moradia"
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span>Aplicação</span>
        <select name="kind" defaultValue={defaults.kind} required>
          <option value="EXPENSE">Despesas</option>
          <option value="INCOME">Receitas</option>
        </select>
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
        <Link className="secondary-button" href="/categorias">
          Cancelar
        </Link>
        <FormSubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

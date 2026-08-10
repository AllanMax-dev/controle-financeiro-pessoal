"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type SavingsGoalAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function SavingsGoalForm({
  accounts,
  action,
  contextId,
}: {
  accounts: { id: string; name: string }[];
  action: SavingsGoalAction;
  contextId: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="entity-form compact-finance-form">
      <input name="contextId" type="hidden" value={contextId} />
      <div className="form-section-title field-wide">
        <h2>Novo cofrinho</h2>
        <p>Metas organizam o dinheiro jÃ¡ existente sem duplicar patrimÃ´nio.</p>
      </div>
      <label className="field field-wide-on-mobile">
        <span>Nome</span>
        <input name="name" minLength={2} maxLength={100} placeholder="Ex.: Reserva" required />
      </label>
      <label className="field">
        <span>Meta</span>
        <input name="targetAmount" inputMode="decimal" placeholder="0,00" required />
      </label>
      <label className="field">
        <span>Prazo</span>
        <input name="deadline" type="date" />
      </label>
      <label className="field">
        <span>Conta vinculada</span>
        <select name="accountId" defaultValue="">
          <option value="">Sem conta especÃ­fica</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-wide">
        <span>DescriÃ§Ã£o</span>
        <textarea name="description" maxLength={1000} rows={3} />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="inline-success">{state.success}</p> : null}
      <div className="form-actions field-wide">
        <FormSubmitButton label="Criar cofrinho" />
      </div>
    </form>
  );
}

export function SavingsGoalMovementForm({
  accounts,
  action,
  goals,
  today,
}: {
  accounts: { id: string; name: string }[];
  action: SavingsGoalAction;
  goals: { id: string; name: string }[];
  today: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="entity-form compact-finance-form">
      <div className="form-section-title field-wide">
        <h2>Movimentar meta</h2>
        <p>Deposite ou retire valores jÃ¡ alocados a um objetivo.</p>
      </div>
      <label className="field">
        <span>Cofrinho</span>
        <select name="savingsGoalId" defaultValue="" required>
          <option value="" disabled>
            Selecione
          </option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tipo</span>
        <select name="type" defaultValue="DEPOSIT" required>
          <option value="DEPOSIT">DepÃ³sito</option>
          <option value="WITHDRAWAL">Retirada</option>
        </select>
      </label>
      <label className="field">
        <span>Valor</span>
        <input name="amount" inputMode="decimal" placeholder="0,00" required />
      </label>
      <label className="field">
        <span>Data</span>
        <input name="movementDate" type="date" defaultValue={today} required />
      </label>
      <label className="field">
        <span>Conta</span>
        <select name="accountId" defaultValue="">
          <option value="">Sem conta especÃ­fica</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-wide">
        <span>ObservaÃ§Ãµes</span>
        <textarea name="notes" maxLength={1000} rows={3} />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions field-wide">
        <FormSubmitButton label="Salvar movimento" />
      </div>
    </form>
  );
}

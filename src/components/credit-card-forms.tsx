"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type CardAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function CreditCardForm({
  accounts,
  action,
  contextId,
}: {
  accounts: { id: string; name: string }[];
  action: CardAction;
  contextId: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="entity-form compact-finance-form">
      <input name="contextId" type="hidden" value={contextId} />
      <div className="form-section-title field-wide">
        <h2>Novo cartão</h2>
        <p>Cadastre limite, fechamento e vencimento para organizar as faturas.</p>
      </div>
      <label className="field">
        <span>Nome</span>
        <input name="name" minLength={2} maxLength={100} placeholder="Ex.: Nubank" required />
      </label>
      <label className="field">
        <span>Instituição</span>
        <input name="institution" maxLength={100} placeholder="Banco emissor" />
      </label>
      <label className="field">
        <span>Limite</span>
        <input name="limit" inputMode="decimal" placeholder="0,00" required />
      </label>
      <label className="field">
        <span>Conta de pagamento</span>
        <select name="paymentAccountId" defaultValue="">
          <option value="">Sem conta padrão</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Fechamento</span>
        <input name="closingDay" type="number" min={1} max={31} defaultValue={20} required />
      </label>
      <label className="field">
        <span>Vencimento</span>
        <input name="dueDay" type="number" min={1} max={31} defaultValue={10} required />
      </label>
      <label className="field">
        <span>Cor</span>
        <input name="color" type="color" defaultValue="#e85d25" required />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.success ? <p className="inline-success">{state.success}</p> : null}
      <div className="form-actions field-wide">
        <FormSubmitButton label="Salvar cartão" />
      </div>
    </form>
  );
}

export function CreditCardPurchaseForm({
  action,
  cards,
  categories,
  today,
}: {
  action: CardAction;
  cards: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  today: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="entity-form compact-finance-form">
      <div className="form-section-title field-wide">
        <h2>Nova compra</h2>
        <p>Compras parceladas são distribuídas nas faturas futuras.</p>
      </div>
      <label className="field field-wide-on-mobile">
        <span>Descrição</span>
        <input name="description" minLength={2} maxLength={160} placeholder="Ex.: Mercado" required />
      </label>
      <label className="field">
        <span>Cartão</span>
        <select name="creditCardId" defaultValue="" required>
          <option value="" disabled>
            Selecione
          </option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Categoria</span>
        <select name="categoryId" defaultValue="">
          <option value="">Sem categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Valor total</span>
        <input name="totalAmount" inputMode="decimal" placeholder="0,00" required />
      </label>
      <label className="field">
        <span>Parcelas</span>
        <input name="installmentCount" type="number" min={1} max={48} defaultValue={1} required />
      </label>
      <label className="field">
        <span>Data</span>
        <input name="purchaseDate" type="date" defaultValue={today} required />
      </label>
      <label className="field field-wide">
        <span>Observações</span>
        <textarea name="notes" maxLength={1000} rows={3} />
      </label>
      {state.error ? <p className="form-error">{state.error}</p> : null}
      <div className="form-actions field-wide">
        <FormSubmitButton label="Adicionar compra" />
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type DebtFormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, months: number): string {
  if (!value) {
    return "";
  }

  const source = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(source.getTime())) {
    return "";
  }

  const targetMonth = source.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(source.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return dateInput(
    new Date(
      Date.UTC(source.getUTCFullYear(), targetMonth, Math.min(source.getUTCDate(), lastDay)),
    ),
  );
}

function inferredPaidCount(firstDueDate: string, installmentCount: number): number {
  if (!firstDueDate || installmentCount < 1) {
    return 0;
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let count = 0;

  for (let index = 0; index < installmentCount; index += 1) {
    if (new Date(`${addMonths(firstDueDate, index)}T00:00:00.000Z`) <= today) {
      count += 1;
    }
  }

  return count;
}

export function DebtForm({
  accounts,
  action,
  categories,
  currentEditorId,
  editors,
}: {
  accounts: { id: string; name: string }[];
  action: DebtFormAction;
  categories: { id: string; name: string }[];
  currentEditorId: string;
  editors: { id: string; displayName: string }[];
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const today = dateInput(new Date());
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [firstDueDate, setFirstDueDate] = useState(addMonths(today, 1));
  const [installmentCount, setInstallmentCount] = useState(1);
  const [existingDebt, setExistingDebt] = useState(false);
  const [paidInstallments, setPaidInstallments] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"CREDIT_CARD" | "OTHER">("CREDIT_CARD");
  const [totalAmount, setTotalAmount] = useState("");
  const [firstEditorId, setFirstEditorId] = useState(currentEditorId);
  const [firstShareAmount, setFirstShareAmount] = useState("");
  const [secondEditorId, setSecondEditorId] = useState("");
  const [secondShareAmount, setSecondShareAmount] = useState("");

  function updatePaidSuggestion(dueDate: string, count: number) {
    if (existingDebt) {
      setPaidInstallments(inferredPaidCount(dueDate, count));
    }
  }

  return (
    <form action={formAction} className="entity-form debt-form">
      <div className="form-section-title field-wide">
        <h2>Dados da compra</h2>
        <p>Identifique a dívida, valor total, categoria e forma de pagamento.</p>
      </div>

      <label className="field field-wide-on-mobile">
        <span>Descrição da compra ou dívida</span>
        <input
          name="description"
          type="text"
          minLength={2}
          maxLength={160}
          placeholder="Ex.: Bicicleta"
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span>Valor total</span>
        <input
          name="totalAmount"
          type="text"
          inputMode="decimal"
          value={totalAmount}
          onChange={(event) => {
            const nextValue = event.target.value;
            setTotalAmount(nextValue);
            if (!secondEditorId) {
              setFirstShareAmount(nextValue);
            }
          }}
          placeholder="0,00"
          required
        />
      </label>

      <label className="field">
        <span>Categoria</span>
        <select name="categoryId" defaultValue="" required>
          <option value="" disabled>
            Selecione
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Forma da dívida</span>
        <select
          name="paymentMethod"
          value={paymentMethod}
          onChange={(event) =>
            setPaymentMethod(event.target.value as "CREDIT_CARD" | "OTHER")
          }
        >
          <option value="CREDIT_CARD">Cartão de crédito</option>
          <option value="OTHER">Outra dívida</option>
        </select>
      </label>

      {paymentMethod === "CREDIT_CARD" ? (
        <label className="field">
          <span>Nome do cartão</span>
          <input name="cardName" type="text" maxLength={100} placeholder="Ex.: Cartão principal" required />
        </label>
      ) : (
        <input name="cardName" type="hidden" value="" />
      )}

      <label className="field">
        <span>Data da compra</span>
        <input
          name="purchaseDate"
          type="date"
          value={purchaseDate}
          onChange={(event) => {
            const nextPurchaseDate = event.target.value;
            const nextDueDate = addMonths(nextPurchaseDate, 1);
            setPurchaseDate(nextPurchaseDate);
            setFirstDueDate(nextDueDate);
            updatePaidSuggestion(nextDueDate, installmentCount);
          }}
          required
        />
      </label>

      <div className="form-section-title field-wide">
        <h2>Parcelamento</h2>
        <p>Defina datas e quantidade de parcelas geradas para acompanhamento.</p>
      </div>

      <label className="field">
        <span>Primeiro vencimento</span>
        <input
          name="firstDueDate"
          type="date"
          min={purchaseDate}
          value={firstDueDate}
          onChange={(event) => {
            setFirstDueDate(event.target.value);
            updatePaidSuggestion(event.target.value, installmentCount);
          }}
          required
        />
      </label>

      <label className="field">
        <span>Quantidade de parcelas</span>
        <input
          name="installmentCount"
          type="number"
          min={1}
          max={120}
          value={installmentCount}
          onChange={(event) => {
            const nextCount = Number(event.target.value);
            setInstallmentCount(nextCount);
            updatePaidSuggestion(firstDueDate, nextCount);
          }}
          required
        />
      </label>

      <div className="form-section-title field-wide">
        <h2>Dívida preexistente</h2>
        <p>Use somente quando parte das parcelas já havia sido paga antes do sistema.</p>
      </div>

      <label className="check-field field-wide">
        <input
          type="checkbox"
          checked={existingDebt}
          onChange={(event) => {
            setExistingDebt(event.target.checked);
            setPaidInstallments(
              event.target.checked ? inferredPaidCount(firstDueDate, installmentCount) : 0,
            );
          }}
        />
        <span>
          <strong>Esta dívida já existia antes do sistema</strong>
          <small>O número de parcelas teoricamente pagas será sugerido pelas datas.</small>
        </span>
      </label>

      <label className="field">
        <span>Parcelas já pagas</span>
        <input
          name="paidInstallments"
          type="number"
          min={0}
          max={installmentCount}
          value={paidInstallments}
          onChange={(event) => setPaidInstallments(Number(event.target.value))}
          readOnly={!existingDebt}
          required
        />
      </label>

      <label className="field">
        <span>Conta para o histórico</span>
        <select
          name="historicalAccountId"
          defaultValue=""
          required={existingDebt && paidInstallments > 0}
          disabled={!existingDebt || paidInstallments === 0}
        >
          <option value="">Selecione</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <small>Parcelas antigas entram no histórico sem reduzir novamente o saldo.</small>
      </label>

      <div className="form-section-title field-wide">
        <h2>Responsabilidade por pessoa</h2>
        <p>Distribua o valor total entre uma ou duas pessoas sem alterar a soma da dívida.</p>
      </div>

      <fieldset className="debt-split field-wide">
        <legend>Responsabilidade pela dívida</legend>
        <p>A soma dos valores individuais precisa ser igual ao valor total.</p>
        <div className="debt-split-grid">
          <label className="field">
            <span>Primeira pessoa</span>
            <select
              name="firstEditorId"
              value={firstEditorId}
              onChange={(event) => setFirstEditorId(event.target.value)}
              required
            >
              {editors.map((editor) => (
                <option key={editor.id} value={editor.id} disabled={editor.id === secondEditorId}>
                  {editor.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor da primeira pessoa</span>
            <input
              name="firstShareAmount"
              type="text"
              inputMode="decimal"
              value={firstShareAmount}
              onChange={(event) => setFirstShareAmount(event.target.value)}
              placeholder="0,00"
              required
            />
          </label>
          <label className="field">
            <span>Segunda pessoa</span>
            <select
              name="secondEditorId"
              value={secondEditorId}
              onChange={(event) => {
                setSecondEditorId(event.target.value);
                if (!event.target.value) {
                  setSecondShareAmount("");
                  setFirstShareAmount(totalAmount);
                }
              }}
            >
              <option value="">Compra individual</option>
              {editors.map((editor) => (
                <option key={editor.id} value={editor.id} disabled={editor.id === firstEditorId}>
                  {editor.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor da segunda pessoa</span>
            <input
              name="secondShareAmount"
              type="text"
              inputMode="decimal"
              value={secondShareAmount}
              onChange={(event) => setSecondShareAmount(event.target.value)}
              placeholder="0,00"
              disabled={!secondEditorId}
              required={Boolean(secondEditorId)}
            />
          </label>
        </div>
      </fieldset>

      <div className="form-section-title field-wide">
        <h2>Observações</h2>
        <p>Registre contexto adicional para consulta futura.</p>
      </div>

      <label className="field field-wide">
        <span>Observações</span>
        <textarea name="notes" maxLength={1000} rows={4} />
      </label>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="form-actions field-wide">
        <Link className="secondary-button" href="/dividas">
          Cancelar
        </Link>
        <FormSubmitButton label="Cadastrar dívida" />
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useActionState } from "react";

import { FormSubmitButton } from "@/components/form-submit-button";
import {
  INITIAL_ACTION_STATE,
  type ActionState,
} from "@/modules/shared/application/action-state";

type AdjustmentAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const BRAZILIAN_MONEY_INPUT_PATTERN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;
const DATABASE_MONEY_INPUT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function parseMoneyCents(value: string): bigint | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const usesBrazilianFormat = trimmedValue.includes(",");
  const matchesExpectedFormat = usesBrazilianFormat
    ? BRAZILIAN_MONEY_INPUT_PATTERN.test(trimmedValue)
    : DATABASE_MONEY_INPUT_PATTERN.test(trimmedValue);

  if (!matchesExpectedFormat) {
    return null;
  }

  const normalizedValue = usesBrazilianFormat
    ? trimmedValue.replace(/\./g, "").replace(",", ".")
    : trimmedValue;
  const [wholePart, decimalPart = ""] = normalizedValue.split(".");

  return BigInt(wholePart) * BigInt(100) + BigInt(decimalPart.padEnd(2, "0"));
}

function formatCents(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const whole = absolute / BigInt(100);
  const cents = String(absolute % BigInt(100)).padStart(2, "0");
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${negative ? "-" : ""}R$ ${groupedWhole},${cents}`;
}

export function AccountBalanceAdjustmentForm({
  accountId,
  accountName,
  action,
  currentBalanceCents,
  currentBalanceLabel,
  version,
}: {
  accountId: string;
  accountName: string;
  action: AdjustmentAction;
  currentBalanceCents: string;
  currentBalanceLabel: string;
  version: number;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [informedBalance, setInformedBalance] = useState("");
  const calculatedCents = useMemo(() => BigInt(currentBalanceCents), [currentBalanceCents]);
  const informedCents = useMemo(() => parseMoneyCents(informedBalance), [informedBalance]);
  const difference = informedCents === null ? null : informedCents - calculatedCents;

  return (
    <form action={formAction} className="entity-form">
      <input name="id" type="hidden" value={accountId} />
      <input name="version" type="hidden" value={version} />

      <div className="form-section-title field-wide">
        <h2>Conciliar saldo atual</h2>
        <p>Registre o saldo real observado sem alterar o saldo inicial nem o histórico.</p>
      </div>

      <section className="summary-strip field-wide" aria-label="Saldo calculado da conta">
        <span>{accountName}</span>
        <strong>{currentBalanceLabel}</strong>
        <small>Saldo calculado imediatamente antes da conciliação.</small>
      </section>

      <label className="field">
        <span>Saldo real informado</span>
        <input
          name="informedBalance"
          type="text"
          inputMode="decimal"
          value={informedBalance}
          onChange={(event) => setInformedBalance(event.target.value)}
          placeholder="0,00"
          autoFocus
          required
        />
      </label>

      <div className="field">
        <span>Diferença que será aplicada</span>
        <strong className={difference !== null && difference < BigInt(0) ? "value-expense" : "value-income"}>
          {difference === null ? "Informe um saldo válido" : formatCents(difference)}
        </strong>
      </div>

      <label className="field field-wide">
        <span>Observação</span>
        <textarea name="notes" maxLength={1000} rows={4} placeholder="Ex.: conciliação com extrato bancário" />
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
        <FormSubmitButton label="Registrar ajuste" />
      </div>
    </form>
  );
}
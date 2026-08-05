import type Decimal from "decimal.js";

export function formatCurrency(value: Decimal.Value, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number(value));
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value);
}

export function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

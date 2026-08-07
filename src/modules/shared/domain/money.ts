import Decimal from "decimal.js";

const MONEY_SCALE = 2;
const MINOR_UNIT = new Decimal(1).dividedBy(new Decimal(10).pow(MONEY_SCALE));

Decimal.set({
  precision: 24,
  rounding: Decimal.ROUND_HALF_UP,
});

export type MoneyInput = Decimal.Value;

const BRAZILIAN_MONEY_INPUT_PATTERN = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;
const DATABASE_MONEY_INPUT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const MAX_MONEY_INPUT = new Decimal(10).pow(17).minus(MINOR_UNIT);

export function parseMoneyInput(value: string): Decimal {
  const trimmedValue = value.trim();
  const usesBrazilianFormat = trimmedValue.includes(",");
  const matchesExpectedFormat = usesBrazilianFormat
    ? BRAZILIAN_MONEY_INPUT_PATTERN.test(trimmedValue)
    : DATABASE_MONEY_INPUT_PATTERN.test(trimmedValue);

  if (!matchesExpectedFormat) {
    throw new TypeError("Informe um valor monetário válido.");
  }

  const normalizedValue = usesBrazilianFormat
    ? trimmedValue.replace(/\./g, "").replace(",", ".")
    : trimmedValue;
  const parsedValue = money(normalizedValue);

  if (!parsedValue.isFinite() || parsedValue.greaterThan(MAX_MONEY_INPUT)) {
    throw new TypeError("Informe um valor monetário válido.");
  }

  return parsedValue;
}

export function money(value: MoneyInput): Decimal {
  return new Decimal(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return money(values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0)));
}

export function allocateMoney(total: MoneyInput, installmentCount: number): Decimal[] {
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
    throw new RangeError("A quantidade de parcelas deve ser um número inteiro positivo.");
  }

  const normalizedTotal = money(total);

  if (normalizedTotal.isNegative()) {
    throw new RangeError("O valor total não pode ser negativo.");
  }
  const baseInstallment = normalizedTotal
    .dividedBy(installmentCount)
    .toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_DOWN);
  const residualUnits = normalizedTotal
    .minus(baseInstallment.times(installmentCount))
    .dividedBy(MINOR_UNIT)
    .toNumber();

  return Array.from({ length: installmentCount }, (_, index) =>
    index < residualUnits ? baseInstallment.plus(MINOR_UNIT) : baseInstallment,
  );
}

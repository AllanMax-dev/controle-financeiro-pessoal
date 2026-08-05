import Decimal from "decimal.js";

const MONEY_SCALE = 2;
const MINOR_UNIT = new Decimal(1).dividedBy(new Decimal(10).pow(MONEY_SCALE));

Decimal.set({
  precision: 24,
  rounding: Decimal.ROUND_HALF_UP,
});

export type MoneyInput = Decimal.Value;

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

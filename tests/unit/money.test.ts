import { describe, expect, it } from "vitest";

import {
  allocateMoney,
  money,
  parseMoneyInput,
  sumMoney,
} from "../../src/modules/shared/domain/money";

describe("money", () => {
  it("rounds monetary values to two decimal places using half up", () => {
    expect(money("10.005").toFixed(2)).toBe("10.01");
    expect(money("10.004").toFixed(2)).toBe("10.00");
  });

  it("sums values without floating-point drift", () => {
    expect(sumMoney(["0.10", "0.20"]).toFixed(2)).toBe("0.30");
  });

  it("parses Brazilian and database monetary formats", () => {
    expect(parseMoneyInput("1.234,56").toFixed(2)).toBe("1234.56");
    expect(parseMoneyInput("3.000,01").toFixed(2)).toBe("3000.01");
    expect(parseMoneyInput("1234.56").toFixed(2)).toBe("1234.56");
  });

  it("rejects ambiguous or malformed monetary inputs", () => {
    for (const input of ["1.2.3,45", "1.2,34", "1e3", "1 2 3", "0,005", "1,999"]) {
      expect(() => parseMoneyInput(input)).toThrow(TypeError);
    }
  });

  it("distributes residual cents while preserving the exact total", () => {
    const installments = allocateMoney("100.00", 3);

    expect(installments.map((value) => value.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(sumMoney(installments).toFixed(2)).toBe("100.00");
  });

  it("rejects an invalid installment count", () => {
    expect(() => allocateMoney("100.00", 0)).toThrow(RangeError);
    expect(() => allocateMoney("100.00", 2.5)).toThrow(RangeError);
    expect(() => allocateMoney("-1.00", 2)).toThrow(RangeError);
  });
});

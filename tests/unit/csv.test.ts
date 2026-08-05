import { describe, expect, it } from "vitest";

import { protectSpreadsheetFormula } from "../../src/modules/reports/domain/csv";

describe("CSV export", () => {
  it("neutralizes spreadsheet formulas in user-provided text", () => {
    expect(protectSpreadsheetFormula("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(protectSpreadsheetFormula("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(protectSpreadsheetFormula("  @SUM(A1:A2)")).toBe("'  @SUM(A1:A2)");
    expect(protectSpreadsheetFormula("Descrição comum")).toBe("Descrição comum");
  });
});

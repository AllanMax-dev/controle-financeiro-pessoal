import { describe, expect, it } from "vitest";

import {
  financialContextIds,
  financialContextWhere,
  originLabelForContext,
  transferContextWhere,
  type FinancialDataScope,
} from "../../src/modules/financial-contexts/application/financial-contexts";

function makeCoupleScope(): FinancialDataScope {
  const allan = {
    id: "allan-personal",
    name: "Allan",
    ownerEditorId: "allan-editor",
    ownerName: "Allan",
    type: "PERSONAL" as const,
  };
  const mayara = {
    id: "mayara-personal",
    name: "Mayara",
    ownerEditorId: "mayara-editor",
    ownerName: "Mayara",
    type: "PERSONAL" as const,
  };
  const casal = {
    id: "legacy-couple",
    name: "Casal",
    ownerEditorId: null,
    ownerName: null,
    type: "COUPLE" as const,
  };

  return {
    contextIds: [allan.id, mayara.id, casal.id],
    contextsById: {
      [allan.id]: allan,
      [mayara.id]: mayara,
      [casal.id]: casal,
    },
    current: casal,
    mode: "COUPLE",
    writeContext: allan,
  };
}

describe("financial context scope", () => {
  it("builds an aggregate couple filter without duplicating context ids", () => {
    const scope = makeCoupleScope();

    expect(financialContextIds(scope)).toEqual(["allan-personal", "mayara-personal", "legacy-couple"]);
    expect(financialContextWhere(scope)).toEqual({
      contextId: { in: ["allan-personal", "mayara-personal", "legacy-couple"] },
    });
    expect(transferContextWhere(scope)).toEqual({
      OR: [
        { sourceContextId: { in: ["allan-personal", "mayara-personal", "legacy-couple"] } },
        { destinationContextId: { in: ["allan-personal", "mayara-personal", "legacy-couple"] } },
      ],
    });
  });

  it("uses the owner name as the discreet origin label in couple mode", () => {
    expect(originLabelForContext(makeCoupleScope(), "mayara-personal")).toBe("Mayara");
  });
});

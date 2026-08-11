CREATE TYPE "FinancialContextMemberRole" AS ENUM ('MEMBER');

CREATE TABLE "FinancialContextMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL,
    "financialContextId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "role" "FinancialContextMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialContextMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialContextMember_financialContextId_editorId_key" ON "FinancialContextMember"("financialContextId", "editorId");
CREATE INDEX "FinancialContextMember_workspaceId_editorId_idx" ON "FinancialContextMember"("workspaceId", "editorId");
CREATE INDEX "FinancialContextMember_workspaceId_financialContextId_idx" ON "FinancialContextMember"("workspaceId", "financialContextId");

ALTER TABLE "FinancialContextMember" ADD CONSTRAINT "FinancialContextMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialContextMember" ADD CONSTRAINT "FinancialContextMember_financialContextId_fkey" FOREIGN KEY ("financialContextId") REFERENCES "FinancialContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialContextMember" ADD CONSTRAINT "FinancialContextMember_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "Editor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FinancialContextMember" ("workspaceId", "financialContextId", "editorId")
SELECT couple."workspaceId", couple."id", editor."id"
FROM "FinancialContext" couple
JOIN "Editor" editor
  ON editor."workspaceId" = couple."workspaceId"
 AND editor."active" = true
 AND editor."displayName" IN ('Allan', 'Mayara')
JOIN "FinancialContext" personal
  ON personal."workspaceId" = couple."workspaceId"
 AND personal."type" = 'PERSONAL'
 AND personal."ownerEditorId" = editor."id"
WHERE couple."type" = 'COUPLE'
  AND couple."name" = 'Casal'
  AND couple."active" = true
ON CONFLICT ("financialContextId", "editorId") DO NOTHING;

ALTER TABLE "Transaction" ADD COLUMN "creditCardInvoiceId" UUID;

CREATE INDEX "Transaction_creditCardInvoiceId_idx" ON "Transaction"("creditCardInvoiceId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_creditCardInvoiceId_fkey" FOREIGN KEY ("creditCardInvoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

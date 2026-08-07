ALTER TYPE "AccountType" ADD VALUE IF NOT EXISTS 'INVESTMENT';

ALTER TABLE "FinancialAccount" ADD COLUMN "ownerEditorId" UUID;

ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_ownerEditorId_fkey"
FOREIGN KEY ("ownerEditorId") REFERENCES "Editor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FinancialAccount_workspaceId_ownerEditorId_idx"
ON "FinancialAccount"("workspaceId", "ownerEditorId");

CREATE INDEX "FinancialAccount_workspaceId_type_idx" ON "FinancialAccount"("workspaceId", "type");

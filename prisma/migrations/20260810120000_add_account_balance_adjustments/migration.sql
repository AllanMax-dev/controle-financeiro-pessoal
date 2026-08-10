CREATE TABLE "AccountBalanceAdjustment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "previousBalance" DECIMAL(19,2) NOT NULL,
    "informedBalance" DECIMAL(19,2) NOT NULL,
    "difference" DECIMAL(19,2) NOT NULL,
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountBalanceAdjustment_workspaceId_effectiveAt_idx" ON "AccountBalanceAdjustment"("workspaceId", "effectiveAt");
CREATE INDEX "AccountBalanceAdjustment_accountId_effectiveAt_idx" ON "AccountBalanceAdjustment"("accountId", "effectiveAt");
CREATE INDEX "AccountBalanceAdjustment_editorId_idx" ON "AccountBalanceAdjustment"("editorId");

ALTER TABLE "AccountBalanceAdjustment" ADD CONSTRAINT "AccountBalanceAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountBalanceAdjustment" ADD CONSTRAINT "AccountBalanceAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountBalanceAdjustment" ADD CONSTRAINT "AccountBalanceAdjustment_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TYPE "CreditCardPurchaseInstallmentStatus" ADD VALUE IF NOT EXISTS 'PAID';

CREATE TABLE "DebtInstallmentShare" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "installmentId" UUID NOT NULL,
  "personEditorId" UUID NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "paidAt" DATE,
  "status" "DebtInstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DebtInstallmentShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardInstallmentShare" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "installmentId" UUID NOT NULL,
  "personEditorId" UUID NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "status" "CreditCardPurchaseInstallmentStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditCardInstallmentShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DebtInstallmentShare_installmentId_personEditorId_key" ON "DebtInstallmentShare"("installmentId", "personEditorId");
CREATE INDEX "DebtInstallmentShare_workspaceId_personEditorId_status_idx" ON "DebtInstallmentShare"("workspaceId", "personEditorId", "status");

CREATE UNIQUE INDEX "CreditCardInstallmentShare_installmentId_personEditorId_key" ON "CreditCardInstallmentShare"("installmentId", "personEditorId");
CREATE INDEX "CreditCardInstallmentShare_workspaceId_personEditorId_status_idx" ON "CreditCardInstallmentShare"("workspaceId", "personEditorId", "status");

ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT "DebtInstallmentShare_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT "DebtInstallmentShare_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "DebtInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT "DebtInstallmentShare_personEditorId_fkey" FOREIGN KEY ("personEditorId") REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditCardInstallmentShare" ADD CONSTRAINT "CreditCardInstallmentShare_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardInstallmentShare" ADD CONSTRAINT "CreditCardInstallmentShare_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "CreditCardInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardInstallmentShare" ADD CONSTRAINT "CreditCardInstallmentShare_personEditorId_fkey" FOREIGN KEY ("personEditorId") REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT "DebtInstallmentShare_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CreditCardInstallmentShare" ADD CONSTRAINT "CreditCardInstallmentShare_amount_positive" CHECK ("amount" > 0);

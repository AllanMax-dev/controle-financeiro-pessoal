-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "FinancialContextType" AS ENUM ('PERSONAL', 'COUPLE');

-- CreateEnum
CREATE TYPE "CreditCardInvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "CreditCardPurchaseInstallmentStatus" AS ENUM ('OPEN', 'CANCELED');

-- CreateEnum
CREATE TYPE "SavingsGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SavingsGoalMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateTable
CREATE TABLE "FinancialContext" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerEditorId" UUID,
    "type" "FinancialContextType" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FinancialContext_pkey" PRIMARY KEY ("id")
);

-- Seed contexts before wiring legacy rows.
INSERT INTO "FinancialContext" ("id", "workspaceId", "ownerEditorId", "type", "name", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), w."id", NULL, 'COUPLE', 'Casal', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace" w;

INSERT INTO "FinancialContext" ("id", "workspaceId", "ownerEditorId", "type", "name", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid(), e."workspaceId", e."id", 'PERSONAL', e."displayName", e."active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Editor" e;

-- Add nullable context columns so existing data can be classified safely.
ALTER TABLE "FinancialAccount" ADD COLUMN "contextId" UUID;
ALTER TABLE "Category" ADD COLUMN "contextId" UUID;
ALTER TABLE "Transaction" ADD COLUMN "contextId" UUID;
ALTER TABLE "Transfer" ADD COLUMN "sourceContextId" UUID;
ALTER TABLE "Transfer" ADD COLUMN "destinationContextId" UUID;
ALTER TABLE "AccountBalanceAdjustment" ADD COLUMN "contextId" UUID;
ALTER TABLE "Budget" ADD COLUMN "contextId" UUID;
ALTER TABLE "FixedExpense" ADD COLUMN "contextId" UUID;
ALTER TABLE "Salary" ADD COLUMN "contextId" UUID;
ALTER TABLE "Debt" ADD COLUMN "contextId" UUID;
ALTER TABLE "AuditLog" ADD COLUMN "contextId" UUID;

-- Unambiguous legacy mapping: accounts already owned by an editor become personal; shared accounts become Casal.
UPDATE "FinancialAccount" a
SET "contextId" = COALESCE(personal."id", couple."id")
FROM "FinancialContext" couple
LEFT JOIN "FinancialContext" personal
  ON personal."workspaceId" = couple."workspaceId"
 AND personal."type" = 'PERSONAL'
 AND personal."ownerEditorId" = a."ownerEditorId"
WHERE couple."workspaceId" = a."workspaceId"
  AND couple."type" = 'COUPLE'
  AND a."contextId" IS NULL;

-- Categories had no owner information. Preserve all existing rows in Casal instead of guessing a personal owner.
UPDATE "Category" c
SET "contextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = c."workspaceId"
  AND couple."type" = 'COUPLE'
  AND c."contextId" IS NULL;

UPDATE "Transaction" t
SET "contextId" = a."contextId"
FROM "FinancialAccount" a
WHERE a."id" = t."accountId"
  AND t."contextId" IS NULL;

UPDATE "Transfer" tr
SET "sourceContextId" = source_account."contextId",
    "destinationContextId" = destination_account."contextId"
FROM "FinancialAccount" source_account, "FinancialAccount" destination_account
WHERE source_account."id" = tr."sourceAccountId"
  AND destination_account."id" = tr."destinationAccountId"
  AND (tr."sourceContextId" IS NULL OR tr."destinationContextId" IS NULL);

UPDATE "AccountBalanceAdjustment" adj
SET "contextId" = a."contextId"
FROM "FinancialAccount" a
WHERE a."id" = adj."accountId"
  AND adj."contextId" IS NULL;

UPDATE "Budget" b
SET "contextId" = c."contextId"
FROM "Category" c
WHERE c."id" = b."categoryId"
  AND b."contextId" IS NULL;

UPDATE "FixedExpense" f
SET "contextId" = a."contextId"
FROM "FinancialAccount" a
WHERE a."id" = f."accountId"
  AND f."contextId" IS NULL;

UPDATE "Salary" s
SET "contextId" = a."contextId"
FROM "FinancialAccount" a
WHERE a."id" = s."accountId"
  AND s."contextId" IS NULL;

WITH debt_single_editor AS (
  SELECT d."id" AS "debtId", MIN(dis."editorId") AS "editorId", COUNT(DISTINCT dis."editorId") AS "editorCount"
  FROM "Debt" d
  LEFT JOIN "DebtInstallment" di ON di."debtId" = d."id"
  LEFT JOIN "DebtInstallmentShare" dis ON dis."installmentId" = di."id"
  GROUP BY d."id"
)
UPDATE "Debt" d
SET "contextId" = COALESCE(personal."id", couple."id")
FROM debt_single_editor owners, "FinancialContext" couple
LEFT JOIN "FinancialContext" personal
  ON personal."workspaceId" = couple."workspaceId"
 AND personal."type" = 'PERSONAL'
 AND personal."ownerEditorId" = owners."editorId"
 AND owners."editorCount" = 1
WHERE owners."debtId" = d."id"
  AND couple."workspaceId" = d."workspaceId"
  AND couple."type" = 'COUPLE'
  AND d."contextId" IS NULL;

-- Final fallback for defensive compatibility with partially populated legacy databases.
UPDATE "Transaction" t SET "contextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = t."workspaceId" AND couple."type" = 'COUPLE' AND t."contextId" IS NULL;

UPDATE "Transfer" tr SET "sourceContextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = tr."workspaceId" AND couple."type" = 'COUPLE' AND tr."sourceContextId" IS NULL;

UPDATE "Transfer" tr SET "destinationContextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = tr."workspaceId" AND couple."type" = 'COUPLE' AND tr."destinationContextId" IS NULL;

UPDATE "AccountBalanceAdjustment" adj SET "contextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = adj."workspaceId" AND couple."type" = 'COUPLE' AND adj."contextId" IS NULL;

UPDATE "Budget" b SET "contextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = b."workspaceId" AND couple."type" = 'COUPLE' AND b."contextId" IS NULL;

UPDATE "FixedExpense" f SET "contextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = f."workspaceId" AND couple."type" = 'COUPLE' AND f."contextId" IS NULL;

UPDATE "Salary" s SET "contextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = s."workspaceId" AND couple."type" = 'COUPLE' AND s."contextId" IS NULL;

UPDATE "Debt" d SET "contextId" = couple."id"
FROM "FinancialContext" couple
WHERE couple."workspaceId" = d."workspaceId" AND couple."type" = 'COUPLE' AND d."contextId" IS NULL;

-- Enforce context on all financial data after classification.
ALTER TABLE "FinancialAccount" ALTER COLUMN "contextId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "contextId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "contextId" SET NOT NULL;
ALTER TABLE "Transfer" ALTER COLUMN "sourceContextId" SET NOT NULL;
ALTER TABLE "Transfer" ALTER COLUMN "destinationContextId" SET NOT NULL;
ALTER TABLE "AccountBalanceAdjustment" ALTER COLUMN "contextId" SET NOT NULL;
ALTER TABLE "Budget" ALTER COLUMN "contextId" SET NOT NULL;
ALTER TABLE "FixedExpense" ALTER COLUMN "contextId" SET NOT NULL;
ALTER TABLE "Salary" ALTER COLUMN "contextId" SET NOT NULL;
ALTER TABLE "Debt" ALTER COLUMN "contextId" SET NOT NULL;

-- Replace workspace-wide uniqueness with context-scoped uniqueness.
ALTER TABLE "FinancialAccount" DROP CONSTRAINT IF EXISTS "FinancialAccount_workspaceId_name_key";
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_workspaceId_kind_name_key";
ALTER TABLE "Budget" DROP CONSTRAINT IF EXISTS "Budget_workspaceId_categoryId_month_key";

CREATE UNIQUE INDEX "FinancialContext_workspaceId_name_key" ON "FinancialContext"("workspaceId", "name");
CREATE INDEX "FinancialContext_workspaceId_active_type_idx" ON "FinancialContext"("workspaceId", "active", "type");
CREATE INDEX "FinancialContext_workspaceId_ownerEditorId_idx" ON "FinancialContext"("workspaceId", "ownerEditorId");
CREATE UNIQUE INDEX "FinancialAccount_contextId_name_key" ON "FinancialAccount"("contextId", "name");
CREATE INDEX "FinancialAccount_workspaceId_contextId_active_idx" ON "FinancialAccount"("workspaceId", "contextId", "active");
CREATE UNIQUE INDEX "Category_contextId_kind_name_key" ON "Category"("contextId", "kind", "name");
CREATE INDEX "Category_workspaceId_contextId_kind_active_idx" ON "Category"("workspaceId", "contextId", "kind", "active");
CREATE INDEX "Transaction_workspaceId_contextId_competenceDate_idx" ON "Transaction"("workspaceId", "contextId", "competenceDate");
CREATE INDEX "Transfer_workspaceId_sourceContextId_transferDate_idx" ON "Transfer"("workspaceId", "sourceContextId", "transferDate");
CREATE INDEX "Transfer_workspaceId_destinationContextId_transferDate_idx" ON "Transfer"("workspaceId", "destinationContextId", "transferDate");
CREATE INDEX "AccountBalanceAdjustment_workspaceId_contextId_effectiveAt_idx" ON "AccountBalanceAdjustment"("workspaceId", "contextId", "effectiveAt");
CREATE UNIQUE INDEX "Budget_contextId_categoryId_month_key" ON "Budget"("contextId", "categoryId", "month");
CREATE INDEX "Budget_workspaceId_contextId_month_idx" ON "Budget"("workspaceId", "contextId", "month");
CREATE INDEX "FixedExpense_workspaceId_contextId_active_startMonth_idx" ON "FixedExpense"("workspaceId", "contextId", "active", "startMonth");
CREATE INDEX "Salary_workspaceId_contextId_active_startMonth_idx" ON "Salary"("workspaceId", "contextId", "active", "startMonth");
CREATE INDEX "Debt_workspaceId_contextId_purchaseDate_idx" ON "Debt"("workspaceId", "contextId", "purchaseDate");
CREATE INDEX "AuditLog_workspaceId_contextId_createdAt_idx" ON "AuditLog"("workspaceId", "contextId", "createdAt");

CREATE TABLE "CreditCard" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "paymentAccountId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "institution" VARCHAR(100),
    "limit" DECIMAL(19,2) NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "color" VARCHAR(7),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardInvoice" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "creditCardId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "status" "CreditCardInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "closesAt" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreditCardInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardPurchase" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "creditCardId" UUID NOT NULL,
    "categoryId" UUID,
    "description" VARCHAR(160) NOT NULL,
    "totalAmount" DECIMAL(19,2) NOT NULL,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "purchaseDate" DATE NOT NULL,
    "firstInvoiceMonth" DATE NOT NULL,
    "notes" VARCHAR(1000),
    "canceledAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreditCardPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardPurchaseInstallment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "dueMonth" DATE NOT NULL,
    "status" "CreditCardPurchaseInstallmentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardPurchaseInstallment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavingsGoal" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "accountId" UUID,
    "name" VARCHAR(100) NOT NULL,
    "targetAmount" DECIMAL(19,2) NOT NULL,
    "deadline" DATE,
    "description" VARCHAR(1000),
    "status" "SavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavingsGoalMovement" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contextId" UUID NOT NULL,
    "savingsGoalId" UUID NOT NULL,
    "accountId" UUID,
    "editorId" UUID NOT NULL,
    "type" "SavingsGoalMovementType" NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "movementDate" DATE NOT NULL,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsGoalMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCard_contextId_name_key" ON "CreditCard"("contextId", "name");
CREATE INDEX "CreditCard_workspaceId_contextId_active_idx" ON "CreditCard"("workspaceId", "contextId", "active");
CREATE INDEX "CreditCard_paymentAccountId_idx" ON "CreditCard"("paymentAccountId");
CREATE UNIQUE INDEX "CreditCardInvoice_creditCardId_month_key" ON "CreditCardInvoice"("creditCardId", "month");
CREATE INDEX "CreditCardInvoice_workspaceId_contextId_month_idx" ON "CreditCardInvoice"("workspaceId", "contextId", "month");
CREATE INDEX "CreditCardInvoice_creditCardId_status_idx" ON "CreditCardInvoice"("creditCardId", "status");
CREATE INDEX "CreditCardPurchase_workspaceId_contextId_purchaseDate_idx" ON "CreditCardPurchase"("workspaceId", "contextId", "purchaseDate");
CREATE INDEX "CreditCardPurchase_creditCardId_purchaseDate_idx" ON "CreditCardPurchase"("creditCardId", "purchaseDate");
CREATE INDEX "CreditCardPurchase_categoryId_idx" ON "CreditCardPurchase"("categoryId");
CREATE UNIQUE INDEX "CreditCardPurchaseInstallment_purchaseId_number_key" ON "CreditCardPurchaseInstallment"("purchaseId", "number");
CREATE INDEX "CreditCardPurchaseInstallment_workspaceId_contextId_dueMonth_idx" ON "CreditCardPurchaseInstallment"("workspaceId", "contextId", "dueMonth");
CREATE INDEX "CreditCardPurchaseInstallment_invoiceId_idx" ON "CreditCardPurchaseInstallment"("invoiceId");
CREATE UNIQUE INDEX "SavingsGoal_contextId_name_key" ON "SavingsGoal"("contextId", "name");
CREATE INDEX "SavingsGoal_workspaceId_contextId_status_idx" ON "SavingsGoal"("workspaceId", "contextId", "status");
CREATE INDEX "SavingsGoal_accountId_idx" ON "SavingsGoal"("accountId");
CREATE INDEX "SavingsGoalMovement_workspaceId_contextId_movementDate_idx" ON "SavingsGoalMovement"("workspaceId", "contextId", "movementDate");
CREATE INDEX "SavingsGoalMovement_savingsGoalId_movementDate_idx" ON "SavingsGoalMovement"("savingsGoalId", "movementDate");
CREATE INDEX "SavingsGoalMovement_accountId_idx" ON "SavingsGoalMovement"("accountId");

ALTER TABLE "FinancialContext" ADD CONSTRAINT "FinancialContext_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialContext" ADD CONSTRAINT "FinancialContext_ownerEditorId_fkey" FOREIGN KEY ("ownerEditorId") REFERENCES "Editor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_sourceContextId_fkey" FOREIGN KEY ("sourceContextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destinationContextId_fkey" FOREIGN KEY ("destinationContextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountBalanceAdjustment" ADD CONSTRAINT "AccountBalanceAdjustment_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchaseInstallment" ADD CONSTRAINT "CreditCardPurchaseInstallment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchaseInstallment" ADD CONSTRAINT "CreditCardPurchaseInstallment_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchaseInstallment" ADD CONSTRAINT "CreditCardPurchaseInstallment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "CreditCardPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditCardPurchaseInstallment" ADD CONSTRAINT "CreditCardPurchaseInstallment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SavingsGoalMovement" ADD CONSTRAINT "SavingsGoalMovement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavingsGoalMovement" ADD CONSTRAINT "SavingsGoalMovement_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "FinancialContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavingsGoalMovement" ADD CONSTRAINT "SavingsGoalMovement_savingsGoalId_fkey" FOREIGN KEY ("savingsGoalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavingsGoalMovement" ADD CONSTRAINT "SavingsGoalMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SavingsGoalMovement" ADD CONSTRAINT "SavingsGoalMovement_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

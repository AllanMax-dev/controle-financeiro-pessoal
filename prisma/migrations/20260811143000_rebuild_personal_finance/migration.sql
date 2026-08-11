-- Rebuild financial domain from zero.
-- Preserved tables and data: "Workspace", "Editor", "AccessGrant", "AccessSession".
-- Destructive by design: all previous financial records are discarded.

DROP TABLE IF EXISTS "SavingsGoalMovement" CASCADE;
DROP TABLE IF EXISTS "SavingsGoal" CASCADE;
DROP TABLE IF EXISTS "CreditCardInvoicePayment" CASCADE;
DROP TABLE IF EXISTS "CreditCardPurchaseInstallment" CASCADE;
DROP TABLE IF EXISTS "CreditCardInstallment" CASCADE;
DROP TABLE IF EXISTS "CreditCardPurchase" CASCADE;
DROP TABLE IF EXISTS "CreditCardInvoice" CASCADE;
DROP TABLE IF EXISTS "CreditCard" CASCADE;
DROP TABLE IF EXISTS "DebtInstallmentShare" CASCADE;
DROP TABLE IF EXISTS "DebtInstallment" CASCADE;
DROP TABLE IF EXISTS "Debt" CASCADE;
DROP TABLE IF EXISTS "Salary" CASCADE;
DROP TABLE IF EXISTS "FixedExpense" CASCADE;
DROP TABLE IF EXISTS "Budget" CASCADE;
DROP TABLE IF EXISTS "Transfer" CASCADE;
DROP TABLE IF EXISTS "Transaction" CASCADE;
DROP TABLE IF EXISTS "AccountBalanceAdjustment" CASCADE;
DROP TABLE IF EXISTS "BalanceAdjustment" CASCADE;
DROP TABLE IF EXISTS "Category" CASCADE;
DROP TABLE IF EXISTS "FinancialAccount" CASCADE;
DROP TABLE IF EXISTS "FinancialContextMember" CASCADE;
DROP TABLE IF EXISTS "FinancialContext" CASCADE;
DROP TABLE IF EXISTS "Investment" CASCADE;
DROP TABLE IF EXISTS "AuditLog" CASCADE;

DROP TYPE IF EXISTS "FinancialContextMemberRole" CASCADE;
DROP TYPE IF EXISTS "FinancialContextType" CASCADE;
DROP TYPE IF EXISTS "DebtPaymentMethod" CASCADE;

CREATE TABLE "FinancialAccount" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "institution" VARCHAR(100),
  "type" "AccountType" NOT NULL,
  "initialBalance" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "color" VARCHAR(7),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByEditorId" UUID,
  "updatedByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialAccount_workspaceId_personEditorId_name_key" UNIQUE ("workspaceId", "personEditorId", "name")
);

CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "kind" "CategoryKind" NOT NULL,
  "color" VARCHAR(7),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Category_workspaceId_kind_name_key" UNIQUE ("workspaceId", "kind", "name")
);

CREATE TABLE "FixedExpense" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" UUID REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "categoryId" UUID REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "description" VARCHAR(160) NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "dueDay" INTEGER NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startMonth" DATE NOT NULL,
  "endedAt" DATE,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByEditorId" UUID,
  "updatedByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Salary" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" UUID REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "categoryId" UUID REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "description" VARCHAR(160) NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "frequency" "SalaryFrequency" NOT NULL DEFAULT 'MONTHLY',
  "paymentDay" INTEGER NOT NULL,
  "startMonth" DATE NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" DATE,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByEditorId" UUID,
  "updatedByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Salary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Debt" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "categoryId" UUID REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "description" VARCHAR(160) NOT NULL,
  "totalAmount" DECIMAL(19,2) NOT NULL,
  "startDate" DATE NOT NULL,
  "firstDueDate" DATE NOT NULL,
  "installmentCount" INTEGER NOT NULL,
  "frequency" "DebtInstallmentFrequency" NOT NULL DEFAULT 'MONTHLY',
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "canceledAt" DATE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByEditorId" UUID,
  "updatedByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DebtInstallment" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "debtId" UUID NOT NULL REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "number" INTEGER NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "dueDate" DATE NOT NULL,
  "paidAt" DATE,
  "status" "DebtInstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DebtInstallment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DebtInstallment_debtId_number_key" UNIQUE ("debtId", "number")
);

CREATE TABLE "CreditCard" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "paymentAccountId" UUID REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "name" VARCHAR(100) NOT NULL,
  "institution" VARCHAR(100),
  "limit" DECIMAL(19,2) NOT NULL,
  "closingDay" INTEGER NOT NULL,
  "dueDay" INTEGER NOT NULL,
  "color" VARCHAR(7),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByEditorId" UUID,
  "updatedByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditCard_workspaceId_personEditorId_name_key" UNIQUE ("workspaceId", "personEditorId", "name")
);

CREATE TABLE "CreditCardPurchase" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "cardId" UUID NOT NULL REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "categoryId" UUID REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "description" VARCHAR(160) NOT NULL,
  "totalAmount" DECIMAL(19,2) NOT NULL,
  "installmentCount" INTEGER NOT NULL,
  "purchaseDate" DATE NOT NULL,
  "notes" TEXT,
  "canceledAt" DATE,
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CreditCardPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardInvoice" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "cardId" UUID NOT NULL REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "month" DATE NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(19,2) NOT NULL DEFAULT 0,
  "dueDate" DATE NOT NULL,
  "status" "CreditCardInvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" DATE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CreditCardInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditCardInvoice_cardId_month_key" UNIQUE ("cardId", "month")
);

CREATE TABLE "CreditCardInstallment" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "cardId" UUID NOT NULL REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "purchaseId" UUID NOT NULL REFERENCES "CreditCardPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "invoiceId" UUID REFERENCES "CreditCardInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "categoryId" UUID REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "number" INTEGER NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "dueMonth" DATE NOT NULL,
  "status" "CreditCardPurchaseInstallmentStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CreditCardInstallment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditCardInstallment_purchaseId_number_key" UNIQUE ("purchaseId", "number")
);

CREATE TABLE "Transaction" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" UUID REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "categoryId" UUID REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "fixedExpenseId" UUID REFERENCES "FixedExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "salaryId" UUID REFERENCES "Salary"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "creditCardInstallmentId" UUID UNIQUE REFERENCES "CreditCardInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "description" VARCHAR(160) NOT NULL,
  "type" "TransactionType" NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "competenceDate" DATE NOT NULL,
  "dueDate" DATE,
  "settledAt" DATE,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "affectsBalance" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByEditorId" UUID,
  "updatedByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardInvoicePayment" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "invoiceId" UUID NOT NULL REFERENCES "CreditCardInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountId" UUID NOT NULL REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(19,2) NOT NULL,
  "paidAt" DATE NOT NULL,
  "notes" TEXT,
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditCardInvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transfer" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceAccountId" UUID NOT NULL REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "destinationAccountId" UUID NOT NULL REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourcePersonEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "destinationPersonEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(19,2) NOT NULL,
  "transferDate" DATE NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'SETTLED',
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BalanceAdjustment" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountId" UUID NOT NULL REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "previousBalance" DECIMAL(19,2) NOT NULL,
  "targetBalance" DECIMAL(19,2) NOT NULL,
  "difference" DECIMAL(19,2) NOT NULL,
  "effectiveAt" DATE NOT NULL,
  "notes" TEXT,
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavingsGoal" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" UUID REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "targetAmount" DECIMAL(19,2) NOT NULL,
  "deadline" DATE,
  "description" TEXT,
  "status" "SavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavingsGoal_workspaceId_personEditorId_name_key" UNIQUE ("workspaceId", "personEditorId", "name")
);

CREATE TABLE "SavingsGoalMovement" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "goalId" UUID NOT NULL REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" UUID REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "type" "SavingsGoalMovementType" NOT NULL,
  "amount" DECIMAL(19,2) NOT NULL,
  "movementDate" DATE NOT NULL,
  "notes" TEXT,
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavingsGoalMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Investment" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "personEditorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" UUID REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "name" VARCHAR(120) NOT NULL,
  "institution" VARCHAR(120),
  "amount" DECIMAL(19,2) NOT NULL,
  "referenceDate" DATE NOT NULL,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByEditorId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "editorId" UUID NOT NULL REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "entityType" VARCHAR(80) NOT NULL,
  "entityId" UUID,
  "action" VARCHAR(80) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialAccount_workspaceId_personEditorId_idx" ON "FinancialAccount"("workspaceId", "personEditorId");
CREATE INDEX "FinancialAccount_workspaceId_active_idx" ON "FinancialAccount"("workspaceId", "active");
CREATE INDEX "FinancialAccount_workspaceId_type_idx" ON "FinancialAccount"("workspaceId", "type");
CREATE INDEX "Category_workspaceId_kind_active_idx" ON "Category"("workspaceId", "kind", "active");
CREATE INDEX "Transaction_workspaceId_personEditorId_competenceDate_idx" ON "Transaction"("workspaceId", "personEditorId", "competenceDate");
CREATE INDEX "Transaction_workspaceId_type_status_idx" ON "Transaction"("workspaceId", "type", "status");
CREATE INDEX "Transaction_workspaceId_accountId_idx" ON "Transaction"("workspaceId", "accountId");
CREATE INDEX "BalanceAdjustment_workspaceId_accountId_effectiveAt_idx" ON "BalanceAdjustment"("workspaceId", "accountId", "effectiveAt");
CREATE INDEX "BalanceAdjustment_workspaceId_personEditorId_idx" ON "BalanceAdjustment"("workspaceId", "personEditorId");
CREATE INDEX "Transfer_workspaceId_transferDate_idx" ON "Transfer"("workspaceId", "transferDate");
CREATE INDEX "Transfer_workspaceId_sourcePersonEditorId_idx" ON "Transfer"("workspaceId", "sourcePersonEditorId");
CREATE INDEX "Transfer_workspaceId_destinationPersonEditorId_idx" ON "Transfer"("workspaceId", "destinationPersonEditorId");
CREATE INDEX "FixedExpense_workspaceId_personEditorId_active_idx" ON "FixedExpense"("workspaceId", "personEditorId", "active");
CREATE INDEX "FixedExpense_workspaceId_dueDay_idx" ON "FixedExpense"("workspaceId", "dueDay");
CREATE INDEX "Salary_workspaceId_personEditorId_active_idx" ON "Salary"("workspaceId", "personEditorId", "active");
CREATE INDEX "Debt_workspaceId_personEditorId_active_idx" ON "Debt"("workspaceId", "personEditorId", "active");
CREATE INDEX "DebtInstallment_workspaceId_personEditorId_dueDate_idx" ON "DebtInstallment"("workspaceId", "personEditorId", "dueDate");
CREATE INDEX "CreditCard_workspaceId_personEditorId_active_idx" ON "CreditCard"("workspaceId", "personEditorId", "active");
CREATE INDEX "CreditCardPurchase_workspaceId_personEditorId_purchaseDate_idx" ON "CreditCardPurchase"("workspaceId", "personEditorId", "purchaseDate");
CREATE INDEX "CreditCardPurchase_workspaceId_cardId_idx" ON "CreditCardPurchase"("workspaceId", "cardId");
CREATE INDEX "CreditCardInstallment_workspaceId_personEditorId_dueMonth_idx" ON "CreditCardInstallment"("workspaceId", "personEditorId", "dueMonth");
CREATE INDEX "CreditCardInstallment_workspaceId_cardId_idx" ON "CreditCardInstallment"("workspaceId", "cardId");
CREATE INDEX "CreditCardInvoice_workspaceId_personEditorId_month_idx" ON "CreditCardInvoice"("workspaceId", "personEditorId", "month");
CREATE INDEX "CreditCardInvoicePayment_workspaceId_personEditorId_paidAt_idx" ON "CreditCardInvoicePayment"("workspaceId", "personEditorId", "paidAt");
CREATE INDEX "CreditCardInvoicePayment_workspaceId_accountId_idx" ON "CreditCardInvoicePayment"("workspaceId", "accountId");
CREATE INDEX "SavingsGoal_workspaceId_personEditorId_status_idx" ON "SavingsGoal"("workspaceId", "personEditorId", "status");
CREATE INDEX "SavingsGoalMovement_workspaceId_personEditorId_movementDate_idx" ON "SavingsGoalMovement"("workspaceId", "personEditorId", "movementDate");
CREATE INDEX "Investment_workspaceId_personEditorId_active_idx" ON "Investment"("workspaceId", "personEditorId", "active");
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
CREATE INDEX "AuditLog_workspaceId_entityType_entityId_idx" ON "AuditLog"("workspaceId", "entityType", "entityId");

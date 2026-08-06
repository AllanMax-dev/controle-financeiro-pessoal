-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "fixedExpenseId" UUID,
ADD COLUMN "recurrenceMonth" DATE;

-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "startMonth" DATE NOT NULL,
    "notes" VARCHAR(1000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_fixedExpenseId_recurrenceMonth_key" ON "Transaction"("fixedExpenseId", "recurrenceMonth");

-- CreateIndex
CREATE INDEX "FixedExpense_workspaceId_active_startMonth_idx" ON "FixedExpense"("workspaceId", "active", "startMonth");

-- CreateIndex
CREATE INDEX "FixedExpense_accountId_idx" ON "FixedExpense"("accountId");

-- CreateIndex
CREATE INDEX "FixedExpense_categoryId_idx" ON "FixedExpense"("categoryId");

-- CreateIndex
CREATE INDEX "FixedExpense_editorId_idx" ON "FixedExpense"("editorId");

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fixedExpenseId_fkey" FOREIGN KEY ("fixedExpenseId") REFERENCES "FixedExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints not represented directly by the Prisma schema.
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_dueDay_valid" CHECK ("dueDay" BETWEEN 1 AND 31);
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_startMonth_first_day" CHECK (EXTRACT(DAY FROM "startMonth") = 1);
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_version_positive" CHECK ("version" > 0);

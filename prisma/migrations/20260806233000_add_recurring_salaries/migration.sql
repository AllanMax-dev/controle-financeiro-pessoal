-- CreateEnum
CREATE TYPE "SalaryFrequency" AS ENUM ('MONTHLY', 'FORTNIGHTLY');

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "salaryId" UUID,
ADD COLUMN "salaryMonth" DATE,
ADD COLUMN "salaryInstallment" INTEGER;

-- CreateTable
CREATE TABLE "Salary" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "frequency" "SalaryFrequency" NOT NULL,
    "paymentDay" INTEGER,
    "startMonth" DATE NOT NULL,
    "notes" VARCHAR(1000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Salary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_salaryId_salaryMonth_salaryInstallment_key" ON "Transaction"("salaryId", "salaryMonth", "salaryInstallment");

-- CreateIndex
CREATE INDEX "Salary_workspaceId_active_startMonth_idx" ON "Salary"("workspaceId", "active", "startMonth");

-- CreateIndex
CREATE INDEX "Salary_accountId_idx" ON "Salary"("accountId");

-- CreateIndex
CREATE INDEX "Salary_categoryId_idx" ON "Salary"("categoryId");

-- CreateIndex
CREATE INDEX "Salary_editorId_idx" ON "Salary"("editorId");

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "Salary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints not represented directly by the Prisma schema.
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_payment_schedule_valid" CHECK (
  ("frequency" = 'MONTHLY' AND "paymentDay" BETWEEN 1 AND 31)
  OR ("frequency" = 'FORTNIGHTLY' AND "paymentDay" IS NULL)
);
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_startMonth_first_day" CHECK (EXTRACT(DAY FROM "startMonth") = 1);
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_version_positive" CHECK ("version" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_salary_installment_valid" CHECK (
  "salaryInstallment" IS NULL OR "salaryInstallment" IN (1, 2)
);

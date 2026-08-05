-- CreateEnum
CREATE TYPE "DebtPaymentMethod" AS ENUM ('CREDIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "DebtInstallmentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "affectsBalance" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Debt" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" VARCHAR(160) NOT NULL,
    "paymentMethod" "DebtPaymentMethod" NOT NULL,
    "cardName" VARCHAR(100),
    "totalAmount" DECIMAL(19,2) NOT NULL,
    "purchaseDate" DATE NOT NULL,
    "firstDueDate" DATE NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "notes" VARCHAR(1000),
    "canceledAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtInstallment" (
    "id" UUID NOT NULL,
    "debtId" UUID NOT NULL,
    "transactionId" UUID,
    "number" INTEGER NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "DebtInstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "historical" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DebtInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtInstallmentShare" (
    "installmentId" UUID NOT NULL,
    "editorId" UUID NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,

    CONSTRAINT "DebtInstallmentShare_pkey" PRIMARY KEY ("installmentId", "editorId")
);

-- CreateIndex
CREATE INDEX "Debt_workspaceId_purchaseDate_idx" ON "Debt"("workspaceId", "purchaseDate");

-- CreateIndex
CREATE INDEX "Debt_workspaceId_canceledAt_idx" ON "Debt"("workspaceId", "canceledAt");

-- CreateIndex
CREATE INDEX "Debt_categoryId_idx" ON "Debt"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtInstallment_transactionId_key" ON "DebtInstallment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtInstallment_debtId_number_key" ON "DebtInstallment"("debtId", "number");

-- CreateIndex
CREATE INDEX "DebtInstallment_debtId_status_idx" ON "DebtInstallment"("debtId", "status");

-- CreateIndex
CREATE INDEX "DebtInstallment_status_dueDate_idx" ON "DebtInstallment"("status", "dueDate");

-- CreateIndex
CREATE INDEX "DebtInstallmentShare_editorId_idx" ON "DebtInstallmentShare"("editorId");

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtInstallment" ADD CONSTRAINT "DebtInstallment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtInstallment" ADD CONSTRAINT "DebtInstallment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT "DebtInstallmentShare_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "DebtInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT "DebtInstallmentShare_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "Editor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints not represented directly by the Prisma schema.
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_totalAmount_positive" CHECK ("totalAmount" > 0);
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_installmentCount_positive" CHECK ("installmentCount" > 0);
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_firstDueDate_after_purchase" CHECK ("firstDueDate" >= "purchaseDate");
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_version_positive" CHECK ("version" > 0);
ALTER TABLE "DebtInstallment" ADD CONSTRAINT "DebtInstallment_number_positive" CHECK ("number" > 0);
ALTER TABLE "DebtInstallment" ADD CONSTRAINT "DebtInstallment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "DebtInstallment" ADD CONSTRAINT "DebtInstallment_version_positive" CHECK ("version" > 0);
ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT "DebtInstallmentShare_amount_positive" CHECK ("amount" > 0);

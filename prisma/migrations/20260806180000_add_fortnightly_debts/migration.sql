-- Remove canceled debts and their linked transactions from the visible financial history.
DELETE FROM "Transaction"
WHERE "id" IN (
    SELECT "transactionId"
    FROM "DebtInstallment"
    INNER JOIN "Debt" ON "Debt"."id" = "DebtInstallment"."debtId"
    WHERE "Debt"."canceledAt" IS NOT NULL
      AND "DebtInstallment"."transactionId" IS NOT NULL
);

DELETE FROM "Debt" WHERE "canceledAt" IS NOT NULL;

-- CreateEnum
CREATE TYPE "DebtInstallmentFrequency" AS ENUM ('MONTHLY', 'FORTNIGHTLY');

-- AlterTable
ALTER TABLE "Debt"
ADD COLUMN "installmentFrequency" "DebtInstallmentFrequency" NOT NULL DEFAULT 'MONTHLY';

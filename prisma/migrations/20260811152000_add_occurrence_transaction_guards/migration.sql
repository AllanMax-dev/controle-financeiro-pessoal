ALTER TABLE "Transaction"
ADD COLUMN IF NOT EXISTS "debtInstallmentId" UUID;

DO $$
BEGIN
  ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_debtInstallmentId_fkey"
  FOREIGN KEY ("debtInstallmentId") REFERENCES "DebtInstallment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_debtInstallmentId_key"
ON "Transaction"("debtInstallmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_fixedExpenseId_competenceDate_key"
ON "Transaction"("fixedExpenseId", "competenceDate");

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_salaryId_competenceDate_key"
ON "Transaction"("salaryId", "competenceDate");

BEGIN;

ALTER TABLE "FixedExpense" DROP COLUMN "status";

UPDATE "Salary"
SET "archivedAt" = (date_trunc('month', "archivedAt") + interval '1 month - 1 day')::date,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "archivedAt" = date_trunc('month', "archivedAt")::date;

UPDATE "FixedExpense"
SET "endedAt" = (date_trunc('month', "endedAt") + interval '1 month - 1 day')::date,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "endedAt" = date_trunc('month', "endedAt")::date;

UPDATE "Transaction" transaction_record
SET "competenceDate" = installment."dueDate",
    "dueDate" = installment."dueDate",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "DebtInstallment" installment
WHERE transaction_record."debtInstallmentId" = installment."id"
  AND transaction_record."workspaceId" = installment."workspaceId"
  AND (
    transaction_record."competenceDate" <> installment."dueDate"
    OR transaction_record."dueDate" IS DISTINCT FROM installment."dueDate"
  );

UPDATE "DebtInstallment" installment
SET "status" = CASE
      WHEN transaction_record."status" = 'SETTLED' THEN 'PAID'::"DebtInstallmentStatus"
      ELSE 'PENDING'::"DebtInstallmentStatus"
    END,
    "paidAt" = CASE WHEN transaction_record."status" = 'SETTLED' THEN transaction_record."settledAt" ELSE NULL END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Transaction" transaction_record
WHERE transaction_record."debtInstallmentId" = installment."id"
  AND transaction_record."workspaceId" = installment."workspaceId";

UPDATE "DebtInstallment" installment
SET "status" = 'PENDING',
    "paidAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE installment."status" = 'PAID'
  AND NOT EXISTS (
    SELECT 1
    FROM "Transaction" transaction_record
    WHERE transaction_record."debtInstallmentId" = installment."id"
      AND transaction_record."workspaceId" = installment."workspaceId"
      AND transaction_record."status" = 'SETTLED'
  );

UPDATE "DebtInstallmentShare" share
SET "status" = installment."status",
    "paidAt" = installment."paidAt",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "DebtInstallment" installment
WHERE share."installmentId" = installment."id"
  AND share."workspaceId" = installment."workspaceId"
  AND (share."status" <> installment."status" OR share."paidAt" IS DISTINCT FROM installment."paidAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Debt" debt
    LEFT JOIN "DebtInstallment" installment ON installment."debtId" = debt."id"
    GROUP BY debt."id", debt."totalAmount"
    HAVING debt."totalAmount" <> COALESCE(SUM(installment."amount"), 0)
  ) THEN
    RAISE EXCEPTION 'Debt reconciliation blocked: installments do not sum to totalAmount';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "DebtInstallment" installment
    JOIN "DebtInstallmentShare" share ON share."installmentId" = installment."id"
    GROUP BY installment."id", installment."amount"
    HAVING installment."amount" <> SUM(share."amount")
  ) THEN
    RAISE EXCEPTION 'Debt reconciliation blocked: shares do not sum to installment amount';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Transaction" transaction_record
    JOIN "DebtInstallment" installment ON installment."id" = transaction_record."debtInstallmentId"
    WHERE transaction_record."competenceDate" <> installment."dueDate"
       OR transaction_record."dueDate" IS DISTINCT FROM installment."dueDate"
       OR transaction_record."amount" <> installment."amount"
       OR transaction_record."workspaceId" <> installment."workspaceId"
       OR transaction_record."personEditorId" <> installment."personEditorId"
  ) THEN
    RAISE EXCEPTION 'Debt reconciliation failed: payment transaction is inconsistent with installment';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "DebtInstallment" installment
    WHERE installment."status" = 'PAID'
      AND NOT EXISTS (
        SELECT 1
        FROM "Transaction" transaction_record
        WHERE transaction_record."debtInstallmentId" = installment."id"
          AND transaction_record."workspaceId" = installment."workspaceId"
          AND transaction_record."status" = 'SETTLED'
      )
  ) THEN
    RAISE EXCEPTION 'Debt reconciliation failed: paid installment has no settled transaction';
  END IF;
END $$;

COMMIT;

WITH implicit_debt_installments AS (
  SELECT di."id", di."workspaceId"
  FROM "DebtInstallment" di
  WHERE di."status" = 'PAID'
    AND NOT EXISTS (
      SELECT 1
      FROM "Transaction" t
      WHERE t."debtInstallmentId" = di."id"
        AND t."workspaceId" = di."workspaceId"
        AND t."status" = 'SETTLED'
    )
)
UPDATE "DebtInstallment" di
SET "paidAt" = NULL,
    "status" = 'PENDING',
    "updatedAt" = CURRENT_TIMESTAMP
FROM implicit_debt_installments implicit
WHERE di."id" = implicit."id"
  AND di."workspaceId" = implicit."workspaceId";

WITH implicit_debt_installments AS (
  SELECT di."id", di."workspaceId"
  FROM "DebtInstallment" di
  WHERE di."status" = 'PENDING'
    AND NOT EXISTS (
      SELECT 1
      FROM "Transaction" t
      WHERE t."debtInstallmentId" = di."id"
        AND t."workspaceId" = di."workspaceId"
        AND t."status" = 'SETTLED'
    )
)
UPDATE "DebtInstallmentShare" share
SET "paidAt" = NULL,
    "status" = 'PENDING',
    "updatedAt" = CURRENT_TIMESTAMP
FROM implicit_debt_installments implicit
WHERE share."installmentId" = implicit."id"
  AND share."workspaceId" = implicit."workspaceId"
  AND share."status" = 'PAID';

WITH implicit_card_installments AS (
  SELECT cci."id", cci."workspaceId"
  FROM "CreditCardInstallment" cci
  WHERE cci."status" = 'PAID'
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditCardInvoicePayment" payment
      WHERE payment."creditCardInstallmentId" = cci."id"
        AND payment."workspaceId" = cci."workspaceId"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditCardInvoicePayment" payment
      WHERE payment."invoiceId" = cci."invoiceId"
        AND payment."workspaceId" = cci."workspaceId"
    )
)
UPDATE "CreditCardInstallment" cci
SET "status" = 'OPEN',
    "updatedAt" = CURRENT_TIMESTAMP
FROM implicit_card_installments implicit
WHERE cci."id" = implicit."id"
  AND cci."workspaceId" = implicit."workspaceId";

WITH implicit_card_installments AS (
  SELECT cci."id", cci."workspaceId"
  FROM "CreditCardInstallment" cci
  WHERE cci."status" = 'OPEN'
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditCardInvoicePayment" payment
      WHERE payment."creditCardInstallmentId" = cci."id"
        AND payment."workspaceId" = cci."workspaceId"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditCardInvoicePayment" payment
      WHERE payment."invoiceId" = cci."invoiceId"
        AND payment."workspaceId" = cci."workspaceId"
    )
)
UPDATE "CreditCardInstallmentShare" share
SET "status" = 'OPEN',
    "updatedAt" = CURRENT_TIMESTAMP
FROM implicit_card_installments implicit
WHERE share."installmentId" = implicit."id"
  AND share."workspaceId" = implicit."workspaceId"
  AND share."status" = 'PAID';

WITH implicit_card_installments AS (
  SELECT cci."id", cci."workspaceId"
  FROM "CreditCardInstallment" cci
  WHERE cci."status" = 'OPEN'
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditCardInvoicePayment" payment
      WHERE payment."creditCardInstallmentId" = cci."id"
        AND payment."workspaceId" = cci."workspaceId"
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditCardInvoicePayment" payment
      WHERE payment."invoiceId" = cci."invoiceId"
        AND payment."workspaceId" = cci."workspaceId"
    )
)
UPDATE "Transaction" t
SET "accountId" = NULL,
    "settledAt" = NULL,
    "status" = 'PENDING',
    "updatedAt" = CURRENT_TIMESTAMP
FROM implicit_card_installments implicit
WHERE t."creditCardInstallmentId" = implicit."id"
  AND t."workspaceId" = implicit."workspaceId"
  AND t."status" = 'SETTLED';

WITH invoice_totals AS (
  SELECT invoice."id",
         COALESCE(SUM(installment."amount") FILTER (WHERE installment."status" <> 'CANCELED'), 0)::DECIMAL(19,2) AS "amount",
         COALESCE((
           SELECT SUM(payment."amount")
           FROM "CreditCardInvoicePayment" payment
           WHERE payment."invoiceId" = invoice."id"
             AND payment."workspaceId" = invoice."workspaceId"
         ), 0)::DECIMAL(19,2) AS "paidAmount"
  FROM "CreditCardInvoice" invoice
  LEFT JOIN "CreditCardInstallment" installment
    ON installment."invoiceId" = invoice."id"
   AND installment."workspaceId" = invoice."workspaceId"
  GROUP BY invoice."id", invoice."workspaceId"
)
UPDATE "CreditCardInvoice" invoice
SET "amount" = totals."amount",
    "paidAmount" = LEAST(totals."amount", totals."paidAmount"),
    "status" = CASE
      WHEN totals."amount" > 0 AND LEAST(totals."amount", totals."paidAmount") >= totals."amount" THEN 'PAID'
      ELSE 'OPEN'
    END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM invoice_totals totals
WHERE invoice."id" = totals."id";

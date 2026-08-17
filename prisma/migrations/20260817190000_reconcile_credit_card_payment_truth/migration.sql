BEGIN;

UPDATE "CreditCardInstallment" installment
SET "status" = 'CANCELED',
    "updatedAt" = CURRENT_TIMESTAMP
FROM "CreditCardPurchase" purchase
WHERE purchase."id" = installment."purchaseId"
  AND purchase."workspaceId" = installment."workspaceId"
  AND purchase."canceledAt" IS NOT NULL
  AND installment."status" <> 'CANCELED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CreditCardInvoicePayment" payment
    JOIN "CreditCardInvoice" invoice ON invoice."id" = payment."invoiceId"
    LEFT JOIN "CreditCardInstallment" installment ON installment."id" = payment."creditCardInstallmentId"
    WHERE payment."amount" <= 0
       OR payment."workspaceId" <> invoice."workspaceId"
       OR (payment."creditCardInstallmentId" IS NOT NULL AND (
         installment."id" IS NULL
         OR installment."invoiceId" <> payment."invoiceId"
         OR installment."workspaceId" <> payment."workspaceId"
         OR installment."status" = 'CANCELED'
         OR installment."amount" <> payment."amount"
       ))
  ) THEN
    RAISE EXCEPTION 'Credit card reconciliation blocked: invalid payment link or amount';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "CreditCardInstallment" installment
    JOIN "CreditCardInstallmentShare" share ON share."installmentId" = installment."id"
    GROUP BY installment."id", installment."amount"
    HAVING SUM(share."amount") <> installment."amount"
  ) THEN
    RAISE EXCEPTION 'Credit card reconciliation blocked: installment shares do not sum to installment amount';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "CreditCardInstallment" installment
    LEFT JOIN "Transaction" transaction_record ON transaction_record."creditCardInstallmentId" = installment."id"
    WHERE transaction_record."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Credit card reconciliation blocked: installment without competency transaction';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "CreditCardInvoice" invoice
    WHERE COALESCE((
      SELECT SUM(payment."amount")
      FROM "CreditCardInvoicePayment" payment
      WHERE payment."invoiceId" = invoice."id"
        AND payment."workspaceId" = invoice."workspaceId"
    ), 0) > COALESCE((
      SELECT SUM(installment."amount")
      FROM "CreditCardInstallment" installment
      WHERE installment."invoiceId" = invoice."id"
        AND installment."workspaceId" = invoice."workspaceId"
        AND installment."status" <> 'CANCELED'
    ), 0)
  ) THEN
    RAISE EXCEPTION 'Credit card reconciliation blocked: invoice payments exceed active installments';
  END IF;
END $$;

CREATE TEMP TABLE credit_card_reconciliation ON COMMIT DROP AS
WITH general_payments AS (
  SELECT payment."invoiceId",
         payment."accountId",
         payment."paidAt",
         SUM(payment."amount") OVER (
           PARTITION BY payment."invoiceId"
           ORDER BY payment."paidAt", payment."createdAt", payment."id"
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS "runningAmount"
  FROM "CreditCardInvoicePayment" payment
  WHERE payment."creditCardInstallmentId" IS NULL
),
ordered_installments AS (
  SELECT installment."id",
         installment."invoiceId",
         SUM(installment."amount") OVER (
           PARTITION BY installment."invoiceId"
           ORDER BY installment."dueMonth", installment."number", installment."id"
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS "requiredAmount"
  FROM "CreditCardInstallment" installment
  WHERE installment."status" <> 'CANCELED'
    AND NOT EXISTS (
      SELECT 1
      FROM "CreditCardInvoicePayment" direct_payment
      WHERE direct_payment."creditCardInstallmentId" = installment."id"
    )
)
SELECT installment."id" AS "installmentId",
       CASE
         WHEN installment."status" = 'CANCELED' THEN 'CANCELED'
         WHEN direct_payment."id" IS NOT NULL OR general_evidence."accountId" IS NOT NULL THEN 'PAID'
         ELSE 'OPEN'
       END AS "desiredStatus",
       COALESCE(direct_payment."accountId", general_evidence."accountId") AS "accountId",
       COALESCE(direct_payment."paidAt", general_evidence."paidAt") AS "paidAt"
FROM "CreditCardInstallment" installment
LEFT JOIN "CreditCardInvoicePayment" direct_payment ON direct_payment."creditCardInstallmentId" = installment."id"
LEFT JOIN ordered_installments ordered ON ordered."id" = installment."id"
LEFT JOIN LATERAL (
  SELECT payment."accountId", payment."paidAt"
  FROM general_payments payment
  WHERE payment."invoiceId" = installment."invoiceId"
    AND payment."runningAmount" >= ordered."requiredAmount"
  ORDER BY payment."runningAmount", payment."paidAt", payment."accountId"
  LIMIT 1
) general_evidence ON TRUE;

UPDATE "CreditCardInstallment" installment
SET "status" = reconciliation."desiredStatus"::"CreditCardPurchaseInstallmentStatus",
    "updatedAt" = CURRENT_TIMESTAMP
FROM credit_card_reconciliation reconciliation
WHERE installment."id" = reconciliation."installmentId";

UPDATE "CreditCardInstallmentShare" share
SET "status" = reconciliation."desiredStatus"::"CreditCardPurchaseInstallmentStatus",
    "updatedAt" = CURRENT_TIMESTAMP
FROM credit_card_reconciliation reconciliation
WHERE share."installmentId" = reconciliation."installmentId";

UPDATE "Transaction" transaction_record
SET "accountId" = CASE WHEN reconciliation."desiredStatus" = 'PAID' THEN reconciliation."accountId" ELSE NULL END,
    "settledAt" = CASE WHEN reconciliation."desiredStatus" = 'PAID' THEN reconciliation."paidAt" ELSE NULL END,
    "status" = CASE
      WHEN reconciliation."desiredStatus" = 'PAID' THEN 'SETTLED'::"TransactionStatus"
      WHEN reconciliation."desiredStatus" = 'CANCELED' THEN 'CANCELED'::"TransactionStatus"
      ELSE 'PENDING'::"TransactionStatus"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM credit_card_reconciliation reconciliation
WHERE transaction_record."creditCardInstallmentId" = reconciliation."installmentId";

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
    "paidAmount" = totals."paidAmount",
    "status" = CASE
      WHEN totals."amount" > 0 AND totals."paidAmount" = totals."amount" THEN 'PAID'::"CreditCardInvoiceStatus"
      ELSE 'OPEN'::"CreditCardInvoiceStatus"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM invoice_totals totals
WHERE invoice."id" = totals."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CreditCardInvoice" invoice
    WHERE invoice."amount" <> COALESCE((
      SELECT SUM(installment."amount")
      FROM "CreditCardInstallment" installment
      WHERE installment."invoiceId" = invoice."id"
        AND installment."workspaceId" = invoice."workspaceId"
        AND installment."status" <> 'CANCELED'
    ), 0)
       OR invoice."paidAmount" <> COALESCE((
         SELECT SUM(payment."amount")
         FROM "CreditCardInvoicePayment" payment
         WHERE payment."invoiceId" = invoice."id"
           AND payment."workspaceId" = invoice."workspaceId"
       ), 0)
       OR invoice."paidAmount" > invoice."amount"
  ) THEN
    RAISE EXCEPTION 'Credit card reconciliation failed its post-migration assertions';
  END IF;
END $$;

COMMIT;

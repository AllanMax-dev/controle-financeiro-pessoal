-- READ-ONLY: execute antes do deploy para visualizar qualquer divergência.
WITH invoice_truth AS (
  SELECT invoice."id",
         invoice."workspaceId",
         invoice."amount" AS "storedAmount",
         invoice."paidAmount" AS "storedPaidAmount",
         invoice."status" AS "storedStatus",
         COALESCE(SUM(installment."amount") FILTER (WHERE installment."status" <> 'CANCELED'), 0)::DECIMAL(19,2) AS "expectedAmount",
         COALESCE((
           SELECT SUM(payment."amount")
           FROM "CreditCardInvoicePayment" payment
           WHERE payment."invoiceId" = invoice."id"
             AND payment."workspaceId" = invoice."workspaceId"
         ), 0)::DECIMAL(19,2) AS "expectedPaidAmount"
  FROM "CreditCardInvoice" invoice
  LEFT JOIN "CreditCardInstallment" installment
    ON installment."invoiceId" = invoice."id"
   AND installment."workspaceId" = invoice."workspaceId"
  GROUP BY invoice."id", invoice."workspaceId"
)
SELECT *,
       CASE WHEN "expectedAmount" > 0 AND "expectedPaidAmount" = "expectedAmount" THEN 'PAID' ELSE 'OPEN' END AS "expectedStatus"
FROM invoice_truth
WHERE "storedAmount" <> "expectedAmount"
   OR "storedPaidAmount" <> "expectedPaidAmount"
   OR "expectedPaidAmount" > "expectedAmount"
   OR "storedStatus"::text <> CASE WHEN "expectedAmount" > 0 AND "expectedPaidAmount" = "expectedAmount" THEN 'PAID' ELSE 'OPEN' END
ORDER BY "id";

SELECT payment."id" AS "paymentId",
       payment."invoiceId",
       payment."creditCardInstallmentId",
       payment."amount" AS "paymentAmount",
       installment."amount" AS "installmentAmount",
       payment."workspaceId" AS "paymentWorkspaceId",
       invoice."workspaceId" AS "invoiceWorkspaceId",
       installment."workspaceId" AS "installmentWorkspaceId"
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
ORDER BY payment."id";

SELECT installment."id" AS "installmentId",
       installment."invoiceId",
       installment."amount" AS "installmentAmount",
       COALESCE(SUM(share."amount"), 0)::DECIMAL(19,2) AS "shareAmount"
FROM "CreditCardInstallment" installment
JOIN "CreditCardInstallmentShare" share ON share."installmentId" = installment."id"
GROUP BY installment."id", installment."invoiceId", installment."amount"
HAVING SUM(share."amount") <> installment."amount"
ORDER BY installment."id";

SELECT installment."id" AS "installmentId",
       installment."status" AS "installmentStatus",
       transaction_record."id" AS "transactionId",
       transaction_record."status" AS "transactionStatus",
       transaction_record."settledAt",
       payment."id" AS "directPaymentId"
FROM "CreditCardInstallment" installment
LEFT JOIN "Transaction" transaction_record ON transaction_record."creditCardInstallmentId" = installment."id"
LEFT JOIN "CreditCardInvoicePayment" payment ON payment."creditCardInstallmentId" = installment."id"
WHERE transaction_record."id" IS NULL
   OR (installment."status" = 'PAID' AND payment."id" IS NULL AND NOT EXISTS (
     SELECT 1 FROM "CreditCardInvoicePayment" invoice_payment WHERE invoice_payment."invoiceId" = installment."invoiceId"
   ))
ORDER BY installment."id";

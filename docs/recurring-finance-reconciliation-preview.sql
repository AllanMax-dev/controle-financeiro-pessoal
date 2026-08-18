-- READ-ONLY: execute antes do deploy para visualizar divergências de recorrências e dívidas.
SELECT installment."id" AS "installmentId",
       installment."debtId",
       installment."dueDate" AS "installmentDueDate",
       transaction_record."id" AS "transactionId",
       transaction_record."competenceDate",
       transaction_record."dueDate" AS "transactionDueDate",
       installment."status" AS "installmentStatus",
       transaction_record."status" AS "transactionStatus"
FROM "DebtInstallment" installment
LEFT JOIN "Transaction" transaction_record ON transaction_record."debtInstallmentId" = installment."id"
WHERE transaction_record."id" IS NOT NULL
  AND (
    transaction_record."competenceDate" <> installment."dueDate"
    OR transaction_record."dueDate" IS DISTINCT FROM installment."dueDate"
    OR (installment."status" = 'PAID' AND transaction_record."status" <> 'SETTLED')
    OR (installment."status" = 'PENDING' AND transaction_record."status" = 'SETTLED')
  )
ORDER BY installment."debtId", installment."number";

SELECT debt."id" AS "debtId",
       debt."totalAmount",
       COALESCE(SUM(installment."amount"), 0)::DECIMAL(19,2) AS "installmentTotal"
FROM "Debt" debt
LEFT JOIN "DebtInstallment" installment ON installment."debtId" = debt."id"
GROUP BY debt."id", debt."totalAmount"
HAVING debt."totalAmount" <> COALESCE(SUM(installment."amount"), 0)
ORDER BY debt."id";

SELECT installment."id" AS "installmentId",
       installment."amount" AS "installmentAmount",
       SUM(share."amount")::DECIMAL(19,2) AS "shareTotal"
FROM "DebtInstallment" installment
JOIN "DebtInstallmentShare" share ON share."installmentId" = installment."id"
GROUP BY installment."id", installment."amount"
HAVING installment."amount" <> SUM(share."amount")
ORDER BY installment."id";

SELECT transaction_record."id" AS "transactionId",
       transaction_record."debtInstallmentId" AS "installmentId",
       transaction_record."amount" AS "transactionAmount",
       installment."amount" AS "installmentAmount",
       transaction_record."workspaceId" AS "transactionWorkspaceId",
       installment."workspaceId" AS "installmentWorkspaceId",
       transaction_record."personEditorId" AS "transactionPersonId",
       installment."personEditorId" AS "installmentPersonId"
FROM "Transaction" transaction_record
JOIN "DebtInstallment" installment ON installment."id" = transaction_record."debtInstallmentId"
WHERE transaction_record."amount" <> installment."amount"
   OR transaction_record."workspaceId" <> installment."workspaceId"
   OR transaction_record."personEditorId" <> installment."personEditorId"
ORDER BY transaction_record."id";

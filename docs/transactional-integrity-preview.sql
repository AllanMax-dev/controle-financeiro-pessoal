-- READ-ONLY: execute antes do deploy da migration 20260818170000_enforce_transactional_integrity.

SELECT 'Transaction.amount' AS rule, "id", "workspaceId" FROM "Transaction" WHERE "amount" <= 0
UNION ALL SELECT 'Transfer.amount', "id", "workspaceId" FROM "Transfer" WHERE "amount" <= 0
UNION ALL SELECT 'FixedExpense.amount', "id", "workspaceId" FROM "FixedExpense" WHERE "amount" <= 0
UNION ALL SELECT 'Salary.amount', "id", "workspaceId" FROM "Salary" WHERE "amount" <= 0
UNION ALL SELECT 'Debt.totalAmount', "id", "workspaceId" FROM "Debt" WHERE "totalAmount" <= 0
UNION ALL SELECT 'DebtInstallment.amount', "id", "workspaceId" FROM "DebtInstallment" WHERE "amount" <= 0
UNION ALL SELECT 'DebtInstallmentShare.amount', "id", "workspaceId" FROM "DebtInstallmentShare" WHERE "amount" <= 0
UNION ALL SELECT 'CreditCard.limit', "id", "workspaceId" FROM "CreditCard" WHERE "limit" < 0
UNION ALL SELECT 'CreditCardPurchase.totalAmount', "id", "workspaceId" FROM "CreditCardPurchase" WHERE "totalAmount" <= 0
UNION ALL SELECT 'CreditCardInstallment.amount', "id", "workspaceId" FROM "CreditCardInstallment" WHERE "amount" <= 0
UNION ALL SELECT 'CreditCardInstallmentShare.amount', "id", "workspaceId" FROM "CreditCardInstallmentShare" WHERE "amount" <= 0
UNION ALL SELECT 'CreditCardInvoice.amount', "id", "workspaceId" FROM "CreditCardInvoice" WHERE "amount" < 0 OR "paidAmount" < 0 OR "paidAmount" > "amount"
UNION ALL SELECT 'CreditCardInvoicePayment.amount', "id", "workspaceId" FROM "CreditCardInvoicePayment" WHERE "amount" <= 0
UNION ALL SELECT 'SavingsGoal.targetAmount', "id", "workspaceId" FROM "SavingsGoal" WHERE "targetAmount" <= 0
UNION ALL SELECT 'SavingsGoalMovement.amount', "id", "workspaceId" FROM "SavingsGoalMovement" WHERE "amount" <= 0
UNION ALL SELECT 'Investment.amount', "id", "workspaceId" FROM "Investment" WHERE "amount" < 0
ORDER BY rule, "workspaceId", "id";

SELECT rule, "id", "workspaceId"
FROM (
  SELECT 'FinancialAccount.version' AS rule, "id", "workspaceId" FROM "FinancialAccount" WHERE "version" <= 0
  UNION ALL SELECT 'Transaction.version', "id", "workspaceId" FROM "Transaction" WHERE "version" <= 0
  UNION ALL SELECT 'Transfer.version', "id", "workspaceId" FROM "Transfer" WHERE "version" <= 0
  UNION ALL SELECT 'FixedExpense.dueDay/version', "id", "workspaceId" FROM "FixedExpense" WHERE "dueDay" NOT BETWEEN 1 AND 31 OR "version" <= 0
  UNION ALL SELECT 'Salary.paymentDay/version', "id", "workspaceId" FROM "Salary" WHERE "paymentDay" NOT BETWEEN 1 AND 31 OR "version" <= 0
  UNION ALL SELECT 'Debt.installmentCount/version', "id", "workspaceId" FROM "Debt" WHERE "installmentCount" <= 0 OR "version" <= 0
  UNION ALL SELECT 'DebtInstallment.number', "id", "workspaceId" FROM "DebtInstallment" WHERE "number" <= 0
  UNION ALL SELECT 'CreditCard.days/version', "id", "workspaceId" FROM "CreditCard" WHERE "closingDay" NOT BETWEEN 1 AND 31 OR "dueDay" NOT BETWEEN 1 AND 31 OR "version" <= 0
  UNION ALL SELECT 'CreditCardPurchase.installmentCount', "id", "workspaceId" FROM "CreditCardPurchase" WHERE "installmentCount" <= 0
  UNION ALL SELECT 'CreditCardInstallment.number', "id", "workspaceId" FROM "CreditCardInstallment" WHERE "number" <= 0
  UNION ALL SELECT 'BalanceAdjustment.difference', "id", "workspaceId" FROM "BalanceAdjustment" WHERE "difference" <> "targetBalance" - "previousBalance"
) structural_rules
ORDER BY rule, "workspaceId", "id";

SELECT "id", "workspaceId", "sourceAccountId", "destinationAccountId", "amount"
FROM "Transfer"
WHERE "sourceAccountId" = "destinationAccountId" OR "amount" <= 0;

SELECT movement."goalId",
       SUM(CASE WHEN movement."type" = 'DEPOSIT' THEN movement."amount" ELSE -movement."amount" END)::DECIMAL(19,2) AS balance
FROM "SavingsGoalMovement" movement
GROUP BY movement."goalId"
HAVING SUM(CASE WHEN movement."type" = 'DEPOSIT' THEN movement."amount" ELSE -movement."amount" END) < 0;

SELECT source_table, row_id, row_workspace, referenced_table, referenced_id, referenced_workspace
FROM (
  SELECT 'Transaction' AS source_table, transaction_record."id" AS row_id, transaction_record."workspaceId" AS row_workspace,
         'FinancialAccount' AS referenced_table, account."id" AS referenced_id, account."workspaceId" AS referenced_workspace
  FROM "Transaction" transaction_record JOIN "FinancialAccount" account ON account."id" = transaction_record."accountId"
  UNION ALL
  SELECT 'SavingsGoalMovement', movement."id", movement."workspaceId", 'SavingsGoal', goal."id", goal."workspaceId"
  FROM "SavingsGoalMovement" movement JOIN "SavingsGoal" goal ON goal."id" = movement."goalId"
  UNION ALL
  SELECT 'CreditCardInvoicePayment', payment."id", payment."workspaceId", 'FinancialAccount', account."id", account."workspaceId"
  FROM "CreditCardInvoicePayment" payment JOIN "FinancialAccount" account ON account."id" = payment."accountId"
  UNION ALL
  SELECT 'Investment', investment."id", investment."workspaceId", 'FinancialAccount', account."id", account."workspaceId"
  FROM "Investment" investment JOIN "FinancialAccount" account ON account."id" = investment."accountId"
) tenant_links
WHERE row_workspace <> referenced_workspace
ORDER BY source_table, row_id;

SELECT entity, row_id, account_id, row_person_id, account_person_id
FROM (
  SELECT 'SavingsGoal' AS entity, goal."id" AS row_id, account."id" AS account_id,
         goal."personEditorId" AS row_person_id, account."personEditorId" AS account_person_id
  FROM "SavingsGoal" goal JOIN "FinancialAccount" account ON account."id" = goal."accountId"
  UNION ALL
  SELECT 'SavingsGoalMovement', movement."id", account."id", movement."personEditorId", account."personEditorId"
  FROM "SavingsGoalMovement" movement JOIN "FinancialAccount" account ON account."id" = movement."accountId"
  UNION ALL
  SELECT 'Investment', investment."id", account."id", investment."personEditorId", account."personEditorId"
  FROM "Investment" investment JOIN "FinancialAccount" account ON account."id" = investment."accountId"
  UNION ALL
  SELECT 'Transfer.source', transfer."id", account."id", transfer."sourcePersonEditorId", account."personEditorId"
  FROM "Transfer" transfer JOIN "FinancialAccount" account ON account."id" = transfer."sourceAccountId"
  UNION ALL
  SELECT 'Transfer.destination', transfer."id", account."id", transfer."destinationPersonEditorId", account."personEditorId"
  FROM "Transfer" transfer JOIN "FinancialAccount" account ON account."id" = transfer."destinationAccountId"
) ownership
WHERE row_person_id <> account_person_id
ORDER BY entity, row_id;

SELECT investment."id", investment."workspaceId", investment."accountId", account."type"
FROM "Investment" investment
JOIN "FinancialAccount" account ON account."id" = investment."accountId"
WHERE account."type" <> 'INVESTMENT';

SELECT movement."id", movement."workspaceId", movement."goalId",
       movement."personEditorId" AS movement_person, goal."personEditorId" AS goal_person,
       movement."accountId" AS movement_account, goal."accountId" AS goal_account
FROM "SavingsGoalMovement" movement
JOIN "SavingsGoal" goal ON goal."id" = movement."goalId"
WHERE movement."personEditorId" IS DISTINCT FROM goal."personEditorId"
   OR movement."accountId" IS DISTINCT FROM goal."accountId";

WITH account_balance AS (
  SELECT account."id",
         account."workspaceId",
         account."initialBalance"
           + COALESCE((SELECT SUM(CASE WHEN transaction_record."type" = 'INCOME' THEN transaction_record."amount" ELSE -transaction_record."amount" END) FROM "Transaction" transaction_record WHERE transaction_record."accountId" = account."id" AND transaction_record."workspaceId" = account."workspaceId" AND transaction_record."status" = 'SETTLED' AND transaction_record."affectsBalance"), 0)
           + COALESCE((SELECT SUM(CASE WHEN transfer."destinationAccountId" = account."id" THEN transfer."amount" ELSE -transfer."amount" END) FROM "Transfer" transfer WHERE transfer."workspaceId" = account."workspaceId" AND transfer."status" = 'SETTLED' AND (transfer."sourceAccountId" = account."id" OR transfer."destinationAccountId" = account."id")), 0)
           + COALESCE((SELECT SUM(adjustment."difference") FROM "BalanceAdjustment" adjustment WHERE adjustment."accountId" = account."id" AND adjustment."workspaceId" = account."workspaceId"), 0)
           - COALESCE((SELECT SUM(payment."amount") FROM "CreditCardInvoicePayment" payment WHERE payment."accountId" = account."id" AND payment."workspaceId" = account."workspaceId"), 0) AS balance,
         COALESCE((SELECT SUM(CASE WHEN movement."type" = 'DEPOSIT' THEN movement."amount" ELSE -movement."amount" END) FROM "SavingsGoalMovement" movement WHERE movement."accountId" = account."id" AND movement."workspaceId" = account."workspaceId"), 0) AS reserved
  FROM "FinancialAccount" account
)
SELECT *, balance - reserved AS free_balance
FROM account_balance
WHERE reserved < 0 OR (reserved > 0 AND reserved > balance)
ORDER BY "workspaceId", "id";

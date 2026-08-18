\set ON_ERROR_STOP on
\pset pager off

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

\echo 'MIGRATIONS'
SELECT * FROM "_prisma_migrations" ORDER BY started_at;

\echo 'CARDINALITY'
SELECT table_name, row_count
FROM (
  SELECT 'Workspace' AS table_name, COUNT(*)::bigint AS row_count FROM "Workspace"
  UNION ALL SELECT 'Editor', COUNT(*) FROM "Editor"
  UNION ALL SELECT 'AccessGrant', COUNT(*) FROM "AccessGrant"
  UNION ALL SELECT 'AccessSession', COUNT(*) FROM "AccessSession"
  UNION ALL SELECT 'FinancialAccount', COUNT(*) FROM "FinancialAccount"
  UNION ALL SELECT 'Category', COUNT(*) FROM "Category"
  UNION ALL SELECT 'Transaction', COUNT(*) FROM "Transaction"
  UNION ALL SELECT 'BalanceAdjustment', COUNT(*) FROM "BalanceAdjustment"
  UNION ALL SELECT 'Transfer', COUNT(*) FROM "Transfer"
  UNION ALL SELECT 'FixedExpense', COUNT(*) FROM "FixedExpense"
  UNION ALL SELECT 'Salary', COUNT(*) FROM "Salary"
  UNION ALL SELECT 'Debt', COUNT(*) FROM "Debt"
  UNION ALL SELECT 'DebtInstallment', COUNT(*) FROM "DebtInstallment"
  UNION ALL SELECT 'DebtInstallmentShare', COUNT(*) FROM "DebtInstallmentShare"
  UNION ALL SELECT 'CreditCard', COUNT(*) FROM "CreditCard"
  UNION ALL SELECT 'CreditCardPurchase', COUNT(*) FROM "CreditCardPurchase"
  UNION ALL SELECT 'CreditCardInstallment', COUNT(*) FROM "CreditCardInstallment"
  UNION ALL SELECT 'CreditCardInstallmentShare', COUNT(*) FROM "CreditCardInstallmentShare"
  UNION ALL SELECT 'CreditCardInvoice', COUNT(*) FROM "CreditCardInvoice"
  UNION ALL SELECT 'CreditCardInvoicePayment', COUNT(*) FROM "CreditCardInvoicePayment"
  UNION ALL SELECT 'SavingsGoal', COUNT(*) FROM "SavingsGoal"
  UNION ALL SELECT 'SavingsGoalMovement', COUNT(*) FROM "SavingsGoalMovement"
  UNION ALL SELECT 'Investment', COUNT(*) FROM "Investment"
  UNION ALL SELECT 'AuditLog', COUNT(*) FROM "AuditLog"
) cardinality
ORDER BY table_name;

\echo 'A_INVALID_VALUES'
SELECT *
FROM (
  SELECT 'A01' AS check_code, 'Transaction' AS table_name, id::text AS row_id, amount::text AS observed, 'amount > 0' AS expected FROM "Transaction" WHERE amount <= 0
  UNION ALL SELECT 'A02', 'Transfer', id::text, amount::text, 'amount > 0' FROM "Transfer" WHERE amount <= 0
  UNION ALL SELECT 'A03', 'Debt', id::text, "totalAmount"::text, 'totalAmount > 0' FROM "Debt" WHERE "totalAmount" <= 0
  UNION ALL SELECT 'A04', 'DebtInstallment', id::text, amount::text, 'amount > 0' FROM "DebtInstallment" WHERE amount <= 0
  UNION ALL SELECT 'A05', 'DebtInstallmentShare', id::text, amount::text, 'amount > 0' FROM "DebtInstallmentShare" WHERE amount <= 0
  UNION ALL SELECT 'A06', 'CreditCard', id::text, "limit"::text, 'limit >= 0' FROM "CreditCard" WHERE "limit" < 0
  UNION ALL SELECT 'A07', 'CreditCardPurchase', id::text, "totalAmount"::text, 'totalAmount > 0' FROM "CreditCardPurchase" WHERE "totalAmount" <= 0
  UNION ALL SELECT 'A08', 'CreditCardInstallment', id::text, amount::text, 'amount > 0' FROM "CreditCardInstallment" WHERE amount <= 0
  UNION ALL SELECT 'A09', 'CreditCardInstallmentShare', id::text, amount::text, 'amount > 0' FROM "CreditCardInstallmentShare" WHERE amount <= 0
  UNION ALL SELECT 'A10', 'CreditCardInvoicePayment', id::text, amount::text, 'amount > 0' FROM "CreditCardInvoicePayment" WHERE amount <= 0
  UNION ALL SELECT 'A11', 'SavingsGoal', id::text, "targetAmount"::text, 'targetAmount > 0' FROM "SavingsGoal" WHERE "targetAmount" <= 0
  UNION ALL SELECT 'A12', 'SavingsGoalMovement', id::text, amount::text, 'amount > 0' FROM "SavingsGoalMovement" WHERE amount <= 0
  UNION ALL SELECT 'A13', 'Investment', id::text, amount::text, 'amount >= 0' FROM "Investment" WHERE amount < 0
  UNION ALL SELECT 'A14', 'FixedExpense', id::text, amount::text, 'amount > 0' FROM "FixedExpense" WHERE amount <= 0
  UNION ALL SELECT 'A15', 'Salary', id::text, amount::text, 'amount > 0' FROM "Salary" WHERE amount <= 0
) findings
ORDER BY check_code, row_id;

\echo 'B_PERSON_ACCOUNT'
SELECT *
FROM (
  SELECT 'B01' AS check_code, 'Transaction' AS table_name, row.id::text AS row_id, row."personEditorId"::text AS row_person_id, account."personEditorId"::text AS account_person_id, account.id::text AS account_id
  FROM "Transaction" row JOIN "FinancialAccount" account ON account.id = row."accountId"
  WHERE row."personEditorId" <> account."personEditorId"
  UNION ALL SELECT 'B02', 'FixedExpense', row.id::text, row."personEditorId"::text, account."personEditorId"::text, account.id::text
  FROM "FixedExpense" row JOIN "FinancialAccount" account ON account.id = row."accountId"
  WHERE row."personEditorId" <> account."personEditorId"
  UNION ALL SELECT 'B03', 'Salary', row.id::text, row."personEditorId"::text, account."personEditorId"::text, account.id::text
  FROM "Salary" row JOIN "FinancialAccount" account ON account.id = row."accountId"
  WHERE row."personEditorId" <> account."personEditorId"
  UNION ALL SELECT 'B04', 'SavingsGoal', row.id::text, row."personEditorId"::text, account."personEditorId"::text, account.id::text
  FROM "SavingsGoal" row JOIN "FinancialAccount" account ON account.id = row."accountId"
  WHERE row."personEditorId" <> account."personEditorId"
  UNION ALL SELECT 'B05', 'SavingsGoalMovement', row.id::text, row."personEditorId"::text, account."personEditorId"::text, account.id::text
  FROM "SavingsGoalMovement" row JOIN "FinancialAccount" account ON account.id = row."accountId"
  WHERE row."personEditorId" <> account."personEditorId"
  UNION ALL SELECT 'B06', 'Investment', row.id::text, row."personEditorId"::text, account."personEditorId"::text, account.id::text
  FROM "Investment" row JOIN "FinancialAccount" account ON account.id = row."accountId"
  WHERE row."personEditorId" <> account."personEditorId"
  UNION ALL SELECT 'B07', 'CreditCard', row.id::text, row."personEditorId"::text, account."personEditorId"::text, account.id::text
  FROM "CreditCard" row JOIN "FinancialAccount" account ON account.id = row."paymentAccountId"
  WHERE row."personEditorId" <> account."personEditorId"
  UNION ALL SELECT 'B08', 'CreditCardInvoicePayment', row.id::text, row."personEditorId"::text, account."personEditorId"::text, account.id::text
  FROM "CreditCardInvoicePayment" row JOIN "FinancialAccount" account ON account.id = row."accountId"
  WHERE row."personEditorId" <> account."personEditorId"
) findings
ORDER BY check_code, row_id;

\echo 'C_WORKSPACE_FKS'
SELECT *
FROM (
  SELECT 'C01' AS check_code, 'FinancialAccount.personEditorId' AS relation_name, row.id::text AS row_id, ref.id::text AS referenced_id, row."workspaceId"::text AS row_workspace, ref."workspaceId"::text AS referenced_workspace FROM "FinancialAccount" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C02', 'Transaction.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transaction" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C03', 'Transaction.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transaction" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C04', 'Transaction.categoryId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transaction" row JOIN "Category" ref ON ref.id = row."categoryId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C05', 'Transaction.fixedExpenseId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transaction" row JOIN "FixedExpense" ref ON ref.id = row."fixedExpenseId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C06', 'Transaction.salaryId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transaction" row JOIN "Salary" ref ON ref.id = row."salaryId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C07', 'Transaction.debtInstallmentId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transaction" row JOIN "DebtInstallment" ref ON ref.id = row."debtInstallmentId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C08', 'Transaction.creditCardInstallmentId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transaction" row JOIN "CreditCardInstallment" ref ON ref.id = row."creditCardInstallmentId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C09', 'BalanceAdjustment.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "BalanceAdjustment" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C10', 'BalanceAdjustment.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "BalanceAdjustment" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C11', 'Transfer.sourceAccountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transfer" row JOIN "FinancialAccount" ref ON ref.id = row."sourceAccountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C12', 'Transfer.destinationAccountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transfer" row JOIN "FinancialAccount" ref ON ref.id = row."destinationAccountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C13', 'Transfer.sourcePersonEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transfer" row JOIN "Editor" ref ON ref.id = row."sourcePersonEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C14', 'Transfer.destinationPersonEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Transfer" row JOIN "Editor" ref ON ref.id = row."destinationPersonEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C15', 'FixedExpense.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "FixedExpense" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C16', 'FixedExpense.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "FixedExpense" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C17', 'FixedExpense.categoryId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "FixedExpense" row JOIN "Category" ref ON ref.id = row."categoryId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C18', 'Salary.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Salary" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C19', 'Salary.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Salary" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C20', 'Salary.categoryId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Salary" row JOIN "Category" ref ON ref.id = row."categoryId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C21', 'Debt.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Debt" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C22', 'Debt.categoryId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Debt" row JOIN "Category" ref ON ref.id = row."categoryId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C23', 'DebtInstallment.debtId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "DebtInstallment" row JOIN "Debt" ref ON ref.id = row."debtId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C24', 'DebtInstallment.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "DebtInstallment" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C25', 'DebtInstallmentShare.installmentId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "DebtInstallmentShare" row JOIN "DebtInstallment" ref ON ref.id = row."installmentId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C26', 'DebtInstallmentShare.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "DebtInstallmentShare" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C27', 'CreditCard.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCard" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C28', 'CreditCard.paymentAccountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCard" row JOIN "FinancialAccount" ref ON ref.id = row."paymentAccountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C29', 'CreditCardPurchase.cardId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardPurchase" row JOIN "CreditCard" ref ON ref.id = row."cardId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C30', 'CreditCardPurchase.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardPurchase" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C31', 'CreditCardPurchase.categoryId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardPurchase" row JOIN "Category" ref ON ref.id = row."categoryId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C32', 'CreditCardInstallment.cardId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInstallment" row JOIN "CreditCard" ref ON ref.id = row."cardId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C33', 'CreditCardInstallment.purchaseId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInstallment" row JOIN "CreditCardPurchase" ref ON ref.id = row."purchaseId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C34', 'CreditCardInstallment.invoiceId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInstallment" row JOIN "CreditCardInvoice" ref ON ref.id = row."invoiceId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C35', 'CreditCardInstallment.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInstallment" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C36', 'CreditCardInstallment.categoryId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInstallment" row JOIN "Category" ref ON ref.id = row."categoryId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C37', 'CreditCardInstallmentShare.installmentId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInstallmentShare" row JOIN "CreditCardInstallment" ref ON ref.id = row."installmentId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C38', 'CreditCardInstallmentShare.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInstallmentShare" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C39', 'CreditCardInvoice.cardId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInvoice" row JOIN "CreditCard" ref ON ref.id = row."cardId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C40', 'CreditCardInvoice.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInvoice" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C41', 'CreditCardInvoicePayment.invoiceId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInvoicePayment" row JOIN "CreditCardInvoice" ref ON ref.id = row."invoiceId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C42', 'CreditCardInvoicePayment.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInvoicePayment" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C43', 'CreditCardInvoicePayment.creditCardInstallmentId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInvoicePayment" row JOIN "CreditCardInstallment" ref ON ref.id = row."creditCardInstallmentId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C44', 'CreditCardInvoicePayment.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "CreditCardInvoicePayment" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C45', 'SavingsGoal.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "SavingsGoal" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C46', 'SavingsGoal.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "SavingsGoal" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C47', 'SavingsGoalMovement.goalId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "SavingsGoalMovement" row JOIN "SavingsGoal" ref ON ref.id = row."goalId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C48', 'SavingsGoalMovement.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "SavingsGoalMovement" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C49', 'SavingsGoalMovement.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "SavingsGoalMovement" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C50', 'Investment.personEditorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Investment" row JOIN "Editor" ref ON ref.id = row."personEditorId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C51', 'Investment.accountId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "Investment" row JOIN "FinancialAccount" ref ON ref.id = row."accountId" WHERE row."workspaceId" <> ref."workspaceId"
  UNION ALL SELECT 'C52', 'AuditLog.editorId', row.id::text, ref.id::text, row."workspaceId"::text, ref."workspaceId"::text FROM "AuditLog" row JOIN "Editor" ref ON ref.id = row."editorId" WHERE row."workspaceId" <> ref."workspaceId"
) findings
ORDER BY check_code, row_id;

\echo 'D_CREDIT_CARDS'
WITH invoice_totals AS (
  SELECT invoice.id,
         COALESCE(SUM(installment.amount) FILTER (WHERE installment.status <> 'CANCELED'), 0)::numeric(19,2) AS installment_total
  FROM "CreditCardInvoice" invoice
  LEFT JOIN "CreditCardInstallment" installment ON installment."invoiceId" = invoice.id
  GROUP BY invoice.id
), payment_totals AS (
  SELECT invoice.id,
         COALESCE(SUM(payment.amount), 0)::numeric(19,2) AS payment_total
  FROM "CreditCardInvoice" invoice
  LEFT JOIN "CreditCardInvoicePayment" payment ON payment."invoiceId" = invoice.id
  GROUP BY invoice.id
)
SELECT *
FROM (
  SELECT 'D01' AS check_code, 'CreditCardInvoice' AS table_name, invoice.id::text AS row_id, NULL::text AS related_id, invoice.amount::text AS observed, totals.installment_total::text AS expected
  FROM "CreditCardInvoice" invoice JOIN invoice_totals totals ON totals.id = invoice.id
  WHERE invoice.amount <> totals.installment_total
  UNION ALL SELECT 'D02', 'CreditCardInvoice', invoice.id::text, NULL, invoice."paidAmount"::text, totals.payment_total::text
  FROM "CreditCardInvoice" invoice JOIN payment_totals totals ON totals.id = invoice.id
  WHERE invoice."paidAmount" <> totals.payment_total
  UNION ALL SELECT 'D03', 'CreditCardInvoice', invoice.id::text, NULL, concat(invoice.status::text, ':', invoice."paidAmount"), concat('PAID requires paidAmount >= ', invoice.amount)
  FROM "CreditCardInvoice" invoice WHERE invoice.status = 'PAID' AND invoice."paidAmount" < invoice.amount
  UNION ALL SELECT 'D04', 'CreditCardInvoice', invoice.id::text, NULL, concat(invoice.status::text, ':', invoice."paidAmount"), concat('OPEN requires paidAmount < ', invoice.amount)
  FROM "CreditCardInvoice" invoice WHERE invoice.status = 'OPEN' AND invoice.amount > 0 AND invoice."paidAmount" >= invoice.amount
  UNION ALL SELECT 'D05', 'CreditCardInstallment', installment.id::text, installment."invoiceId"::text, installment.status::text, 'PAID requires direct payment or fully paid invoice'
  FROM "CreditCardInstallment" installment
  LEFT JOIN invoice_totals invoice_amount ON invoice_amount.id = installment."invoiceId"
  LEFT JOIN payment_totals invoice_payment ON invoice_payment.id = installment."invoiceId"
  WHERE installment.status = 'PAID'
    AND NOT EXISTS (SELECT 1 FROM "CreditCardInvoicePayment" payment WHERE payment."creditCardInstallmentId" = installment.id)
    AND NOT (COALESCE(invoice_amount.installment_total, 0) > 0 AND COALESCE(invoice_payment.payment_total, 0) >= invoice_amount.installment_total)
  UNION ALL SELECT 'D06', 'CreditCardInstallment', installment.id::text, installment."invoiceId"::text, installment.status::text, 'PAID because invoice is fully paid'
  FROM "CreditCardInstallment" installment
  JOIN invoice_totals invoice_amount ON invoice_amount.id = installment."invoiceId"
  JOIN payment_totals invoice_payment ON invoice_payment.id = installment."invoiceId"
  WHERE installment.status = 'OPEN' AND invoice_amount.installment_total > 0 AND invoice_payment.payment_total >= invoice_amount.installment_total
  UNION ALL SELECT 'D07', 'Transaction', transaction.id::text, installment.id::text, transaction.status::text, 'SETTLED requires card payment evidence'
  FROM "Transaction" transaction
  JOIN "CreditCardInstallment" installment ON installment.id = transaction."creditCardInstallmentId"
  LEFT JOIN invoice_totals invoice_amount ON invoice_amount.id = installment."invoiceId"
  LEFT JOIN payment_totals invoice_payment ON invoice_payment.id = installment."invoiceId"
  WHERE transaction.status = 'SETTLED'
    AND NOT EXISTS (SELECT 1 FROM "CreditCardInvoicePayment" payment WHERE payment."creditCardInstallmentId" = installment.id)
    AND NOT (COALESCE(invoice_amount.installment_total, 0) > 0 AND COALESCE(invoice_payment.payment_total, 0) >= invoice_amount.installment_total)
  UNION ALL SELECT 'D08', 'Transaction', transaction.id::text, installment.id::text, transaction.status::text, 'SETTLED because installment has payment evidence'
  FROM "Transaction" transaction
  JOIN "CreditCardInstallment" installment ON installment.id = transaction."creditCardInstallmentId"
  LEFT JOIN invoice_totals invoice_amount ON invoice_amount.id = installment."invoiceId"
  LEFT JOIN payment_totals invoice_payment ON invoice_payment.id = installment."invoiceId"
  WHERE transaction.status = 'PENDING'
    AND (EXISTS (SELECT 1 FROM "CreditCardInvoicePayment" payment WHERE payment."creditCardInstallmentId" = installment.id)
      OR (COALESCE(invoice_amount.installment_total, 0) > 0 AND COALESCE(invoice_payment.payment_total, 0) >= invoice_amount.installment_total))
  UNION ALL SELECT 'D09', 'CreditCardInstallmentShare', share.id::text, installment.id::text, share.status::text, installment.status::text
  FROM "CreditCardInstallmentShare" share JOIN "CreditCardInstallment" installment ON installment.id = share."installmentId"
  WHERE share.status <> installment.status
  UNION ALL SELECT 'D10', 'CreditCardPurchase', purchase.id::text, NULL, purchase."totalAmount"::text, COALESCE(SUM(installment.amount), 0)::numeric(19,2)::text
  FROM "CreditCardPurchase" purchase LEFT JOIN "CreditCardInstallment" installment ON installment."purchaseId" = purchase.id
  GROUP BY purchase.id HAVING purchase."totalAmount" <> COALESCE(SUM(installment.amount), 0)
  UNION ALL SELECT 'D11', 'CreditCardInstallment', installment.id::text, NULL, installment.amount::text, SUM(share.amount)::numeric(19,2)::text
  FROM "CreditCardInstallment" installment JOIN "CreditCardInstallmentShare" share ON share."installmentId" = installment.id
  GROUP BY installment.id HAVING installment.amount <> SUM(share.amount)
  UNION ALL SELECT 'D12', 'CreditCardInstallment', installment.id::text, installment."invoiceId"::text, installment."cardId"::text, invoice."cardId"::text
  FROM "CreditCardInstallment" installment JOIN "CreditCardInvoice" invoice ON invoice.id = installment."invoiceId"
  WHERE installment."cardId" <> invoice."cardId"
  UNION ALL SELECT 'D13', 'CreditCardInstallment', installment.id::text, installment."purchaseId"::text, installment."cardId"::text, purchase."cardId"::text
  FROM "CreditCardInstallment" installment JOIN "CreditCardPurchase" purchase ON purchase.id = installment."purchaseId"
  WHERE installment."cardId" <> purchase."cardId"
  UNION ALL SELECT 'D14', 'CreditCardInvoicePayment', payment.id::text, installment.id::text, payment."invoiceId"::text, installment."invoiceId"::text
  FROM "CreditCardInvoicePayment" payment JOIN "CreditCardInstallment" installment ON installment.id = payment."creditCardInstallmentId"
  WHERE payment."invoiceId" <> installment."invoiceId"
  UNION ALL SELECT 'D15', 'CreditCardInvoicePayment', payment.id::text, installment.id::text, payment.amount::text, installment.amount::text
  FROM "CreditCardInvoicePayment" payment JOIN "CreditCardInstallment" installment ON installment.id = payment."creditCardInstallmentId"
  WHERE payment.amount <> installment.amount
  UNION ALL SELECT 'D16', 'CreditCardInvoice', invoice.id::text, NULL, invoice."paidAmount"::text, concat('<= ', invoice.amount)
  FROM "CreditCardInvoice" invoice WHERE invoice."paidAmount" > invoice.amount OR invoice."paidAmount" < 0 OR invoice.amount < 0
  UNION ALL SELECT 'D17', 'Transaction', transaction.id::text, installment.id::text, transaction.amount::text, installment.amount::text
  FROM "Transaction" transaction JOIN "CreditCardInstallment" installment ON installment.id = transaction."creditCardInstallmentId"
  WHERE transaction.amount <> installment.amount OR transaction.type <> 'EXPENSE' OR transaction."affectsBalance" <> false
) findings
ORDER BY check_code, row_id;

\echo 'E_DEBTS'
SELECT *
FROM (
  SELECT 'E01' AS check_code, 'Debt' AS table_name, debt.id::text AS row_id, NULL::text AS related_id, debt."totalAmount"::text AS observed, COALESCE(SUM(installment.amount), 0)::numeric(19,2)::text AS expected
  FROM "Debt" debt LEFT JOIN "DebtInstallment" installment ON installment."debtId" = debt.id
  GROUP BY debt.id HAVING debt."totalAmount" <> COALESCE(SUM(installment.amount), 0)
  UNION ALL SELECT 'E02', 'DebtInstallment', installment.id::text, NULL, installment.amount::text, SUM(share.amount)::numeric(19,2)::text
  FROM "DebtInstallment" installment JOIN "DebtInstallmentShare" share ON share."installmentId" = installment.id
  GROUP BY installment.id HAVING installment.amount <> SUM(share.amount)
  UNION ALL SELECT 'E03', 'DebtInstallment', installment.id::text, NULL, installment.status::text, 'PAID requires Transaction'
  FROM "DebtInstallment" installment
  WHERE installment.status = 'PAID' AND NOT EXISTS (SELECT 1 FROM "Transaction" transaction WHERE transaction."debtInstallmentId" = installment.id)
  UNION ALL SELECT 'E04', 'DebtInstallment', installment.id::text, transaction.id::text, installment.status::text || '/' || transaction.status::text, 'PAID/SETTLED'
  FROM "DebtInstallment" installment JOIN "Transaction" transaction ON transaction."debtInstallmentId" = installment.id
  WHERE installment.status = 'PAID' AND transaction.status <> 'SETTLED'
  UNION ALL SELECT 'E05', 'DebtInstallment', installment.id::text, transaction.id::text, installment.status::text || '/' || transaction.status::text, 'PENDING must not have SETTLED payment'
  FROM "DebtInstallment" installment JOIN "Transaction" transaction ON transaction."debtInstallmentId" = installment.id
  WHERE installment.status = 'PENDING' AND transaction.status = 'SETTLED'
  UNION ALL SELECT 'E06', 'DebtInstallmentShare', share.id::text, installment.id::text, share.status::text, installment.status::text
  FROM "DebtInstallmentShare" share JOIN "DebtInstallment" installment ON installment.id = share."installmentId"
  WHERE share.status = 'PAID' AND installment.status <> 'PAID'
  UNION ALL SELECT 'E07', 'Transaction', transaction.id::text, installment.id::text, concat(transaction."workspaceId", '/', transaction."personEditorId"), concat(installment."workspaceId", '/', installment."personEditorId")
  FROM "Transaction" transaction JOIN "DebtInstallment" installment ON installment.id = transaction."debtInstallmentId"
  WHERE transaction."workspaceId" <> installment."workspaceId" OR transaction."personEditorId" <> installment."personEditorId"
  UNION ALL SELECT 'E08', 'Transaction', transaction.id::text, installment.id::text, concat(transaction.amount, '/', transaction.type::text, '/', transaction."affectsBalance"), concat(installment.amount, '/EXPENSE/true')
  FROM "Transaction" transaction JOIN "DebtInstallment" installment ON installment.id = transaction."debtInstallmentId"
  WHERE transaction.amount <> installment.amount OR transaction.type <> 'EXPENSE' OR transaction."affectsBalance" <> true
  UNION ALL SELECT 'E09', 'DebtInstallment', installment.id::text, debt.id::text, installment."personEditorId"::text, debt."personEditorId"::text
  FROM "DebtInstallment" installment JOIN "Debt" debt ON debt.id = installment."debtId"
  WHERE installment."personEditorId" <> debt."personEditorId"
  UNION ALL SELECT 'E10', 'DebtInstallment', installment.id::text, NULL, concat(installment.status::text, '/', COALESCE(installment."paidAt"::text, 'NULL')), 'PAID has paidAt; PENDING has no paidAt'
  FROM "DebtInstallment" installment
  WHERE (installment.status = 'PAID' AND installment."paidAt" IS NULL) OR (installment.status = 'PENDING' AND installment."paidAt" IS NOT NULL)
) findings
ORDER BY check_code, row_id;

\echo 'F_SALARIES'
WITH salary_transactions AS (
  SELECT transaction.*, salary.frequency, salary."paymentDay", salary."startMonth", salary."archivedAt", salary.active AS salary_active,
         salary."personEditorId" AS salary_person_id, salary."accountId" AS salary_account_id,
         (date_trunc('month', transaction."competenceDate") +
           (LEAST(salary."paymentDay", EXTRACT(day FROM (date_trunc('month', transaction."competenceDate") + interval '1 month - 1 day'))::int) - 1) * interval '1 day')::date AS first_expected_date,
         (date_trunc('month', transaction."competenceDate") + interval '1 month - 1 day')::date AS last_expected_date
  FROM "Transaction" transaction JOIN "Salary" salary ON salary.id = transaction."salaryId"
)
SELECT *
FROM (
  SELECT 'F01' AS check_code, 'Transaction' AS table_name, "salaryId"::text AS row_id, "competenceDate"::text AS related_id, COUNT(*)::text AS observed, '1 transaction per salary/competence' AS expected
  FROM "Transaction" WHERE "salaryId" IS NOT NULL GROUP BY "salaryId", "competenceDate" HAVING COUNT(*) > 1
  UNION ALL SELECT 'F02', 'Transaction', id::text, "salaryId"::text, "competenceDate"::text, CASE WHEN frequency = 'MONTHLY' THEN first_expected_date::text ELSE first_expected_date::text || ' or ' || last_expected_date::text END
  FROM salary_transactions
  WHERE "competenceDate" < "startMonth"
     OR ("archivedAt" IS NOT NULL AND "competenceDate" > "archivedAt")
     OR (frequency = 'MONTHLY' AND "competenceDate" <> first_expected_date)
     OR (frequency = 'FORTNIGHTLY' AND "competenceDate" NOT IN (first_expected_date, last_expected_date))
  UNION ALL SELECT 'F03', 'Transaction', transaction.id::text, salary.id::text, concat(transaction."personEditorId", '/', COALESCE(transaction."accountId"::text, 'NULL')), concat(salary."personEditorId", '/', COALESCE(salary."accountId"::text, 'NULL'))
  FROM "Transaction" transaction JOIN "Salary" salary ON salary.id = transaction."salaryId"
  WHERE transaction."personEditorId" <> salary."personEditorId" OR transaction."accountId" IS DISTINCT FROM salary."accountId"
  UNION ALL SELECT 'F05', 'Salary', salary.id::text, NULL, concat('active=', salary.active, ', archivedAt=', COALESCE(salary."archivedAt"::text, 'NULL')), 'active=true/archivedAt=NULL or active=false/archivedAt set'
  FROM "Salary" salary
  WHERE (salary.active AND salary."archivedAt" IS NOT NULL) OR (salary.active = false AND salary."archivedAt" IS NULL) OR (salary."archivedAt" IS NOT NULL AND salary."archivedAt" < salary."startMonth")
) findings
ORDER BY check_code, row_id, related_id;

\echo 'G_FIXED_EXPENSES'
WITH fixed_transactions AS (
  SELECT transaction.*, fixed."dueDay", fixed."startMonth", fixed."endedAt", fixed.active AS fixed_active,
         fixed."personEditorId" AS fixed_person_id, fixed."accountId" AS fixed_account_id,
         (date_trunc('month', transaction."competenceDate") +
           (LEAST(fixed."dueDay", EXTRACT(day FROM (date_trunc('month', transaction."competenceDate") + interval '1 month - 1 day'))::int) - 1) * interval '1 day')::date AS expected_date
  FROM "Transaction" transaction JOIN "FixedExpense" fixed ON fixed.id = transaction."fixedExpenseId"
)
SELECT *
FROM (
  SELECT 'G01' AS check_code, 'Transaction' AS table_name, "fixedExpenseId"::text AS row_id, "competenceDate"::text AS related_id, COUNT(*)::text AS observed, '1 transaction per fixed expense/competence' AS expected
  FROM "Transaction" WHERE "fixedExpenseId" IS NOT NULL GROUP BY "fixedExpenseId", "competenceDate" HAVING COUNT(*) > 1
  UNION ALL SELECT 'G02', 'Transaction', id::text, "fixedExpenseId"::text, "competenceDate"::text, expected_date::text
  FROM fixed_transactions
  WHERE "competenceDate" <> expected_date OR "dueDate" IS DISTINCT FROM expected_date
  UNION ALL SELECT 'G04', 'Transaction', transaction.id::text, fixed.id::text, concat(transaction."personEditorId", '/', COALESCE(transaction."accountId"::text, 'NULL')), concat(fixed."personEditorId", '/', COALESCE(fixed."accountId"::text, 'NULL'))
  FROM "Transaction" transaction JOIN "FixedExpense" fixed ON fixed.id = transaction."fixedExpenseId"
  WHERE transaction."personEditorId" <> fixed."personEditorId" OR transaction."accountId" IS DISTINCT FROM fixed."accountId"
  UNION ALL SELECT 'G05', 'Transaction', id::text, "fixedExpenseId"::text, "competenceDate"::text, concat('between ', "startMonth", ' and ', COALESCE("endedAt"::text, 'infinity'))
  FROM fixed_transactions WHERE "competenceDate" < "startMonth" OR ("endedAt" IS NOT NULL AND "competenceDate" > "endedAt")
  UNION ALL SELECT 'G06', 'FixedExpense', fixed.id::text, NULL, concat('active=', fixed.active, ', endedAt=', COALESCE(fixed."endedAt"::text, 'NULL')), 'active=true/endedAt=NULL or active=false/endedAt set'
  FROM "FixedExpense" fixed
  WHERE (fixed.active AND fixed."endedAt" IS NOT NULL) OR (fixed.active = false AND fixed."endedAt" IS NULL) OR (fixed."endedAt" IS NOT NULL AND fixed."endedAt" < fixed."startMonth")
) findings
ORDER BY check_code, row_id, related_id;

\echo 'H_SAVINGS_GOALS'
WITH goal_balances AS (
  SELECT goal.id, COALESCE(SUM(CASE WHEN movement.type = 'DEPOSIT' THEN movement.amount ELSE -movement.amount END), 0)::numeric(19,2) AS balance
  FROM "SavingsGoal" goal LEFT JOIN "SavingsGoalMovement" movement ON movement."goalId" = goal.id
  GROUP BY goal.id
)
SELECT *
FROM (
  SELECT 'H01' AS check_code, 'SavingsGoal' AS table_name, id::text AS row_id, NULL::text AS related_id, balance::text AS observed, 'balance >= 0' AS expected
  FROM goal_balances WHERE balance < 0
  UNION ALL SELECT 'H02', 'SavingsGoalMovement', movement.id::text, goal.id::text, movement."personEditorId"::text, goal."personEditorId"::text
  FROM "SavingsGoalMovement" movement JOIN "SavingsGoal" goal ON goal.id = movement."goalId"
  WHERE movement."personEditorId" <> goal."personEditorId"
  UNION ALL SELECT 'H03', 'SavingsGoalMovement', movement.id::text, goal.id::text, COALESCE(movement."accountId"::text, 'NULL'), COALESCE(goal."accountId"::text, 'NULL')
  FROM "SavingsGoalMovement" movement JOIN "SavingsGoal" goal ON goal.id = movement."goalId"
  WHERE movement."accountId" IS DISTINCT FROM goal."accountId"
) findings
ORDER BY check_code, row_id;

\echo 'I_TRANSFERS'
SELECT *
FROM (
  SELECT 'I01' AS check_code, 'Transfer' AS table_name, transfer.id::text AS row_id, transfer."sourceAccountId"::text AS related_id, transfer."destinationAccountId"::text AS observed, 'sourceAccountId <> destinationAccountId' AS expected
  FROM "Transfer" transfer WHERE transfer."sourceAccountId" = transfer."destinationAccountId"
  UNION ALL SELECT 'I02', 'Transfer', transfer.id::text, source.id::text, transfer."sourcePersonEditorId"::text, source."personEditorId"::text
  FROM "Transfer" transfer JOIN "FinancialAccount" source ON source.id = transfer."sourceAccountId"
  WHERE transfer."sourcePersonEditorId" <> source."personEditorId"
  UNION ALL SELECT 'I03', 'Transfer', transfer.id::text, destination.id::text, transfer."destinationPersonEditorId"::text, destination."personEditorId"::text
  FROM "Transfer" transfer JOIN "FinancialAccount" destination ON destination.id = transfer."destinationAccountId"
  WHERE transfer."destinationPersonEditorId" <> destination."personEditorId"
) findings
ORDER BY check_code, row_id;

\echo 'J_CATEGORIES'
SELECT *
FROM (
  SELECT 'J01' AS check_code, 'Transaction' AS table_name, transaction.id::text AS row_id, category.id::text AS related_id, transaction.type::text AS observed, category.kind::text AS expected
  FROM "Transaction" transaction JOIN "Category" category ON category.id = transaction."categoryId"
  WHERE (transaction.type = 'INCOME' AND category.kind = 'EXPENSE') OR (transaction.type = 'EXPENSE' AND category.kind = 'INCOME')
  UNION ALL SELECT 'J02', 'Salary', salary.id::text, category.id::text, category.kind::text, 'INCOME'
  FROM "Salary" salary JOIN "Category" category ON category.id = salary."categoryId" WHERE category.kind <> 'INCOME'
  UNION ALL SELECT 'J03', 'FixedExpense', fixed.id::text, category.id::text, category.kind::text, 'EXPENSE'
  FROM "FixedExpense" fixed JOIN "Category" category ON category.id = fixed."categoryId" WHERE category.kind <> 'EXPENSE'
  UNION ALL SELECT 'J04', 'Debt', debt.id::text, category.id::text, category.kind::text, 'EXPENSE'
  FROM "Debt" debt JOIN "Category" category ON category.id = debt."categoryId" WHERE category.kind <> 'EXPENSE'
  UNION ALL SELECT 'J05', 'CreditCardPurchase', purchase.id::text, category.id::text, category.kind::text, 'EXPENSE'
  FROM "CreditCardPurchase" purchase JOIN "Category" category ON category.id = purchase."categoryId" WHERE category.kind <> 'EXPENSE'
  UNION ALL SELECT 'J06', 'CreditCardInstallment', installment.id::text, category.id::text, category.kind::text, 'EXPENSE'
  FROM "CreditCardInstallment" installment JOIN "Category" category ON category.id = installment."categoryId" WHERE category.kind <> 'EXPENSE'
) findings
ORDER BY check_code, row_id;

COMMIT;

import "dotenv/config";

import { getDatabase } from "../src/lib/db";

const database = getDatabase();

const results = await database.$queryRaw<Array<{ rule: string; violations: number }>>`
  SELECT 'positive financial values' AS rule, COUNT(*)::int AS violations
  FROM (
    SELECT "id" FROM "Transaction" WHERE "amount" <= 0
    UNION ALL SELECT "id" FROM "Transfer" WHERE "amount" <= 0 OR "sourceAccountId" = "destinationAccountId"
    UNION ALL SELECT "id" FROM "Debt" WHERE "totalAmount" <= 0
    UNION ALL SELECT "id" FROM "DebtInstallment" WHERE "amount" <= 0
    UNION ALL SELECT "id" FROM "CreditCardPurchase" WHERE "totalAmount" <= 0
    UNION ALL SELECT "id" FROM "CreditCardInstallment" WHERE "amount" <= 0
    UNION ALL SELECT "id" FROM "SavingsGoalMovement" WHERE "amount" <= 0
  ) invalid_values
  UNION ALL
  SELECT 'debt installment totals', COUNT(*)::int
  FROM (
    SELECT debt."id"
    FROM "Debt" debt
    LEFT JOIN "DebtInstallment" installment ON installment."debtId" = debt."id"
    GROUP BY debt."id", debt."totalAmount"
    HAVING COALESCE(SUM(installment."amount"), 0) <> debt."totalAmount"
  ) invalid_debts
  UNION ALL
  SELECT 'installment share totals', COUNT(*)::int
  FROM (
    SELECT installment."id"
    FROM "DebtInstallment" installment
    JOIN "DebtInstallmentShare" share ON share."installmentId" = installment."id"
    GROUP BY installment."id", installment."amount"
    HAVING SUM(share."amount") <> installment."amount"
    UNION ALL
    SELECT installment."id"
    FROM "CreditCardInstallment" installment
    JOIN "CreditCardInstallmentShare" share ON share."installmentId" = installment."id"
    GROUP BY installment."id", installment."amount"
    HAVING SUM(share."amount") <> installment."amount"
  ) invalid_shares
  UNION ALL
  SELECT 'invoice totals and payments', COUNT(*)::int
  FROM (
    SELECT invoice."id"
    FROM "CreditCardInvoice" invoice
    LEFT JOIN "CreditCardInstallment" installment ON installment."invoiceId" = invoice."id" AND installment."status" <> 'CANCELED'
    GROUP BY invoice."id", invoice."amount"
    HAVING COALESCE(SUM(installment."amount"), 0) <> invoice."amount"
    UNION ALL
    SELECT invoice."id"
    FROM "CreditCardInvoice" invoice
    LEFT JOIN "CreditCardInvoicePayment" payment ON payment."invoiceId" = invoice."id"
    GROUP BY invoice."id", invoice."paidAmount"
    HAVING COALESCE(SUM(payment."amount"), 0) <> invoice."paidAmount"
  ) invalid_invoices
  UNION ALL
  SELECT 'non-negative savings goals', COUNT(*)::int
  FROM (
    SELECT movement."goalId"
    FROM "SavingsGoalMovement" movement
    GROUP BY movement."goalId"
    HAVING SUM(CASE WHEN movement."type" = 'DEPOSIT' THEN movement."amount" ELSE -movement."amount" END) < 0
  ) invalid_goals
  UNION ALL
  SELECT 'person and account ownership', COUNT(*)::int
  FROM (
    SELECT row_record."id" FROM "Transaction" row_record JOIN "FinancialAccount" account ON account."id" = row_record."accountId" WHERE row_record."personEditorId" <> account."personEditorId"
    UNION ALL SELECT row_record."id" FROM "FixedExpense" row_record JOIN "FinancialAccount" account ON account."id" = row_record."accountId" WHERE row_record."personEditorId" <> account."personEditorId"
    UNION ALL SELECT row_record."id" FROM "Salary" row_record JOIN "FinancialAccount" account ON account."id" = row_record."accountId" WHERE row_record."personEditorId" <> account."personEditorId"
    UNION ALL SELECT row_record."id" FROM "SavingsGoal" row_record JOIN "FinancialAccount" account ON account."id" = row_record."accountId" WHERE row_record."personEditorId" <> account."personEditorId"
    UNION ALL SELECT row_record."id" FROM "Investment" row_record JOIN "FinancialAccount" account ON account."id" = row_record."accountId" WHERE row_record."personEditorId" <> account."personEditorId"
    UNION ALL SELECT transfer."id" FROM "Transfer" transfer JOIN "FinancialAccount" account ON account."id" = transfer."sourceAccountId" WHERE transfer."sourcePersonEditorId" <> account."personEditorId"
    UNION ALL SELECT transfer."id" FROM "Transfer" transfer JOIN "FinancialAccount" account ON account."id" = transfer."destinationAccountId" WHERE transfer."destinationPersonEditorId" <> account."personEditorId"
  ) invalid_owners
  UNION ALL
  SELECT 'workspace references', COUNT(*)::int
  FROM (
    SELECT row_record."id" FROM "Transaction" row_record JOIN "FinancialAccount" account ON account."id" = row_record."accountId" WHERE row_record."workspaceId" <> account."workspaceId"
    UNION ALL SELECT row_record."id" FROM "DebtInstallment" row_record JOIN "Debt" debt ON debt."id" = row_record."debtId" WHERE row_record."workspaceId" <> debt."workspaceId"
    UNION ALL SELECT row_record."id" FROM "CreditCardInstallment" row_record JOIN "CreditCardPurchase" purchase ON purchase."id" = row_record."purchaseId" WHERE row_record."workspaceId" <> purchase."workspaceId"
    UNION ALL SELECT row_record."id" FROM "SavingsGoalMovement" row_record JOIN "SavingsGoal" goal ON goal."id" = row_record."goalId" WHERE row_record."workspaceId" <> goal."workspaceId"
  ) invalid_workspaces
  UNION ALL
  SELECT 'balance adjustment reconciliation', COUNT(*)::int
  FROM "BalanceAdjustment"
  WHERE "difference" <> "targetBalance" - "previousBalance"
`;

const failures = results.filter(({ violations }) => violations !== 0);

for (const result of results) {
  console.log(`${result.rule}: ${result.violations}`);
}

await database.$disconnect();

if (failures.length > 0) {
  throw new Error(`Financial invariant violations: ${failures.map(({ rule, violations }) => `${rule}=${violations}`).join(", ")}`);
}

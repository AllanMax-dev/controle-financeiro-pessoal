BEGIN;

DO $$
DECLARE
  reference_check RECORD;
  owner_check RECORD;
  has_invalid BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Transaction" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "Transfer" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "FixedExpense" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "Salary" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "Debt" WHERE "totalAmount" <= 0
    UNION ALL SELECT 1 FROM "DebtInstallment" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "DebtInstallmentShare" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "CreditCardPurchase" WHERE "totalAmount" <= 0
    UNION ALL SELECT 1 FROM "CreditCardInstallment" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "CreditCardInstallmentShare" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "CreditCardInvoicePayment" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "SavingsGoal" WHERE "targetAmount" <= 0
    UNION ALL SELECT 1 FROM "SavingsGoalMovement" WHERE "amount" <= 0
    UNION ALL SELECT 1 FROM "Investment" WHERE "amount" < 0
  ) THEN
    RAISE EXCEPTION 'Integrity migration blocked: non-positive financial values exist. Run docs/transactional-integrity-preview.sql';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Debt" WHERE "installmentCount" <= 0
    UNION ALL SELECT 1 FROM "DebtInstallment" WHERE "number" <= 0
    UNION ALL SELECT 1 FROM "CreditCardPurchase" WHERE "installmentCount" <= 0
    UNION ALL SELECT 1 FROM "CreditCardInstallment" WHERE "number" <= 0
    UNION ALL SELECT 1 FROM "FixedExpense" WHERE "dueDay" NOT BETWEEN 1 AND 31
    UNION ALL SELECT 1 FROM "Salary" WHERE "paymentDay" NOT BETWEEN 1 AND 31
    UNION ALL SELECT 1 FROM "CreditCard" WHERE "closingDay" NOT BETWEEN 1 AND 31 OR "dueDay" NOT BETWEEN 1 AND 31
  ) THEN
    RAISE EXCEPTION 'Integrity migration blocked: invalid installments or calendar days exist';
  END IF;

  IF EXISTS (SELECT 1 FROM "CreditCard" WHERE "limit" < 0)
     OR EXISTS (SELECT 1 FROM "CreditCardInvoice" WHERE "amount" < 0 OR "paidAmount" < 0 OR "paidAmount" > "amount")
     OR EXISTS (SELECT 1 FROM "Transfer" WHERE "sourceAccountId" = "destinationAccountId")
     OR EXISTS (SELECT 1 FROM "BalanceAdjustment" WHERE "difference" <> "targetBalance" - "previousBalance")
  THEN
    RAISE EXCEPTION 'Integrity migration blocked: card, transfer or balance-adjustment values are inconsistent';
  END IF;

  IF EXISTS (SELECT 1 FROM "FinancialAccount" WHERE "version" <= 0)
     OR EXISTS (SELECT 1 FROM "Transaction" WHERE "version" <= 0)
     OR EXISTS (SELECT 1 FROM "Transfer" WHERE "version" <= 0)
     OR EXISTS (SELECT 1 FROM "FixedExpense" WHERE "version" <= 0)
     OR EXISTS (SELECT 1 FROM "Salary" WHERE "version" <= 0)
     OR EXISTS (SELECT 1 FROM "Debt" WHERE "version" <= 0)
     OR EXISTS (SELECT 1 FROM "CreditCard" WHERE "version" <= 0)
  THEN
    RAISE EXCEPTION 'Integrity migration blocked: invalid optimistic-lock versions exist';
  END IF;

  IF EXISTS (
    SELECT movement."goalId"
    FROM "SavingsGoalMovement" movement
    GROUP BY movement."goalId"
    HAVING SUM(CASE WHEN movement."type" = 'DEPOSIT' THEN movement."amount" ELSE -movement."amount" END) < 0
  ) THEN
    RAISE EXCEPTION 'Integrity migration blocked: a savings goal has negative reserved balance';
  END IF;

  FOR reference_check IN
    SELECT * FROM (VALUES
      ('FinancialAccount', 'personEditorId', 'Editor'),
      ('Transaction', 'personEditorId', 'Editor'), ('Transaction', 'accountId', 'FinancialAccount'), ('Transaction', 'categoryId', 'Category'),
      ('Transaction', 'fixedExpenseId', 'FixedExpense'), ('Transaction', 'salaryId', 'Salary'), ('Transaction', 'debtInstallmentId', 'DebtInstallment'),
      ('Transaction', 'creditCardInstallmentId', 'CreditCardInstallment'), ('BalanceAdjustment', 'accountId', 'FinancialAccount'),
      ('BalanceAdjustment', 'personEditorId', 'Editor'), ('Transfer', 'sourceAccountId', 'FinancialAccount'),
      ('Transfer', 'destinationAccountId', 'FinancialAccount'), ('Transfer', 'sourcePersonEditorId', 'Editor'),
      ('Transfer', 'destinationPersonEditorId', 'Editor'), ('FixedExpense', 'personEditorId', 'Editor'),
      ('FixedExpense', 'accountId', 'FinancialAccount'), ('FixedExpense', 'categoryId', 'Category'),
      ('Salary', 'personEditorId', 'Editor'), ('Salary', 'accountId', 'FinancialAccount'), ('Salary', 'categoryId', 'Category'),
      ('Debt', 'personEditorId', 'Editor'), ('Debt', 'categoryId', 'Category'), ('DebtInstallment', 'debtId', 'Debt'),
      ('DebtInstallment', 'personEditorId', 'Editor'), ('DebtInstallmentShare', 'installmentId', 'DebtInstallment'),
      ('DebtInstallmentShare', 'personEditorId', 'Editor'), ('CreditCard', 'personEditorId', 'Editor'),
      ('CreditCard', 'paymentAccountId', 'FinancialAccount'), ('CreditCardPurchase', 'cardId', 'CreditCard'),
      ('CreditCardPurchase', 'personEditorId', 'Editor'), ('CreditCardPurchase', 'categoryId', 'Category'),
      ('CreditCardInstallment', 'cardId', 'CreditCard'), ('CreditCardInstallment', 'purchaseId', 'CreditCardPurchase'),
      ('CreditCardInstallment', 'invoiceId', 'CreditCardInvoice'), ('CreditCardInstallment', 'personEditorId', 'Editor'),
      ('CreditCardInstallment', 'categoryId', 'Category'), ('CreditCardInstallmentShare', 'installmentId', 'CreditCardInstallment'),
      ('CreditCardInstallmentShare', 'personEditorId', 'Editor'), ('CreditCardInvoice', 'cardId', 'CreditCard'),
      ('CreditCardInvoice', 'personEditorId', 'Editor'), ('CreditCardInvoicePayment', 'invoiceId', 'CreditCardInvoice'),
      ('CreditCardInvoicePayment', 'accountId', 'FinancialAccount'), ('CreditCardInvoicePayment', 'creditCardInstallmentId', 'CreditCardInstallment'),
      ('CreditCardInvoicePayment', 'personEditorId', 'Editor'), ('SavingsGoal', 'personEditorId', 'Editor'),
      ('SavingsGoal', 'accountId', 'FinancialAccount'), ('SavingsGoalMovement', 'goalId', 'SavingsGoal'),
      ('SavingsGoalMovement', 'personEditorId', 'Editor'), ('SavingsGoalMovement', 'accountId', 'FinancialAccount'),
      ('Investment', 'personEditorId', 'Editor'), ('Investment', 'accountId', 'FinancialAccount')
    ) AS checks(table_name, column_name, referenced_table)
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I row_record JOIN %I referenced ON referenced."id" = row_record.%I WHERE row_record.%I IS NOT NULL AND row_record."workspaceId" <> referenced."workspaceId")',
      reference_check.table_name,
      reference_check.referenced_table,
      reference_check.column_name,
      reference_check.column_name
    ) INTO has_invalid;
    IF has_invalid THEN
      RAISE EXCEPTION 'Integrity migration blocked: %.% crosses workspaces', reference_check.table_name, reference_check.column_name;
    END IF;
  END LOOP;

  FOR owner_check IN
    SELECT * FROM (VALUES
      ('Transaction', 'accountId', 'personEditorId'), ('BalanceAdjustment', 'accountId', 'personEditorId'),
      ('FixedExpense', 'accountId', 'personEditorId'), ('Salary', 'accountId', 'personEditorId'),
      ('CreditCard', 'paymentAccountId', 'personEditorId'), ('CreditCardInvoicePayment', 'accountId', 'personEditorId'),
      ('SavingsGoal', 'accountId', 'personEditorId'), ('SavingsGoalMovement', 'accountId', 'personEditorId'),
      ('Investment', 'accountId', 'personEditorId'), ('Transfer', 'sourceAccountId', 'sourcePersonEditorId'),
      ('Transfer', 'destinationAccountId', 'destinationPersonEditorId')
    ) AS checks(table_name, account_column, person_column)
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I row_record JOIN "FinancialAccount" account ON account."id" = row_record.%I WHERE row_record.%I IS NOT NULL AND account."personEditorId" <> row_record.%I)',
      owner_check.table_name,
      owner_check.account_column,
      owner_check.account_column,
      owner_check.person_column
    ) INTO has_invalid;
    IF has_invalid THEN
      RAISE EXCEPTION 'Integrity migration blocked: %.% belongs to another person', owner_check.table_name, owner_check.account_column;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM "Investment" investment
    JOIN "FinancialAccount" account ON account."id" = investment."accountId"
    WHERE account."type" <> 'INVESTMENT'
  ) THEN
    RAISE EXCEPTION 'Integrity migration blocked: an Investment is linked to a non-investment account';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "SavingsGoalMovement" movement
    JOIN "SavingsGoal" goal ON goal."id" = movement."goalId"
    WHERE movement."personEditorId" IS DISTINCT FROM goal."personEditorId"
       OR movement."accountId" IS DISTINCT FROM goal."accountId"
  ) THEN
    RAISE EXCEPTION 'Integrity migration blocked: a SavingsGoalMovement differs from its goal person or account';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_same_workspace_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  argument_index INTEGER := 0;
  reference_id UUID;
  reference_workspace_id UUID;
BEGIN
  WHILE argument_index < TG_NARGS LOOP
    reference_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[argument_index], '')::uuid;
    IF reference_id IS NOT NULL THEN
      reference_workspace_id := NULL;
      EXECUTE format('SELECT "workspaceId" FROM %I WHERE "id" = $1', TG_ARGV[argument_index + 1])
        INTO reference_workspace_id
        USING reference_id;
      IF reference_workspace_id IS NULL OR reference_workspace_id IS DISTINCT FROM NEW."workspaceId" THEN
        RAISE EXCEPTION '% cannot reference %.% from another workspace', TG_TABLE_NAME, TG_ARGV[argument_index + 1], reference_id;
      END IF;
    END IF;
    argument_index := argument_index + 2;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_account_person_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_id UUID;
  person_id UUID;
  account_person_id UUID;
  account_workspace_id UUID;
BEGIN
  account_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[0], '')::uuid;
  person_id := NULLIF(to_jsonb(NEW) ->> TG_ARGV[1], '')::uuid;
  IF account_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "personEditorId", "workspaceId"
  INTO account_person_id, account_workspace_id
  FROM "FinancialAccount"
  WHERE "id" = account_id;
  IF account_workspace_id IS DISTINCT FROM NEW."workspaceId" OR account_person_id IS DISTINCT FROM person_id THEN
    RAISE EXCEPTION '% account must belong to the selected person and workspace', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_investment_account_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."accountId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "FinancialAccount"
    WHERE "id" = NEW."accountId"
      AND "workspaceId" = NEW."workspaceId"
      AND "personEditorId" = NEW."personEditorId"
      AND "type" = 'INVESTMENT'
  ) THEN
    RAISE EXCEPTION 'Investment must use an investment account owned by the selected person';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION enforce_goal_movement_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "SavingsGoal" goal
    WHERE goal."id" = NEW."goalId"
      AND goal."workspaceId" = NEW."workspaceId"
      AND goal."personEditorId" = NEW."personEditorId"
      AND goal."accountId" IS NOT DISTINCT FROM NEW."accountId"
  ) THEN
    RAISE EXCEPTION 'SavingsGoalMovement must use the person and account defined by its goal';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_financial_source_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'SavingsGoal'
     AND (OLD."personEditorId" IS DISTINCT FROM NEW."personEditorId" OR OLD."accountId" IS DISTINCT FROM NEW."accountId")
     AND EXISTS (SELECT 1 FROM "SavingsGoalMovement" WHERE "goalId" = OLD."id")
  THEN
    RAISE EXCEPTION 'A savings goal with movements cannot change person or account';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_investment_account_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."type" <> 'INVESTMENT' AND EXISTS (SELECT 1 FROM "Investment" WHERE "accountId" = NEW."id") THEN
    RAISE EXCEPTION 'An account linked to Investment must remain an investment account';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION financial_account_balance(account_id UUID, workspace_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT account."initialBalance"
    + COALESCE((SELECT SUM(CASE WHEN transaction_record."type" = 'INCOME' THEN transaction_record."amount" ELSE -transaction_record."amount" END)
                FROM "Transaction" transaction_record
                WHERE transaction_record."accountId" = account.id AND transaction_record."workspaceId" = workspace_id
                  AND transaction_record."status" = 'SETTLED' AND transaction_record."affectsBalance"), 0)
    + COALESCE((SELECT SUM(CASE WHEN transfer."destinationAccountId" = account.id THEN transfer."amount" ELSE -transfer."amount" END)
                FROM "Transfer" transfer
                WHERE transfer."workspaceId" = workspace_id AND transfer."status" = 'SETTLED'
                  AND (transfer."sourceAccountId" = account.id OR transfer."destinationAccountId" = account.id)), 0)
    + COALESCE((SELECT SUM(adjustment."difference") FROM "BalanceAdjustment" adjustment
                WHERE adjustment."accountId" = account.id AND adjustment."workspaceId" = workspace_id), 0)
    - COALESCE((SELECT SUM(payment."amount") FROM "CreditCardInvoicePayment" payment
                WHERE payment."accountId" = account.id AND payment."workspaceId" = workspace_id), 0)
  FROM "FinancialAccount" account
  WHERE account."id" = account_id AND account."workspaceId" = workspace_id;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT account."id"
    FROM "FinancialAccount" account
    JOIN LATERAL (
      SELECT COALESCE(SUM(CASE WHEN movement."type" = 'DEPOSIT' THEN movement."amount" ELSE -movement."amount" END), 0) AS reserved
      FROM "SavingsGoalMovement" movement
      WHERE movement."accountId" = account."id" AND movement."workspaceId" = account."workspaceId"
    ) reservation ON TRUE
    WHERE reservation.reserved < 0
       OR (reservation.reserved > 0 AND reservation.reserved > financial_account_balance(account."id", account."workspaceId"))
  ) THEN
    RAISE EXCEPTION 'Integrity migration blocked: account reservations exceed account balances';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_account_reserve_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  argument_index INTEGER := 0;
  account_id UUID;
  new_account_id UUID;
  old_account_id UUID;
  workspace_id UUID;
  account_balance NUMERIC;
  reserved_balance NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    workspace_id := OLD."workspaceId";
  ELSE
    workspace_id := NEW."workspaceId";
  END IF;
  WHILE argument_index < TG_NARGS LOOP
    new_account_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NULLIF(to_jsonb(NEW) ->> TG_ARGV[argument_index], '')::uuid END;
    old_account_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE NULLIF(to_jsonb(OLD) ->> TG_ARGV[argument_index], '')::uuid END;
    FOREACH account_id IN ARRAY ARRAY[new_account_id, old_account_id] LOOP
      IF account_id IS NOT NULL AND EXISTS (SELECT 1 FROM "FinancialAccount" WHERE "id" = account_id AND "workspaceId" = workspace_id) THEN
        PERFORM 1 FROM "FinancialAccount" WHERE "id" = account_id AND "workspaceId" = workspace_id FOR UPDATE;
        account_balance := financial_account_balance(account_id, workspace_id);
        SELECT COALESCE(SUM(CASE WHEN movement."type" = 'DEPOSIT' THEN movement."amount" ELSE -movement."amount" END), 0)
        INTO reserved_balance
        FROM "SavingsGoalMovement" movement
        WHERE movement."accountId" = account_id AND movement."workspaceId" = workspace_id;
        IF reserved_balance < 0 OR (reserved_balance > 0 AND reserved_balance > account_balance) THEN
          RAISE EXCEPTION 'Account reserved balance exceeds its financial balance';
        END IF;
      END IF;
    END LOOP;
    argument_index := argument_index + 1;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER financial_account_workspace_integrity BEFORE INSERT OR UPDATE ON "FinancialAccount" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor');
CREATE TRIGGER transaction_workspace_integrity BEFORE INSERT OR UPDATE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor', 'accountId', 'FinancialAccount', 'categoryId', 'Category', 'fixedExpenseId', 'FixedExpense', 'salaryId', 'Salary', 'debtInstallmentId', 'DebtInstallment', 'creditCardInstallmentId', 'CreditCardInstallment');
CREATE TRIGGER balance_adjustment_workspace_integrity BEFORE INSERT OR UPDATE ON "BalanceAdjustment" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('accountId', 'FinancialAccount', 'personEditorId', 'Editor');
CREATE TRIGGER transfer_workspace_integrity BEFORE INSERT OR UPDATE ON "Transfer" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('sourceAccountId', 'FinancialAccount', 'destinationAccountId', 'FinancialAccount', 'sourcePersonEditorId', 'Editor', 'destinationPersonEditorId', 'Editor');
CREATE TRIGGER fixed_expense_workspace_integrity BEFORE INSERT OR UPDATE ON "FixedExpense" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor', 'accountId', 'FinancialAccount', 'categoryId', 'Category');
CREATE TRIGGER salary_workspace_integrity BEFORE INSERT OR UPDATE ON "Salary" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor', 'accountId', 'FinancialAccount', 'categoryId', 'Category');
CREATE TRIGGER debt_workspace_integrity BEFORE INSERT OR UPDATE ON "Debt" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor', 'categoryId', 'Category');
CREATE TRIGGER debt_installment_workspace_integrity BEFORE INSERT OR UPDATE ON "DebtInstallment" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('debtId', 'Debt', 'personEditorId', 'Editor');
CREATE TRIGGER debt_share_workspace_integrity BEFORE INSERT OR UPDATE ON "DebtInstallmentShare" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('installmentId', 'DebtInstallment', 'personEditorId', 'Editor');
CREATE TRIGGER credit_card_workspace_integrity BEFORE INSERT OR UPDATE ON "CreditCard" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor', 'paymentAccountId', 'FinancialAccount');
CREATE TRIGGER card_purchase_workspace_integrity BEFORE INSERT OR UPDATE ON "CreditCardPurchase" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('cardId', 'CreditCard', 'personEditorId', 'Editor', 'categoryId', 'Category');
CREATE TRIGGER card_installment_workspace_integrity BEFORE INSERT OR UPDATE ON "CreditCardInstallment" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('cardId', 'CreditCard', 'purchaseId', 'CreditCardPurchase', 'invoiceId', 'CreditCardInvoice', 'personEditorId', 'Editor', 'categoryId', 'Category');
CREATE TRIGGER card_share_workspace_integrity BEFORE INSERT OR UPDATE ON "CreditCardInstallmentShare" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('installmentId', 'CreditCardInstallment', 'personEditorId', 'Editor');
CREATE TRIGGER card_invoice_workspace_integrity BEFORE INSERT OR UPDATE ON "CreditCardInvoice" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('cardId', 'CreditCard', 'personEditorId', 'Editor');
CREATE TRIGGER invoice_payment_workspace_integrity BEFORE INSERT OR UPDATE ON "CreditCardInvoicePayment" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('invoiceId', 'CreditCardInvoice', 'accountId', 'FinancialAccount', 'creditCardInstallmentId', 'CreditCardInstallment', 'personEditorId', 'Editor');
CREATE TRIGGER savings_goal_workspace_integrity BEFORE INSERT OR UPDATE ON "SavingsGoal" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor', 'accountId', 'FinancialAccount');
CREATE TRIGGER goal_movement_workspace_integrity BEFORE INSERT OR UPDATE ON "SavingsGoalMovement" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('goalId', 'SavingsGoal', 'personEditorId', 'Editor', 'accountId', 'FinancialAccount');
CREATE TRIGGER investment_workspace_integrity BEFORE INSERT OR UPDATE ON "Investment" FOR EACH ROW EXECUTE FUNCTION enforce_same_workspace_references('personEditorId', 'Editor', 'accountId', 'FinancialAccount');

CREATE TRIGGER transaction_account_owner BEFORE INSERT OR UPDATE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER balance_adjustment_account_owner BEFORE INSERT OR UPDATE ON "BalanceAdjustment" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER transfer_source_account_owner BEFORE INSERT OR UPDATE ON "Transfer" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('sourceAccountId', 'sourcePersonEditorId');
CREATE TRIGGER transfer_destination_account_owner BEFORE INSERT OR UPDATE ON "Transfer" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('destinationAccountId', 'destinationPersonEditorId');
CREATE TRIGGER fixed_expense_account_owner BEFORE INSERT OR UPDATE ON "FixedExpense" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER salary_account_owner BEFORE INSERT OR UPDATE ON "Salary" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER credit_card_account_owner BEFORE INSERT OR UPDATE ON "CreditCard" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('paymentAccountId', 'personEditorId');
CREATE TRIGGER invoice_payment_account_owner BEFORE INSERT OR UPDATE ON "CreditCardInvoicePayment" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER savings_goal_account_owner BEFORE INSERT OR UPDATE ON "SavingsGoal" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER goal_movement_account_owner BEFORE INSERT OR UPDATE ON "SavingsGoalMovement" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER investment_account_owner BEFORE INSERT OR UPDATE ON "Investment" FOR EACH ROW EXECUTE FUNCTION enforce_account_person_ownership('accountId', 'personEditorId');
CREATE TRIGGER investment_account_type BEFORE INSERT OR UPDATE ON "Investment" FOR EACH ROW EXECUTE FUNCTION enforce_investment_account_type();
CREATE TRIGGER goal_movement_identity BEFORE INSERT OR UPDATE ON "SavingsGoalMovement" FOR EACH ROW EXECUTE FUNCTION enforce_goal_movement_identity();
CREATE TRIGGER savings_goal_identity_change BEFORE UPDATE ON "SavingsGoal" FOR EACH ROW EXECUTE FUNCTION protect_financial_source_identity();
CREATE TRIGGER investment_account_type_change BEFORE UPDATE OF "type" ON "FinancialAccount" FOR EACH ROW EXECUTE FUNCTION protect_investment_account_type();

CREATE CONSTRAINT TRIGGER transaction_reserve_integrity AFTER INSERT OR UPDATE OR DELETE ON "Transaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_account_reserve_integrity('accountId');
CREATE CONSTRAINT TRIGGER transfer_reserve_integrity AFTER INSERT OR UPDATE OR DELETE ON "Transfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_account_reserve_integrity('sourceAccountId', 'destinationAccountId');
CREATE CONSTRAINT TRIGGER adjustment_reserve_integrity AFTER INSERT OR UPDATE OR DELETE ON "BalanceAdjustment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_account_reserve_integrity('accountId');
CREATE CONSTRAINT TRIGGER invoice_payment_reserve_integrity AFTER INSERT OR UPDATE OR DELETE ON "CreditCardInvoicePayment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_account_reserve_integrity('accountId');
CREATE CONSTRAINT TRIGGER goal_movement_reserve_integrity AFTER INSERT OR UPDATE OR DELETE ON "SavingsGoalMovement" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_account_reserve_integrity('accountId');
CREATE CONSTRAINT TRIGGER account_reserve_integrity AFTER INSERT OR UPDATE ON "FinancialAccount" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_account_reserve_integrity('id');

ALTER TABLE "FinancialAccount" ADD CONSTRAINT financial_account_version_positive CHECK ("version" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT transaction_amount_positive CHECK ("amount" > 0), ADD CONSTRAINT transaction_version_positive CHECK ("version" > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT transfer_amount_positive CHECK ("amount" > 0), ADD CONSTRAINT transfer_distinct_accounts CHECK ("sourceAccountId" <> "destinationAccountId"), ADD CONSTRAINT transfer_version_positive CHECK ("version" > 0);
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT adjustment_difference_consistent CHECK ("difference" = "targetBalance" - "previousBalance");
ALTER TABLE "FixedExpense" ADD CONSTRAINT fixed_expense_amount_positive CHECK ("amount" > 0), ADD CONSTRAINT fixed_expense_due_day_valid CHECK ("dueDay" BETWEEN 1 AND 31), ADD CONSTRAINT fixed_expense_version_positive CHECK ("version" > 0);
ALTER TABLE "Salary" ADD CONSTRAINT salary_amount_positive CHECK ("amount" > 0), ADD CONSTRAINT salary_payment_day_valid CHECK ("paymentDay" BETWEEN 1 AND 31), ADD CONSTRAINT salary_version_positive CHECK ("version" > 0);
ALTER TABLE "Debt" ADD CONSTRAINT debt_amount_positive CHECK ("totalAmount" > 0), ADD CONSTRAINT debt_installment_count_positive CHECK ("installmentCount" > 0), ADD CONSTRAINT debt_version_positive CHECK ("version" > 0);
ALTER TABLE "DebtInstallment" ADD CONSTRAINT debt_installment_amount_positive CHECK ("amount" > 0), ADD CONSTRAINT debt_installment_number_positive CHECK ("number" > 0);
ALTER TABLE "DebtInstallmentShare" ADD CONSTRAINT debt_share_amount_positive CHECK ("amount" > 0);
ALTER TABLE "CreditCard" ADD CONSTRAINT credit_card_limit_non_negative CHECK ("limit" >= 0), ADD CONSTRAINT credit_card_closing_day_valid CHECK ("closingDay" BETWEEN 1 AND 31), ADD CONSTRAINT credit_card_due_day_valid CHECK ("dueDay" BETWEEN 1 AND 31), ADD CONSTRAINT credit_card_version_positive CHECK ("version" > 0);
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT card_purchase_amount_positive CHECK ("totalAmount" > 0), ADD CONSTRAINT card_purchase_installment_count_positive CHECK ("installmentCount" > 0);
ALTER TABLE "CreditCardInstallment" ADD CONSTRAINT card_installment_amount_positive CHECK ("amount" > 0), ADD CONSTRAINT card_installment_number_positive CHECK ("number" > 0);
ALTER TABLE "CreditCardInstallmentShare" ADD CONSTRAINT card_share_amount_positive CHECK ("amount" > 0);
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT card_invoice_amounts_valid CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");
ALTER TABLE "CreditCardInvoicePayment" ADD CONSTRAINT invoice_payment_amount_positive CHECK ("amount" > 0);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT savings_goal_target_positive CHECK ("targetAmount" > 0);
ALTER TABLE "SavingsGoalMovement" ADD CONSTRAINT goal_movement_amount_positive CHECK ("amount" > 0);
ALTER TABLE "Investment" ADD CONSTRAINT investment_amount_non_negative CHECK ("amount" >= 0);

COMMIT;

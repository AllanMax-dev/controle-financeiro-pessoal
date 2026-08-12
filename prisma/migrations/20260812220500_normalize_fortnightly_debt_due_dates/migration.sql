WITH candidates AS (
  SELECT
    installment.id,
    debt."firstDueDate",
    installment.number,
    date_trunc('month', debt."firstDueDate")::date AS base_month,
    (date_trunc('month', debt."firstDueDate") + interval '14 days')::date AS first_half,
    LEAST(
      (date_trunc('month', debt."firstDueDate") + interval '29 days')::date,
      (date_trunc('month', debt."firstDueDate") + interval '1 month - 1 day')::date
    ) AS second_half
  FROM "DebtInstallment" installment
  INNER JOIN "Debt" debt ON debt.id = installment."debtId"
  WHERE debt.frequency = 'FORTNIGHTLY'
),
slots AS (
  SELECT
    id,
    base_month,
    (
      CASE
        WHEN "firstDueDate" <= first_half THEN 0
        WHEN "firstDueDate" <= second_half THEN 1
        ELSE 2
      END + number - 1
    ) AS slot_index
  FROM candidates
),
normalized AS (
  SELECT
    id,
    CASE
      WHEN slot_index % 2 = 0 THEN
        (base_month + ((slot_index / 2) * interval '1 month') + interval '14 days')::date
      ELSE
        LEAST(
          (base_month + ((slot_index / 2) * interval '1 month') + interval '29 days')::date,
          (date_trunc('month', base_month + ((slot_index / 2) * interval '1 month')) + interval '1 month - 1 day')::date
        )
    END AS due_date
  FROM slots
)
UPDATE "DebtInstallment" installment
SET "dueDate" = normalized.due_date
FROM normalized
WHERE installment.id = normalized.id;

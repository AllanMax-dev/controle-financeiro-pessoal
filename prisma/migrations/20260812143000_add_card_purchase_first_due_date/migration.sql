ALTER TABLE "CreditCardPurchase" ADD COLUMN "firstDueDate" DATE;

UPDATE "CreditCardPurchase" purchase
SET "firstDueDate" = GREATEST(
  purchase."purchaseDate",
  COALESCE(
    (
      SELECT MIN(COALESCE(invoice."dueDate", txn."dueDate", installment."dueMonth"))
      FROM "CreditCardInstallment" installment
      LEFT JOIN "CreditCardInvoice" invoice ON invoice."id" = installment."invoiceId"
      LEFT JOIN "Transaction" txn ON txn."creditCardInstallmentId" = installment."id"
      WHERE installment."purchaseId" = purchase."id"
    ),
    purchase."purchaseDate"
  )
);

ALTER TABLE "CreditCardPurchase" ALTER COLUMN "firstDueDate" SET NOT NULL;
ALTER TABLE "CreditCardPurchase" ADD CONSTRAINT "CreditCardPurchase_firstDueDate_after_purchase" CHECK ("firstDueDate" >= "purchaseDate");

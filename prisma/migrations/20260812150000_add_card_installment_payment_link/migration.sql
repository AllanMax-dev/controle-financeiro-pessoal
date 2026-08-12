ALTER TABLE "CreditCardInvoicePayment" ADD COLUMN "creditCardInstallmentId" UUID;

CREATE UNIQUE INDEX "CreditCardInvoicePayment_creditCardInstallmentId_key" ON "CreditCardInvoicePayment"("creditCardInstallmentId");

CREATE INDEX "CreditCardInvoicePayment_workspaceId_creditCardInstallmentId_idx" ON "CreditCardInvoicePayment"("workspaceId", "creditCardInstallmentId");

ALTER TABLE "CreditCardInvoicePayment" ADD CONSTRAINT "CreditCardInvoicePayment_creditCardInstallmentId_fkey" FOREIGN KEY ("creditCardInstallmentId") REFERENCES "CreditCardInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

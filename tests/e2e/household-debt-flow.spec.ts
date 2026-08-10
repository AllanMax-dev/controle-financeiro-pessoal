import { expect, test } from "@playwright/test";
import { clickNavLink } from "./navigation";

function dateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

test("splits an imported installment debt between two people", async ({ page }, testInfo) => {
  const accessUrl = process.env.E2E_ACCESS_URL;
  const secondEditorName = process.env.E2E_SECOND_EDITOR_NAME;
  test.skip(!accessUrl || !secondEditorName, "Debt flow requires two configured editors.");

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const accountName = `Conta dívida ${suffix}`;
  const categoryName = `Categoria dívida ${suffix}`;
  const debtName = `Bicicleta ${suffix}`;
  const now = new Date();
  const purchaseDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, now.getUTCDate()),
  );

  await page.goto(accessUrl!);
  await expect(page).toHaveURL(/\/painel$/);

  await clickNavLink(page, "Contas");
  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill(accountName);
  await page.getByLabel("Saldo inicial").fill("1.000,00");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await clickNavLink(page, "Categorias");
  await page.getByRole("link", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome da categoria").fill(categoryName);
  await page.getByRole("button", { name: "Criar categoria" }).click();

  await clickNavLink(page, "Dívidas");
  await page.getByRole("link", { name: "Nova dívida" }).click();
  await page.getByLabel("Descrição da compra ou dívida").fill(debtName);
  await page.getByLabel("Valor total").fill("1.500,00");
  await page.getByLabel("Categoria").selectOption({ label: categoryName });
  await page.getByLabel("Nome do cartão").fill("Cartão E2E");
  await page.getByLabel("Data da compra").fill(dateInput(purchaseDate));
  await page.getByLabel("Quantidade de parcelas").fill("10");
  await page.getByRole("checkbox", { name: /Esta dívida já existia/ }).check();
  await expect(page.getByLabel("Parcelas já pagas")).toHaveValue("4");
  await page.getByLabel("Parcelas já pagas").fill("3");
  await page.getByLabel("Conta para o histórico").selectOption({ label: accountName });
  await page.getByLabel("Valor da primeira pessoa").fill("900,00");
  await page.getByRole("combobox", { name: "Segunda pessoa" }).selectOption({ label: secondEditorName! });
  await page.getByLabel("Valor da segunda pessoa").fill("600,00");
  await page.getByRole("button", { name: "Cadastrar dívida" }).click();

  const debtCard = page.locator("article.debt-card").filter({ hasText: debtName });
  await expect(debtCard).toContainText("3/10");
  await expect(debtCard).toContainText("parcelas pagas");
  await expect(debtCard).toContainText(secondEditorName!);
  await expect(debtCard).toContainText(/R\$\s*60,00/);

  await debtCard.locator("summary.debt-compact-summary").click();
  await debtCard.getByText(/Ver parcelas/).click();
  const currentInstallment = debtCard.locator("article").filter({ hasText: "Parcela 4/10" });
  await currentInstallment.getByLabel("Conta do pagamento").selectOption({ label: accountName });
  await currentInstallment.getByRole("button", { name: "Marcar como paga" }).click();
  await expect(currentInstallment).toContainText("Paga");
  await expect(debtCard).toContainText("4/10");
  await expect(debtCard).toContainText(/R\$\s*900,00/);

  await page.goto("/contas");
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(
    /R\$\s*850,00/,
  );

  await page.goto("/painel");
  await expect(page.getByRole("heading", { name: "Dívidas deste mês" })).toBeVisible();
});

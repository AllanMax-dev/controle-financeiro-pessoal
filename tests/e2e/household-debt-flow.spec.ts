import { expect, test } from "@playwright/test";

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

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill(accountName);
  await page.getByLabel("Saldo inicial").fill("1.000,00");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("link", { name: "Categorias", exact: true }).click();
  await page.getByRole("link", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome da categoria").fill(categoryName);
  await page.getByRole("button", { name: "Criar categoria" }).click();

  await page.getByRole("link", { name: "Dívidas", exact: true }).click();
  await page.getByRole("link", { name: "Nova dívida" }).click();
  await page.getByLabel("Descrição da compra ou dívida").fill(debtName);
  await page.getByLabel("Valor total").fill("1.500,00");
  await page.getByLabel("Categoria").selectOption({ label: categoryName });
  await page.getByLabel("Nome do cartão").fill("Cartão E2E");
  await page.getByLabel("Data da compra").fill(dateInput(purchaseDate));
  await page.getByLabel("Quantidade de parcelas").fill("10");
  await page.getByRole("checkbox", { name: /Esta dívida já existia/ }).check();
  await expect(page.getByLabel("Parcelas já pagas")).toHaveValue("4");
  await page.getByLabel("Conta para o histórico").selectOption({ label: accountName });
  await page.getByLabel("Valor da primeira pessoa").fill("900,00");
  await page.getByLabel("Segunda pessoa", { exact: true }).selectOption({ label: secondEditorName! });
  await page.getByLabel("Valor da segunda pessoa").fill("600,00");
  await page.getByRole("button", { name: "Cadastrar dívida" }).click();

  const debtCard = page.locator("article.debt-card").filter({ hasText: debtName });
  await expect(debtCard).toContainText("4 de 10 parcelas pagas");
  await expect(debtCard).toContainText(/R\$\s*900,00/);

  await debtCard.getByText("Ver todas as parcelas").click();
  const fifthInstallment = debtCard.locator("article").filter({ hasText: "Parcela 5/10" });
  await fifthInstallment.getByLabel("Conta do pagamento").selectOption({ label: accountName });
  await fifthInstallment.getByRole("button", { name: "Marcar como paga" }).click();
  await expect(debtCard).toContainText("5 de 10 parcelas pagas");
  await expect(debtCard).toContainText(/R\$\s*750,00/);

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(
    /R\$\s*850,00/,
  );

  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dívidas em aberto" })).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("registers and pays a monthly fixed expense", async ({ page }, testInfo) => {
  const accessUrl = process.env.E2E_ACCESS_URL;
  test.skip(!accessUrl, "E2E_ACCESS_URL is required for the authenticated flow.");

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const accountName = `Conta fixa ${suffix}`;
  const categoryName = `Categoria fixa ${suffix}`;
  const expenseName = `Feira ${suffix}`;

  await page.goto(accessUrl!);
  await expect(page).toHaveURL(/\/painel$/);

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill(accountName);
  await page.getByLabel("Saldo inicial").fill("2.000,00");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("link", { name: "Categorias", exact: true }).click();
  await page.getByRole("link", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome da categoria").fill(categoryName);
  await page.getByRole("button", { name: "Criar categoria" }).click();

  await page.getByRole("link", { name: "Despesas fixas", exact: true }).click();
  await page.getByRole("link", { name: "Nova despesa fixa" }).click();
  await page.getByLabel("Descrição").fill(expenseName);
  await page.getByLabel("Valor mensal previsto").fill("700,00");
  await page.getByLabel("Conta de pagamento").selectOption({ label: accountName });
  await page.getByLabel("Categoria").selectOption({ label: categoryName });
  await page.getByLabel("Dia do vencimento").fill("15");
  await page.getByRole("button", { name: "Cadastrar despesa fixa" }).click();

  const fixedExpenseCard = page.locator("article.fixed-expense-card").filter({ hasText: expenseName });
  await expect(fixedExpenseCard).toContainText(/R\$\s*700,00/);
  await fixedExpenseCard.getByLabel("Valor pago").fill("745,50");
  await fixedExpenseCard.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(fixedExpenseCard).toContainText("Paga");
  await expect(fixedExpenseCard).toContainText(/R\$\s*745,50/);

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(
    /R\$\s*1\.254,50/,
  );

  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await expect(page.getByText("Despesas fixas do mês")).toBeVisible();
  const dashboardPanel = page.locator("article.dashboard-fixed-expense-panel");
  await expect(dashboardPanel.getByRole("heading", { name: "Despesas fixas" })).toBeVisible();
  await expect(dashboardPanel.getByText(expenseName)).toBeVisible();
});

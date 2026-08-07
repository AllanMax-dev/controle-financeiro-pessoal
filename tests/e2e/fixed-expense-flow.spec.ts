import { expect, test } from "@playwright/test";

test("registers and pays a monthly fixed expense", async ({ page }, testInfo) => {
  const accessUrl = process.env.E2E_ACCESS_URL;
  test.skip(!accessUrl, "E2E_ACCESS_URL is required for the authenticated flow.");

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const accountName = `Conta fixa ${suffix}`;
  const categoryName = `Categoria fixa ${suffix}`;
  const expenseName = `Feira ${suffix}`;
  const editedExpenseName = `${expenseName} editada`;
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 7);

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
  await page.getByLabel("Mês inicial").fill(nextMonth);
  await page.getByLabel("Dia do vencimento").fill("15");
  await page.getByRole("button", { name: "Cadastrar despesa fixa" }).click();

  await page.getByLabel("Mês", { exact: true }).fill(nextMonth);
  await page.getByRole("button", { name: "Exibir" }).click();

  const fixedExpenseCard = page.locator("article.fixed-expense-card").filter({ hasText: expenseName });
  await expect(fixedExpenseCard).toContainText(/R\$\s*700,00/);
  await fixedExpenseCard.getByLabel("Valor pago").fill("745,50");
  await fixedExpenseCard.getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(fixedExpenseCard).toContainText("Pago");
  await expect(fixedExpenseCard).toContainText(/R\$\s*745,50/);

  await fixedExpenseCard.getByRole("link", { name: "Editar recorrência" }).click();
  await page.getByLabel("Descrição").fill(editedExpenseName);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByLabel("Mês", { exact: true }).fill(nextMonth);
  await page.getByRole("button", { name: "Exibir" }).click();

  const editedFixedExpenseCard = page
    .locator("article.fixed-expense-card")
    .filter({ hasText: editedExpenseName });
  await expect(editedFixedExpenseCard).toContainText("Pago");
  await editedFixedExpenseCard.getByRole("link", { name: "Editar pagamento" }).click();
  await page.getByLabel("Valor").fill("700,00");
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(
    /R\$\s*1\.300,00/,
  );

  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  const dashboardPanel = page.locator("article.dashboard-fixed-expense-panel");
  await expect(dashboardPanel.getByRole("heading", { name: "Despesas fixas" })).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("registers and receives a fortnightly salary", async ({ page }, testInfo) => {
  const accessUrl = process.env.E2E_ACCESS_URL;
  test.skip(!accessUrl, "E2E_ACCESS_URL is required for the authenticated flow.");

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const accountName = `Conta salário ${suffix}`;
  const categoryName = `Categoria salário ${suffix}`;
  const salaryName = `Salário ${suffix}`;

  await page.goto(accessUrl!);
  await expect(page).toHaveURL(/\/painel$/);

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill(accountName);
  await page.getByLabel("Saldo inicial").fill("0,00");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await page.getByRole("link", { name: "Categorias", exact: true }).click();
  await page.getByRole("link", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome da categoria").fill(categoryName);
  await page.getByLabel("Aplicação").selectOption("INCOME");
  await page.getByRole("button", { name: "Criar categoria" }).click();

  await page.getByRole("link", { name: "Salários", exact: true }).click();
  await page.getByRole("link", { name: "Novo salário" }).click();
  await page.getByLabel("Descrição").fill(salaryName);
  await page.getByLabel("Valor mensal total").fill("3.000,01");
  await page.getByLabel("Conta de recebimento").selectOption({ label: accountName });
  await page.getByLabel("Categoria de receita").selectOption({ label: categoryName });
  await page.getByLabel("Frequência").selectOption("FORTNIGHTLY");
  await page.getByRole("button", { name: "Cadastrar salário" }).click();

  const salaryCard = page.locator("article.fixed-expense-card").filter({ hasText: salaryName });
  await expect(salaryCard).toContainText("1ª quinzena");
  await expect(salaryCard).toContainText("2ª quinzena");
  await expect(salaryCard).toContainText(/R\$\s*1\.500,01/);
  await expect(salaryCard).toContainText(/R\$\s*1\.500,00/);

  const firstInstallment = salaryCard.locator("section.salary-installment").first();
  await firstInstallment.getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(firstInstallment).toContainText("Recebido");

  await page.getByRole("link", { name: "Contas", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(
    /R\$\s*1\.500,01/,
  );

  await page.getByRole("link", { name: "Visão geral", exact: true }).click();
  await expect(page.getByText("Salários do mês")).toBeVisible();
  const salaryPanel = page.locator("article.dashboard-fixed-expense-panel").filter({
    has: page.getByRole("heading", { name: "Salários" }),
  });
  await expect(salaryPanel.getByText(salaryName, { exact: true }).first()).toBeVisible();
});

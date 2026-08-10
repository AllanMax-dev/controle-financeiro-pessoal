import { expect, test } from "@playwright/test";
import { clickNavLink } from "./navigation";

test("registers and receives a fortnightly salary", async ({ page }, testInfo) => {
  const accessUrl = process.env.E2E_ACCESS_URL;
  test.skip(!accessUrl, "E2E_ACCESS_URL is required for the authenticated flow.");

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const accountName = `Conta salário ${suffix}`;
  const categoryName = `Categoria salário ${suffix}`;
  const salaryName = `Salário ${suffix}`;

  await page.goto(accessUrl!);
  await expect(page).toHaveURL(/\/painel$/);

  await clickNavLink(page, "Contas");
  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill(accountName);
  await page.getByLabel("Saldo inicial").fill("0,00");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await clickNavLink(page, "Categorias");
  await page.getByRole("link", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome da categoria").fill(categoryName);
  await page.getByLabel("Aplicação").selectOption("INCOME");
  await page.getByRole("button", { name: "Criar categoria" }).click();

  await clickNavLink(page, "Salários");
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
  await salaryCard.locator("summary").click();

  const firstInstallment = salaryCard.locator("section.salary-installment").first();
  await firstInstallment.getByRole("button", { name: "Registrar recebimento" }).click();
  await expect(firstInstallment).toContainText("Recebido");

  await clickNavLink(page, "Contas");
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(
    /R\$\s*1\.500,01/,
  );

  await clickNavLink(page, "Visão geral");
  const salaryPanel = page.locator("article.dashboard-fixed-expense-panel").filter({
    has: page.getByRole("heading", { name: "Salários" }),
  });
  await expect(salaryPanel.getByText(salaryName, { exact: true }).first()).toBeVisible();
});

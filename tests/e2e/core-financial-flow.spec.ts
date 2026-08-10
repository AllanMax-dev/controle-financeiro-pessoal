import { expect, test } from "@playwright/test";
import { clickNavLink } from "./navigation";

test("creates and updates the core financial records", async ({ page }, testInfo) => {
  const accessUrl = process.env.E2E_ACCESS_URL;
  test.skip(!accessUrl, "E2E_ACCESS_URL is required for the authenticated flow.");

  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const accountName = `Conta ${suffix}`;
  const destinationAccountName = `Destino ${suffix}`;
  const categoryName = `Categoria ${suffix}`;
  const transactionName = `Despesa ${suffix}`;
  const transferName = `Transferência ${suffix}`;

  await page.goto(accessUrl!);
  await expect(page).toHaveURL(/\/painel$/);

  await clickNavLink(page, "Contas");
  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill(accountName);
  await page.getByLabel("Saldo inicial").fill("1.000,00");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText(accountName)).toBeVisible();

  await clickNavLink(page, "Categorias");
  await page.getByRole("link", { name: "Nova categoria" }).click();
  await page.getByLabel("Nome da categoria").fill(categoryName);
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(page.getByText(categoryName)).toBeVisible();

  await clickNavLink(page, "Lançamentos");
  await page.getByRole("link", { name: "Novo lançamento" }).click();
  await page.getByLabel("Descrição").fill(transactionName);
  await page.getByLabel("Valor").fill("123,45");
  await page.getByLabel("Conta").selectOption({ label: accountName });
  await page.getByLabel("Categoria").selectOption({ label: categoryName });
  await page.getByLabel("Status").selectOption("SETTLED");
  await page.getByRole("button", { name: "Criar lançamento" }).click();
  await expect(page.getByText(transactionName)).toBeVisible();

  const transactionRow = page.locator("article").filter({ hasText: transactionName });
  await transactionRow.getByRole("link", { name: "Editar" }).click();
  await page.getByLabel("Valor").fill("100,00");
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await clickNavLink(page, "Contas");
  const accountRow = page.locator("article").filter({ hasText: accountName });
  await expect(accountRow).toContainText(/R\$\s*900,00/);

  await clickNavLink(page, "Lançamentos");
  const updatedTransactionRow = page.locator("article").filter({ hasText: transactionName });
  page.once("dialog", (dialog) => dialog.accept());
  await updatedTransactionRow.getByRole("button", { name: "Cancelar" }).click();
  await expect(updatedTransactionRow).toContainText("Cancelado");

  await clickNavLink(page, "Contas");
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(/R\$\s*1\.000,00/);

  await page.getByRole("link", { name: "Nova conta" }).click();
  await page.getByLabel("Nome da conta").fill(destinationAccountName);
  await page.getByLabel("Saldo inicial").fill("0,00");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await clickNavLink(page, "Transferências");
  await page.getByRole("link", { name: "Nova transferência" }).click();
  await page.getByLabel("Descrição").fill(transferName);
  await page.getByLabel("Valor").fill("250,00");
  await page.getByLabel("Conta de origem").selectOption({ label: accountName });
  await page.getByLabel("Conta de destino").selectOption({ label: destinationAccountName });
  await page.getByLabel("Status").selectOption("SETTLED");
  await page.getByRole("button", { name: "Criar transferência" }).click();
  await expect(page.getByText(transferName)).toBeVisible();

  await clickNavLink(page, "Contas");
  await expect(page.locator("article").filter({ hasText: accountName })).toContainText(/R\$\s*750,00/);
  await expect(page.locator("article").filter({ hasText: destinationAccountName })).toContainText(
    /R\$\s*250,00/,
  );

  await clickNavLink(page, "Planejamento");
  const budgetCard = page.locator("article.planning-budget-card").filter({ hasText: categoryName });
  await budgetCard.getByText("Definir limite", { exact: true }).click();
  const budgetInput = page.getByLabel(`Orçamento de ${categoryName}`);
  const budgetForm = page.locator("form").filter({ has: budgetInput });
  await budgetInput.fill("500,00");
  await budgetForm.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Orçamento salvo.")).toBeVisible();

  await clickNavLink(page, "Relatórios");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^relatorio-\d{4}-\d{2}\.csv$/);
});

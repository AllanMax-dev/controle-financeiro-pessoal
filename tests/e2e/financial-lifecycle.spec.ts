import { expect, test, type Locator, type Page } from "@playwright/test";

import { createAccessLink } from "../../src/modules/access/application/create-access-link";
import { clickNavLink } from "./navigation";

const month = "2026-08";

function formWithButton(page: Page, name: string) {
  return page.getByRole("button", { exact: true, name }).last().locator("xpath=ancestor::form[1]");
}

async function submit(form: Locator, buttonName: string) {
  await form.getByRole("button", { exact: true, name: buttonName }).click();
  await form.page().waitForLoadState("networkidle");
}

async function ensureDetailsOpen(details: Locator) {
  await details.waitFor({ state: "attached" });
  const summary = details.locator("summary").first();
  await summary.waitFor({ state: "visible" });
  if (await details.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await summary.click();
  }
  await summary.click();
  await expect.poll(() => details.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(true);
}

async function openCreateForm(page: Page, buttonName: string) {
  const details = page.locator("#finance-create");
  const form = formWithButton(page, buttonName);

  await expect(async () => {
    await ensureDetailsOpen(details);
    await expect(form).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  return form;
}

async function openDetails(page: Page, text: string) {
  const details = page.locator("details").filter({ has: page.getByText(text, { exact: true }) }).first();
  await ensureDetailsOpen(details);
  return details;
}

test("completes the real financial lifecycle through Next.js and PostgreSQL", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "The full mutation flow runs once; responsive coverage remains in the visual suite.");

  const suffix = `${Date.now()}`;
  const allanAccount = `Conta Allan E2E ${suffix}`;
  const mayaraAccount = `Conta Mayara E2E ${suffix}`;
  const salaryName = `Salário E2E ${suffix}`;
  const fixedName = `Aluguel E2E ${suffix}`;
  const debtName = `Mesa E2E ${suffix}`;
  const cardName = `Cartão E2E ${suffix}`;
  const purchaseName = `Compra E2E ${suffix}`;
  const goalName = `Reserva E2E ${suffix}`;
  const access = await createAccessLink("Allan");

  await page.goto(new URL(access.accessUrl).pathname);
  await expect(page).toHaveURL(/\/painel/);
  await page.goto(`/painel?month=${month}`);

  await clickNavLink(page, "Bancos");
  let form = await openCreateForm(page, "Criar conta");
  await form.locator('[name="personEditorId"]').selectOption({ label: "Allan" });
  await form.locator('[name="name"]').fill(allanAccount);
  await form.locator('[name="initialBalance"]').fill("0,00");
  await submit(form, "Criar conta");

  form = await openCreateForm(page, "Criar conta");
  await form.locator('[name="personEditorId"]').selectOption({ label: "Mayara" });
  await form.locator('[name="name"]').fill(mayaraAccount);
  await form.locator('[name="initialBalance"]').fill("0,00");
  await submit(form, "Criar conta");
  await expect(page.getByText(allanAccount, { exact: true })).toBeVisible();
  await expect(page.getByText(mayaraAccount, { exact: true })).toBeVisible();

  await clickNavLink(page, "Recebimentos");
  await page.getByText("Gerenciar salarios recorrentes", { exact: true }).click();
  form = formWithButton(page, "Cadastrar salário");
  await form.locator('[name="personEditorId"]').selectOption({ label: "Allan" });
  await form.locator('[name="description"]').fill(salaryName);
  await form.locator('[name="amount"]').fill("4000,00");
  await form.locator('[name="startMonth"]').fill(month);
  await form.locator('[name="paymentDay"]').fill("15");
  await form.locator('[name="frequency"]').selectOption("MONTHLY");
  await form.locator('[name="accountId"]').selectOption({ label: `Allan · ${allanAccount}` });
  await submit(form, "Cadastrar salário");
  await submit(page.getByText(salaryName, { exact: true }).first().locator("xpath=ancestor::li[1]").locator("form"), "Confirmar");

  await clickNavLink(page, "Dívidas");
  await openDetails(page, "Novo gasto fixo");
  form = formWithButton(page, "Criar gasto fixo");
  await form.locator('[name="personEditorId"]').selectOption({ label: "Allan" });
  await form.locator('[name="description"]').fill(fixedName);
  await form.locator('[name="amount"]').fill("1000,00");
  await form.locator('[name="startMonth"]').fill(month);
  await form.locator('[name="dueDay"]').fill("10");
  await form.locator('[name="accountId"]').selectOption({ label: `Allan · ${allanAccount}` });
  await submit(form, "Criar gasto fixo");
  let item = page.getByText(fixedName, { exact: true }).first().locator("xpath=ancestor::details[1]");
  await ensureDetailsOpen(item);
  await item.locator("details.inline-payment-details > summary").filter({ hasText: "Pagar" }).click();
  form = item.getByRole("button", { exact: true, name: "Pagar" }).locator("xpath=ancestor::form[1]");
  await form.locator('[name="accountId"]').selectOption({ label: `Allan · ${allanAccount}` });
  await submit(form, "Pagar");

  form = await openCreateForm(page, "Criar dívida");
  await form.locator('[name="personEditorId"]').selectOption({ label: "Allan" });
  await form.locator('[name="description"]').fill(debtName);
  await form.locator('[name="totalAmount"]').fill("300,00");
  await form.locator('[name="startDate"]').fill("2026-08-01");
  await form.locator('[name="firstDueDate"]').fill("2026-08-20");
  await form.locator('[name="installmentCount"]').fill("2");
  await submit(form, "Criar dívida");
  item = page.getByText(debtName, { exact: true }).first().locator("xpath=ancestor::details[1]");
  await ensureDetailsOpen(item);
  await item.getByText("Pagar", { exact: true }).first().click();
  form = item.getByRole("button", { exact: true, name: "Pagar parcela" }).first().locator("xpath=ancestor::form[1]");
  await form.locator('[name="accountId"]').selectOption({ label: `Allan · ${allanAccount}` });
  await submit(form, "Pagar parcela");

  await openDetails(page, "Novo cartão");
  form = formWithButton(page, "Criar cartão");
  await form.locator('[name="personEditorId"]').selectOption({ label: "Allan" });
  await form.locator('[name="name"]').fill(cardName);
  await form.locator('[name="limit"]').fill("1000,00");
  await form.locator('[name="closingDay"]').fill("5");
  await form.locator('[name="dueDay"]').fill("10");
  await form.locator('[name="paymentAccountId"]').selectOption({ label: `Allan · ${allanAccount}` });
  await submit(form, "Criar cartão");
  await expect(page.getByText(cardName, { exact: true }).first()).toBeVisible();
  await page.goto(`/dividas?month=${month}`);
  await openDetails(page, "Nova compra no cartão");
  form = formWithButton(page, "Registrar compra");
  await form.locator('[name="cardId"]').selectOption({ label: `Allan · ${cardName}` });
  await form.locator('[name="responsibilityTarget"]').selectOption({ label: "Allan" });
  await form.locator('[name="description"]').fill(purchaseName);
  await form.locator('[name="totalAmount"]').fill("100,00");
  await form.locator('[name="installmentCount"]').fill("1");
  await form.locator('[name="purchaseDate"]').fill("2026-08-01");
  await submit(form, "Registrar compra");
  item = page.getByText(purchaseName, { exact: true }).first().locator("xpath=ancestor::details[1]");
  await ensureDetailsOpen(item);
  await item.getByText("Adiantar", { exact: true }).click();
  form = item.getByRole("button", { exact: true, name: "Adiantar parcela" }).locator("xpath=ancestor::form[1]");
  await form.locator('[name="accountId"]').selectOption({ label: `Allan · ${allanAccount}` });
  await submit(form, "Adiantar parcela");

  await clickNavLink(page, "Cofrinhos");
  form = await openCreateForm(page, "Criar cofrinho");
  await form.locator('[name="personEditorId"]').selectOption({ label: "Allan" });
  await form.locator('[name="name"]').fill(goalName);
  await form.locator('[name="targetAmount"]').fill("500,00");
  await submit(form, "Criar cofrinho");
  await expect(page.getByText(goalName, { exact: true }).first()).toBeVisible();
  await page.goto(`/cofrinhos?month=${month}`);
  form = formWithButton(page, "Salvar movimento");
  await form.locator('[name="goalId"]').selectOption({ label: `Allan · ${goalName}` });
  await form.locator('[name="type"]').selectOption("DEPOSIT");
  await form.locator('[name="amount"]').fill("50,00");
  await form.locator('[name="movementDate"]').fill("2026-08-18");
  await submit(form, "Salvar movimento");

  await clickNavLink(page, "Transferências");
  form = await openCreateForm(page, "Transferir");
  await form.locator('[name="sourceAccountId"]').selectOption({ label: `Allan · ${allanAccount}` });
  await form.locator('[name="destinationAccountId"]').selectOption({ label: `Mayara · ${mayaraAccount}` });
  await form.locator('[name="amount"]').fill("200,00");
  await form.locator('[name="transferDate"]').fill("2026-08-18");
  await submit(form, "Transferir");

  await clickNavLink(page, "Dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator('.snapshot-card').filter({ hasText: "Casal" })).toContainText("Saldo ao fim do período");

  await page.goto(`/transferencias?month=${month}`);
  item = page.getByText(`${allanAccount} → ${mayaraAccount}`, { exact: true }).locator("xpath=ancestor::li[1]");
  await item.getByText("Excluir", { exact: true }).click();
  await item.getByRole("button", { exact: true, name: "Excluir de vez" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(`${allanAccount} → ${mayaraAccount}`, { exact: true })).toHaveCount(0);

  await page.goto(`/recebimentos?month=${month}`);
  const salarySection = page.getByRole("heading", { name: "Salarios do mes" }).locator("xpath=ancestor::section[1]");
  item = salarySection.getByText(salaryName, { exact: true }).locator("xpath=ancestor::li[1]");
  await item.getByText("Excluir", { exact: true }).click();
  await item.getByRole("button", { exact: true, name: "Excluir de vez" }).click();
  await page.waitForLoadState("networkidle");

  await page.goto(`/dividas?month=${month}`);
  item = page.getByText(fixedName, { exact: true }).first().locator("xpath=ancestor::details[1]");
  await ensureDetailsOpen(item);
  await item.locator("summary").filter({ hasText: "Desfazer pagamento" }).click();
  await item.getByRole("button", { exact: true, name: "Desfazer pagamento" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(fixedName, { exact: true }).first().locator("xpath=ancestor::details[1]")).toContainText("Pendente");

  item = page.getByText(debtName, { exact: true }).first().locator("xpath=ancestor::details[1]");
  await ensureDetailsOpen(item);
  let installment = item.locator(".installment-list > li").filter({ hasText: "Parcela 1" }).first();
  await installment.getByText("Excluir", { exact: true }).click();
  await installment.getByRole("button", { exact: true, name: "Excluir de vez" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(debtName, { exact: true }).first().locator("xpath=ancestor::details[1]")).toContainText("Pendente");

  item = page.getByText(purchaseName, { exact: true }).first().locator("xpath=ancestor::details[1]");
  await ensureDetailsOpen(item);
  installment = item.locator(".installment-list > li").filter({ hasText: "Parcela 1" }).first();
  await installment.getByText("Excluir", { exact: true }).click();
  await installment.getByRole("button", { exact: true, name: "Excluir de vez" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(purchaseName, { exact: true }).first().locator("xpath=ancestor::details[1]")).toContainText("Vencida");

  await page.goto(`/cofrinhos?month=${month}`);
  item = page.getByText(goalName, { exact: true }).last().locator("xpath=ancestor::li[1]");
  await item.getByText("Excluir", { exact: true }).click();
  await item.getByRole("button", { exact: true, name: "Excluir de vez" }).click();
  await page.waitForLoadState("networkidle");

  await page.goto(`/dividas?month=${month}`);
  item = page.getByText(cardName, { exact: true }).first().locator("xpath=ancestor::details[1]");
  await ensureDetailsOpen(item);
  await item.getByText("Arquivar", { exact: true }).click();
  await item.getByRole("button", { exact: true, name: "Confirmar" }).click();
  await page.waitForLoadState("networkidle");

  await page.goto(`/bancos?month=${month}`);
  item = page.getByText(allanAccount, { exact: true }).first().locator("xpath=ancestor::li[1]");
  await item.getByText("Arquivar", { exact: true }).click();
  await item.getByRole("button", { exact: true, name: "Confirmar" }).click();
  await page.waitForLoadState("networkidle");

  await page.goto(`/painel?month=2026-08`);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Saldo ao fim do período").first()).toBeVisible();
});

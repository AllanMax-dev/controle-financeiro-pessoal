import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const appCss = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

test.use({ viewport: { height: 850, width: 390 } });

test("keeps closed mobile finance rows compact", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>${appCss}</style>
      </head>
      <body>
        <main class="workspace-main">
          <ul class="finance-list fixed-expense-list">
            <li data-compact-row>
              <div class="finance-item-main">
                <span>
                  <strong>Seguro da Moto</strong>
                  <small>Allan - vence 05/08/2026</small>
                </span>
                <b>R$ 145,00</b>
              </div>
              <span class="finance-list-actions">
                <span class="finance-status" data-status="SETTLED">Pago</span>
                <details class="finance-edit-details"><summary>Editar</summary></details>
              </span>
            </li>
            <li data-compact-row>
              <div class="finance-item-main">
                <span>
                  <strong>Internet Celular</strong>
                  <small>Allan - vence 17/08/2026</small>
                </span>
                <b>R$ 45,00</b>
              </div>
              <span class="finance-list-actions">
                <span class="finance-status" data-status="PENDING">Pendente</span>
                <details class="inline-payment-details"><summary>Pagar</summary></details>
              </span>
            </li>
          </ul>
        </main>
      </body>
    </html>
  `);

  const metrics = await page.locator("[data-compact-row]").evaluateAll((items) =>
    items.map((item) => {
      const row = item.getBoundingClientRect();
      const main = item.querySelector(".finance-item-main")?.getBoundingClientRect();
      const actions = item.querySelector(".finance-list-actions")?.getBoundingClientRect();

      return {
        contentHeight: Math.max(main?.height ?? 0, actions?.height ?? 0),
        height: row.height,
      };
    }),
  );

  for (const metric of metrics) {
    expect(metric.height).toBeLessThan(Math.max(150, metric.contentHeight + 80));
  }

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

  expect(hasHorizontalOverflow).toBe(false);
});

test("reveals debt actions only after opening the item", async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>${appCss}</style>
      </head>
      <body>
        <main class="workspace-main">
          <ul class="finance-list debt-list">
            <li>
              <details class="debt-details" data-debt-kind="fixed">
                <summary><div class="finance-item-main"><strong>Aluguel</strong><b>R$ 1.000,00</b></div></summary>
                <div class="debt-detail-body"><div class="finance-list-actions"><button>Editar</button><button>Excluir</button></div></div>
              </details>
            </li>
            <li>
              <details class="debt-details" data-debt-kind="card">
                <summary><div class="finance-item-main"><strong>Cartão principal</strong><b>R$ 350,00</b></div></summary>
                <div class="debt-detail-body"><div class="finance-list-actions"><button>Editar</button><button>Excluir</button></div></div>
              </details>
            </li>
          </ul>
        </main>
      </body>
    </html>
  `);

  for (const kind of ["fixed", "card"]) {
    const item = page.locator(`[data-debt-kind="${kind}"]`);
    const body = item.locator(".debt-detail-body");

    await expect(body).toBeHidden();
    await item.locator("summary").click();
    await expect(body).toBeVisible();
    await expect(item.getByRole("button", { name: "Editar" })).toBeVisible();
    await expect(item.getByRole("button", { name: "Excluir" })).toBeVisible();
  }
});

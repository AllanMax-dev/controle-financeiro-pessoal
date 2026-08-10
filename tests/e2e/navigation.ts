import type { Page } from "@playwright/test";

export async function clickNavLink(page: Page, name: string) {
  const link = page.getByRole("link", { name, exact: true });
  const firstLink = link.first();

  if (!(await firstLink.isVisible().catch(() => false))) {
    const menuButton = page.getByRole("button", { name: "Abrir menu de navegação" });
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click();
    }
  }

  await page.getByRole("link", { name, exact: true }).click();
}
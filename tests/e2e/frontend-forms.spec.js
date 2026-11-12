import { expect, test } from "@playwright/test";

test("failed staff login keeps the email available for correction", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("audit-login@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Test-only incorrect password!");
  await page.getByRole("main").getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Email or password is incorrect.");
  await expect(page.getByLabel("Email address")).toHaveValue("audit-login@example.test");
});

test("invalid wallet details return focus and clear the error when corrected", async ({ page }) => {
  await page.goto("/book/rim-and-rally?date=2030-01-01");
  await page.getByTestId("slot-2030-01-01_pickleball-1_8").filter({ visible: true }).click();
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await page.getByLabel("Full name").fill("Audit Player");
  await page.getByLabel("Email address").fill("audit@example.test");
  await page.getByLabel("Philippine mobile number").fill("09171234567");
  await page.getByRole("button", { name: "Review reservation", exact: true }).click();
  await page.getByRole("radio", { name: /GCash/ }).check();
  await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  const wallet = page.getByLabel("Wallet mobile number");
  await wallet.fill("123");
  await page.getByRole("button", { name: "Start simulated payment", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("09171234567");
  await expect(wallet).toBeFocused();
  await wallet.fill("09171234567");
  await expect(wallet).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
});

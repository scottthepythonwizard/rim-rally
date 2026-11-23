import { expect, test } from "@playwright/test";

test("staff can create a sample walk-in from Bookings", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("integration-admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Integration-test-only!9331");
  await page.getByRole("main").getByRole("button", { name: "Log in", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Staff dashboard" });
  await nav.getByRole("link", { name: "Bookings", exact: true }).click();
  await expect(nav.getByRole("link", { name: "Add walk-in" })).toHaveCount(0);
  await expect(page.getByText(/Demo mode · Sample records/)).toHaveCount(0);
  await page.getByRole("link", { name: "Add walk-in booking" }).click();
  await expect(page).toHaveURL(/\/dashboard\/walk-in$/);

  const guest = `Demo Walk-in ${Date.now()}`;
  await page.getByLabel("Customer name").fill(guest);
  await page.getByLabel("Email address").fill("demo-walk-in@example.test");
  await page.getByLabel("Mobile number").fill("09171234567");
  await page.getByLabel("Date", { exact: true }).fill(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Date.now() + 3 * 86400000)));
  await page.getByLabel("Payment method").selectOption("cash");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Create walk-in booking" }).click();
  await page.getByRole("link", { name: "Open booking details" }).click();
  await expect(page.getByText(guest, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Confirmed", { exact: true }).first()).toBeVisible();
});

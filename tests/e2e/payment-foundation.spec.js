import { expect, test } from "@playwright/test";

test("review offers all payment methods before submission", async ({ page }) => {
  await page.goto("/book/rim-and-rally?date=2030-01-01");
  await page.getByTestId("slot-2030-01-01_pickleball-1_8").filter({ visible: true }).click();
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await page.getByLabel("Full name", { exact: false }).fill("Demo Player");
  await page.getByLabel("Email address", { exact: false }).fill("player@example.test");
  await page.getByLabel("Philippine mobile number", { exact: false }).fill("09171234567");
  await page.getByRole("button", { name: "Review reservation", exact: true }).click();
  for (const method of ["GCash", "Maya", "QRPh"]) {
    const radio = page.getByRole("radio", { name: new RegExp(method) });
    await radio.check(); await expect(radio).toBeChecked();
    await expect(page.getByRole("button", { name: "Continue to payment", exact: true })).toBeEnabled();
  }
  await expect(page.getByText("No money will be collected", { exact: false })).toBeVisible();
});

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function accessible(page) {
  await page.evaluate(() => document.fonts.ready);
  const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) }))).toEqual([]);
}
async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [360, 390, 768, 1024, 1440]) test(`Phase 5: landing, facility, schedule accessibility and layout at ${width}px`, async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width, height: 1000 });
  for (const url of ["/", "/facilities/rim-and-rally", "/book/rim-and-rally?date=2030-01-01"]) {
    await page.goto(url);
    await expect(page.locator("main h1")).toBeVisible();
    if (url.includes("/book/")) await expect(page.getByTestId("slot-2030-01-01_pickleball-1_8").filter({ visible: true })).toBeVisible();
    await fits(page); await accessible(page);
  }
});

test("Phase 5: calendar, guest form, payment dialog and pass accessibility", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/book/rim-and-rally?date=2030-01-01");
  await page.getByRole("button", { name: "Choose date", exact: true }).click(); await accessible(page);
  await page.keyboard.press("Escape");
  await page.getByTestId("slot-2030-01-01_pickleball-1_8").filter({ visible: true }).click();
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click(); await accessible(page);
  await page.getByLabel("Full name", { exact: false }).fill("QA Demo Player");
  await page.getByLabel("Email address", { exact: false }).fill("qa@example.test");
  await page.getByLabel("Philippine mobile number", { exact: false }).fill("09171234567");
  await page.getByRole("button", { name: "Review reservation", exact: true }).click(); await accessible(page);
  await page.getByRole("radio", { name: /QRPh/ }).check(); await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  await expect(page.getByRole("img", { name: "Simulated payment QR, not payable" })).toBeVisible(); await accessible(page);
  await page.getByLabel("Reference code").fill("QADEMO123"); await page.getByRole("button", { name: "Start simulated payment", exact: true }).click();
  await expect(page).toHaveURL(/confirmation/); await expect(page.getByRole("img", { name: "Digital ticket QR" })).toBeVisible(); await accessible(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ media: "print" });
  await expect(page.locator("header")).toBeHidden(); await expect(page.locator("footer")).toBeHidden();
  expect(await page.getByLabel("Digital booking pass").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(1016);
  await page.screenshot({ path: "docs/screenshots/phase-5-print-layout.jpg", fullPage: true });
});

test("Phase 5: missing resources and unauthorised pass never expose a ticket", async ({ page }) => {
  await page.goto("/facilities/not-a-facility"); await expect(page.getByRole("heading", { name: /This court isn’t here\./ })).toBeVisible();
  await page.goto("/booking/not-a-booking/confirmation"); await expect(page.getByRole("heading", { name: "Pass unavailable" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Digital ticket QR" })).toHaveCount(0);
  await accessible(page);
});

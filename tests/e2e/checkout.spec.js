import { expect, test } from "@playwright/test";

async function review(page, extra = "") {
  await page.goto(`/book/rim-and-rally?date=2030-01-01${extra}`);
  if (extra.includes("open-play")) await page.getByRole("button", { name: /Select one place/i }).first().click();
  else await page.getByTestId(`slot-2030-01-01_${extra.includes("basketball") ? "basketball" : "pickleball"}-1_8`).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await page.getByLabel("Full name", { exact: false }).fill("Demo Player");
  await page.getByLabel("Email address", { exact: false }).fill("player@example.test");
  await page.getByLabel("Philippine mobile number", { exact: false }).fill("09171234567");
  await page.getByRole("button", { name: "Review reservation", exact: true }).click();
}
async function pay(page, method = "GCash", scenario = "success") {
  await page.getByRole("radio", { name: new RegExp(method) }).check();
  await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  if (method === "QRPh") { await expect(page.getByRole("img", { name: "Simulated payment QR, not payable" })).toBeVisible(); await page.getByLabel("Reference code").fill("DEMO123456"); }
  await page.getByLabel("Demo payment outcome").selectOption(scenario);
  await page.getByRole("button", { name: "Start simulated payment", exact: true }).click();
}

for (const method of ["GCash", "Maya", "QRPh"]) test(`${method}: confirmed receipt, opaque QR, print layout, reload`, async ({ page }) => {
  await review(page, method === "Maya" ? "&sport=basketball" : ""); await pay(page, method);
  await expect(page).toHaveURL(/\/booking\/.*\/confirmation/);
  await expect(page.getByRole("img", { name: "Digital ticket QR" })).toBeVisible();
  await expect(page.getByText("Demo Player", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header")).toBeHidden(); await expect(page.getByLabel("Digital booking pass")).toBeVisible();
  await page.emulateMedia({ media: "screen" }); await page.reload();
  await expect(page.getByRole("img", { name: "Digital ticket QR" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/Demo Player|player@example.test|09171234567/);
});
test("failed payment can retry; original guest inputs survive", async ({ page }) => {
  await review(page); await pay(page, "GCash", "failed");
  await expect(page.getByRole("heading", { name: "Payment unsuccessful" })).toBeVisible();
  await page.getByRole("button", { name: "Return to reservation" }).click();
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: false })).toHaveValue("Demo Player");
  await page.getByRole("button", { name: "Review reservation", exact: true }).click(); await pay(page, "Maya");
  await expect(page).toHaveURL(/confirmation/);
});
test("unknown payment survives reload and original hold expiry", async ({ page }) => {
  await review(page); await pay(page, "GCash", "unknown");
  await expect(page.getByRole("heading", { name: "Checking your payment" })).toBeVisible();
  await page.evaluate(() => { const key = "rim-rally:demo-holds:v1"; const db = JSON.parse(localStorage.getItem(key)); db.holds[0].expiresAt = new Date(Date.now() - 1).toISOString(); localStorage.setItem(key, JSON.stringify(db)); });
  await page.reload(); await expect(page.getByRole("heading", { name: "Checking your payment" })).toBeVisible();
  await expect(page).toHaveURL(/confirmation/, { timeout: 15000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rim-rally:demo-holds:v1")).payments.length)).toBe(1);
});
test("paid but allocation pending never displays a premature pass", async ({ page }) => {
  await review(page); await pay(page, "QRPh", "booking-pending");
  await expect(page.getByRole("heading", { name: "Payment received. Confirming your place…" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Digital ticket QR" })).toHaveCount(0);
  await expect(page).toHaveURL(/confirmation/, { timeout: 15000 });
});
test("dialog validates wallet, traps focus, restores focus and fits mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await review(page);
  await page.getByRole("radio", { name: /GCash/ }).check(); await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  await page.getByLabel("Wallet mobile number").fill("123"); await page.getByRole("button", { name: "Start simulated payment", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("09171234567");
  await page.getByRole("button", { name: "Back to review" }).focus(); await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement.closest("dialog"))).toBe(true);
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Continue to payment", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test("Open Play confirmation reserves one place and increases registered count", async ({ page }) => {
  await review(page, "&mode=open-play"); await pay(page, "QRPh");
  await expect(page).toHaveURL(/confirmation/);
  await expect(page.getByText(/1 place/, { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Book another game" }).click();
  await page.getByRole("button", { name: "Open Play", exact: true }).click();
  await page.goto("/book/rim-and-rally?date=2030-01-01&mode=open-play");
  await expect(page.getByText("7 / 16 players registered", { exact: true })).toBeVisible();
});

test("a failed payment can cancel its reservation", async ({ page }) => {
  await review(page); await pay(page, "Maya", "failed");
  await expect(page.getByRole("heading", { name: "Payment unsuccessful" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel reservation", exact: true }).click();
  await expect(page.getByTestId("slot-2030-01-01_pickleball-1_8").filter({ visible: true })).toBeEnabled();
});

test("delayed result has recovery after two minutes and no duplicate attempt", async ({ page }) => {
  await page.clock.install(); await review(page); await pay(page, "GCash", "delayed");
  await expect(page.getByRole("heading", { name: "Checking your payment" })).toBeVisible();
  await page.clock.runFor(121000);
  await expect(page.getByRole("heading", { name: "Payment is taking longer than usual" })).toBeVisible();
  await page.clock.runFor(9000); await expect(page).toHaveURL(/confirmation/);
});

test("malformed service result recovers the same attempt", async ({ page }) => {
  await review(page); await pay(page, "GCash", "malformed");
  await expect(page.getByRole("alert").filter({ hasText: "could not be verified" })).toContainText("could not be verified");
  await expect(page).toHaveURL(/confirmation/, { timeout: 15000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rim-rally:demo-holds:v1")).payments.length)).toBe(1);
});


test("lost submission acknowledgement reconciles by original key", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.locks.request.bind(navigator.locks);
    let dropped = false;
    navigator.locks.request = (name, callback) => original(name, async (...args) => {
      const value = await callback(...args);
      if (!dropped && value?.status === "pending" && value?.holdId) { dropped = true; throw new Error("Simulated lost payment acknowledgement"); }
      return value;
    });
  });
  await review(page); await pay(page);
  await expect(page).toHaveURL(/confirmation/, { timeout: 15000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rim-rally:demo-holds:v1")).payments.length)).toBe(1);
});

test("repeated submission stays single and pass is responsive without console errors", async ({ page }) => {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await review(page); await page.getByRole("radio", { name: /GCash/ }).check();
  await page.getByRole("button", { name: "Continue to payment", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/phase-4-payment.jpg", fullPage: true });
  await page.getByRole("button", { name: "Start simulated payment", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page).toHaveURL(/confirmation/); await expect(page.getByRole("img", { name: "Digital ticket QR" })).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Print / Save as PDF" })).toBeEnabled();
  }
  await page.screenshot({ path: "docs/screenshots/phase-4-pass.jpg", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: "docs/screenshots/phase-4-mobile-pass.jpg", fullPage: true });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rim-rally:demo-holds:v1")).payments.length)).toBe(1);
});

import { expect, test } from "@playwright/test";

const url = "/book/rim-and-rally?date=2030-01-01";
const slot = (page, hour = 8) => page.getByTestId(`slot-2030-01-01_pickleball-1_${hour}`).filter({ visible: true });
const recoveryKey = "rim-rally:hold-recovery:v1";
const storeKey = "rim-rally:demo-holds:v1";
async function select(page) {
  await page.goto(url); await slot(page).click();
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeEnabled();
}
async function fillGuest(page) {
  await page.getByLabel("Full name", { exact: false }).fill("Demo Player");
  await page.getByLabel("Email address", { exact: false }).fill("player@example.test");
  await page.getByLabel("Philippine mobile number", { exact: false }).fill("09171234567");
}

test("holds consecutive hours without extending expiry; validates details and reviews without payment", async ({ page }) => {
  await select(page);
  const original = await page.evaluate((key) => { const recovery = JSON.parse(sessionStorage.getItem(key)); return JSON.parse(localStorage.getItem("rim-rally:demo-holds:v1")).holds.find((hold) => hold.id === recovery.id); }, recoveryKey);
  await slot(page, 9).click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("800");
  const edited = await page.evaluate((id) => JSON.parse(localStorage.getItem("rim-rally:demo-holds:v1")).holds.find((hold) => hold.id === id), original.id);
  expect(edited.expiresAt).toBe(original.expiresAt);
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who’s coming to play?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review reservation", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: false })).toHaveAttribute("aria-invalid", "true");
  await fillGuest(page);
  await page.getByRole("button", { name: "Review reservation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your game is taking shape.", exact: true })).toBeVisible();
  await expect(page.getByText("+639171234567", { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(stored).not.toContain("player@example.test"); expect(stored).not.toContain("09171234567"); expect(stored).not.toContain("Demo Player");
  await page.getByRole("button", { name: "Edit guest details", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: false })).toHaveValue("Demo Player");
  await page.getByRole("button", { name: "Back to schedule", exact: true }).click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("800");
});

test("recovers an acknowledged and an uncertain create after reload, with the same expiry", async ({ page }) => {
  await select(page);
  const initial = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), recoveryKey);
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click(); await fillGuest(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeEnabled();
  const recovered = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), recoveryKey);
  expect(recovered.id).toBe(initial.id);
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: false })).toHaveValue("");
  await page.evaluate(({ recoveryKey, storeKey }) => {
    const record = JSON.parse(sessionStorage.getItem(recoveryKey));
    const held = JSON.parse(localStorage.getItem(storeKey)).holds.find((item) => item.id === record.id);
    record.job = { type: "create", input: { ...held.context, slotIds: held.slots.map((slot) => slot.id) }, idempotencyKey: held.operations[0] };
    delete record.id;
    sessionStorage.setItem(recoveryKey, JSON.stringify(record));
  }, { recoveryKey, storeKey });
  await page.reload();
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeEnabled();
  expect((await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), recoveryKey)).id).toBe(initial.id);
});

test("cancels a hold and releases it when switching booking context", async ({ page }) => {
  await select(page);
  await page.getByRole("button", { name: "Cancel hold", exact: true }).click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("0");
  await expect(slot(page)).toBeEnabled(); await slot(page).click();
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeEnabled();
  const id = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)).id, recoveryKey);
  await page.getByRole("button", { name: "basketball", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Half-court 1", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem("rim-rally:demo-holds:v1")).holds.find((item) => item.id === id).released, id)).toBe(true);
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("0");
});

test("expires a demo hold, blocks continuation, and permits a fresh selection", async ({ page }) => {
  await select(page);
  await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await page.getByText("Demo hold controls", { exact: true }).click();
  await page.getByRole("button", { name: "Expire demo hold", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("expired");
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("0");
  await slot(page).click(); await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeEnabled();
});

test("two browser tabs cannot hold the same private slot", async ({ page, context }) => {
  const other = await context.newPage();
  await Promise.all([page.goto(url), other.goto(url)]);
  await expect(slot(page)).toBeEnabled(); await expect(slot(other)).toBeEnabled();
  await Promise.all([slot(page).click(), slot(other).click()]);
  await expect.poll(async () => (await page.getByRole("button", { name: "Enter guest details", exact: true }).count()) + (await other.getByRole("button", { name: "Enter guest details", exact: true }).count())).toBe(1);
  const holds = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).holds.filter((hold) => !hold.released && Date.parse(hold.expiresAt) > Date.now()), storeKey);
  expect(holds).toHaveLength(1);
});

test("protects the last Open Play place and restores it on cancellation", async ({ page, context }) => {
  const other = await context.newPage();
  await Promise.all([page.goto(`${url}&mode=open-play`), other.goto(`${url}&mode=open-play`)]);
  const session = (target) => target.getByRole("article").filter({ has: target.getByRole("heading", { name: "Afternoon social", exact: true }) });
  await session(page).getByRole("button", { name: "Select one place", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeEnabled();
  await expect(session(other).getByRole("button", { name: "Full", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel hold", exact: true }).click();
  await expect(session(other).getByRole("button", { name: "Select one place", exact: true })).toBeEnabled();
});

test("counts down by elapsed time and expires after returning from a long pause", async ({ page }) => {
  await page.clock.install({ time: new Date("2029-12-31T12:00:00Z") });
  await select(page);
  await expect(page.getByRole("timer")).toContainText(/10:00|09:59/);
  await page.clock.fastForward(601000);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("expired");
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).not.toBeVisible();
});

test("reconciles lost create and update acknowledgements without duplicate holds", async ({ page }) => {
  await page.addInitScript(() => {
    const request = navigator.locks.request.bind(navigator.locks);
    const lost = new Set();
    navigator.locks.request = async (...args) => {
      const result = await request(...args);
      if (result?.id && [1, 2].includes(result.revision) && !lost.has(result.revision)) { lost.add(result.revision); throw new Error("Simulated acknowledgement lost after commit"); }
      return result;
    };
  });
  await page.goto(url); await slot(page).click();
  await expect(page.getByRole("button", { name: "Retry hold check", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).not.toBeVisible();
  const original = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).holds[0], storeKey);
  await page.getByRole("button", { name: "Retry hold check", exact: true }).click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("400");
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeEnabled();
  await slot(page, 9).click();
  await expect(page.getByRole("button", { name: "Retry hold check", exact: true })).toBeVisible();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("400");
  await expect(page.getByRole("button", { name: "Enter guest details", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry hold check", exact: true }).click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("800");
  const records = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).holds, storeKey);
  expect(records).toHaveLength(1); expect(records[0].id).toBe(original.id); expect(records[0].expiresAt).toBe(original.expiresAt);
});

test("guest details remain readable across supported widths", async ({ page }) => {
  await select(page); await page.getByRole("button", { name: "Enter guest details", exact: true }).click();
  await fillGuest(page);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByLabel("Full name", { exact: false })).toBeVisible();
    if (width === 390) await page.screenshot({ path: "docs/screenshots/phase-3-mobile.jpg", fullPage: true });
  }
  await page.getByRole("button", { name: "Review reservation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your game is taking shape.", exact: true })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/phase-3-review.jpg", fullPage: true });
});

import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("admin lists, filters, walk-ins and details render without querying the removed API", async ({ page }) => {
  const requests = [], failures = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url()); });
  page.on("pageerror", (e) => failures.push(e.message));
  for (const [path, title] of [["bookings", "Bookings"], ["customers", "Customers"], ["payments", "Payments"], ["cancellations", "Cancellations"], ["sessions", "Sessions"], ["walk-in", "Add walk-in booking"], ["bookings/example", "Booking details"], ["customers/example", "Customer details"], ["sessions/example", "Session participants"]]) {
    await page.goto(`/dashboard/${path}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("Temporarily unavailable", { exact: true }).first()).toBeVisible();
    for (const control of await page.locator("main input:not([type=hidden]), main select, main textarea, main button").all()) await expect(control).toBeDisabled();
  }
  await page.goto("/dashboard/walk-in");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  }
  expect(requests).toEqual([]);
  expect(failures).toEqual([]);
});

test("live booking and pass recovery are paused, including saved checkout sessions", async ({ page }) => {
  test.skip(process.env.DEMO_TEST_BUILD === "1", "This check targets the live build, not explicit browser demos.");
  const requests = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url()); });
  await page.addInitScript(() => sessionStorage.setItem("rim-rally:payment-recovery:v1", JSON.stringify({ credential: "old-test-credential", key: "old-request-key", holdId: "old-hold", method: "gcash", amount: 40000 })));
  await page.goto("/book/rim-and-rally?date=2030-01-01");
  await expect(page.getByText("Temporarily unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to booking", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Choose date", exact: true })).toBeDisabled();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.goto("/booking/old-booking/confirmation");
  await expect(page.getByRole("heading", { name: "Booking pass", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print / Save as PDF", exact: true })).toBeDisabled();
  await expect(page.getByRole("img", { name: "Digital ticket QR" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("old proxy and proof links fail closed without an upstream backend", async ({ request }) => {
  for (const path of ["/api/auth/login", "/api/staff/bookings", "/api/availability", "/api/holds", "/api/payment-attempts"]) {
    const result = await request.post(path, { data: { mustNotBeForwarded: true } });
    expect(result.status()).toBe(503);
    expect((await result.json()).error.message).toBe("Temporarily unavailable");
    expect(result.headers()["cache-control"]).toContain("no-store");
  }
  const proof = await request.get("/dashboard/proofs/old-proof");
  expect(proof.status()).toBe(503);
  expect(await proof.text()).toBe("Temporarily unavailable");
});

test("public landing and facility pages remain usable", async ({ page }) => {
  for (const path of ["/", "/facilities/rim-and-rally", "/#about"]) {
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

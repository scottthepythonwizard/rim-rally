import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function accessibleLayouts(page) {
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  }
}

test("staff login and invitations keep their forms but are disabled", async ({ page, context, baseURL }) => {
  const apiRequests = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url()); });
  await context.addCookies([{ name: "rim_rally_staff", value: "stale-session-must-not-trigger-an-api-call", url: baseURL, httpOnly: true }]);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByText("Temporarily unavailable", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeDisabled();
  await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
  await expect(page.getByRole("main").getByRole("button", { name: "Log in", exact: true })).toBeDisabled();
  await accessibleLayouts(page);
  await page.goto("/join#old-invitation-token");
  await expect(page.getByLabel("Choose a password")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeDisabled();
  expect(apiRequests).toEqual([]);
});

test("the staff shell preserves navigation and disabled schedule and account forms", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) apiRequests.push(r.url()); });
  await page.goto("/dashboard");
  await expect(page.getByRole("navigation", { name: "Staff dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Play schedules", exact: true })).toBeVisible();
  await expect(page.getByLabel("Session title", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create schedule", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeDisabled();
  await expect(page.getByText("No schedules yet.", { exact: true })).toHaveCount(0);
  await accessibleLayouts(page);
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Accounts and roles" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create invitation", exact: true })).toBeDisabled();
  await accessibleLayouts(page);
  expect(apiRequests).toEqual([]);
});

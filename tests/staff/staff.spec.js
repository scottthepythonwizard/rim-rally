import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const password = "Test-only password 8391!";
const firstAdmin = "admin@example.test";
const staffEmail = "staff@example.test";

async function accessibleLayouts(page) {
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  }
}

async function accept(page, link) {
  await page.goto(link);
  await page.getByLabel("Choose a password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created.", { exact: false })).toBeVisible();
}

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("main").getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function issueInvitation(page, email, role) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Invitation role").selectOption(role);
  const request = page.waitForRequest((request) => request.method() === "POST" && request.headers()["next-action"]);
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.getByLabel("Invitation link")).toHaveValue(/\/join#/);
  return { link: await page.getByLabel("Invitation link").inputValue(), request: await request };
}

async function replay(context, request, origin) {
  const headers = request.headers();
  const result = await context.request.post(request.url(), {
    headers: { "next-action": headers["next-action"], "content-type": headers["content-type"], origin },
    data: request.postDataBuffer(),
  });
  expect(await result.text()).toContain("You do not have permission for this action.");
}

test("invite-only accounts and server-enforced schedule/account permissions", async ({ page, browser, baseURL }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard/accounts");
  await expect(page).toHaveURL(/\/login$/);

  const bootstrap = execFileSync(process.execPath, ["scripts/bootstrap-staff.mjs", firstAdmin], { encoding: "utf8" }).trim().split(/\r?\n/).at(-1);
  await accept(page, bootstrap);
  await login(page, firstAdmin);
  await expect(page.getByRole("heading", { name: "Open Play schedules" })).toBeVisible();
  await accessibleLayouts(page);
  await page.getByLabel("Session title").fill("Admin session");
  await page.getByLabel("Court", { exact: true }).fill("Court 1");
  await page.getByLabel("Start time", { exact: true }).fill("07:00");
  await page.getByRole("button", { name: "Create schedule" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("between 8:00 AM and midnight");
  await expect(page.getByLabel("Session title")).toHaveValue("Admin session");
  await expect(page.getByLabel("Court", { exact: true })).toHaveValue("Court 1");
  await page.getByLabel("Start time", { exact: true }).fill("08:00");
  await page.getByRole("button", { name: "Create schedule" }).click();
  await expect(page.getByRole("heading", { name: "Admin session" })).toBeVisible();

  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await accessibleLayouts(page);
  const revokedInvite = await issueInvitation(page, "revoked@example.test", "staff");
  await page.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await expect(page.getByText("revoked@example.test · staff", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Invitation link")).toHaveCount(0);
  const revokedContext = await browser.newContext({ baseURL });
  const revokedPage = await revokedContext.newPage();
  await revokedPage.goto(revokedInvite.link);
  await revokedPage.getByLabel("Choose a password").fill(password);
  await revokedPage.getByRole("button", { name: "Create account" }).click();
  await expect(revokedPage.getByRole("main").getByRole("alert")).toContainText("invalid or expired");
  await revokedContext.close();
  const staffInvite = await issueInvitation(page, staffEmail, "staff");
  const staffContext = await browser.newContext({ baseURL });
  const staffPage = await staffContext.newPage();
  await accept(staffPage, staffInvite.link);
  await staffPage.goto(staffInvite.link);
  await staffPage.getByLabel("Choose a password").fill(password);
  await staffPage.getByRole("button", { name: "Create account" }).click();
  await expect(staffPage.getByRole("main").getByRole("alert")).toContainText("invalid or expired");
  await login(staffPage, staffEmail);
  await expect(staffPage.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
  await staffPage.goto("/dashboard/accounts");
  await expect(staffPage).toHaveURL(/\/dashboard$/);
  await replay(staffContext, staffInvite.request, baseURL);

  await page.reload();
  const extra = await issueInvitation(page, "second-admin@example.test", "admin");
  const extraContext = await browser.newContext({ baseURL });
  const extraPage = await extraContext.newPage();
  await accept(extraPage, extra.link);
  await login(extraPage, "second-admin@example.test");
  await extraPage.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(extraPage.getByRole("heading", { name: "Accounts and roles" })).toBeVisible();
  await page.reload();
  const account = page.getByRole("article").filter({ hasText: "second-admin@example.test" });
  await account.getByRole("combobox", { name: "Role", exact: true }).selectOption("staff");
  const roleRequest = page.waitForRequest((request) => request.method() === "POST" && request.headers()["next-action"]);
  await account.getByRole("button", { name: "Save account" }).click();
  await expect(account.getByText("staff · Active")).toBeVisible();
  await expect(account.getByRole("combobox", { name: "Role", exact: true })).toHaveValue("staff");
  await replay(staffContext, await roleRequest, baseURL);
  await extraPage.reload();
  await expect(extraPage).toHaveURL(/\/login$/);
  await login(extraPage, "second-admin@example.test");
  await account.getByRole("combobox", { name: "Access", exact: true }).selectOption("0");
  await account.getByRole("button", { name: "Save account" }).click();
  await expect(account.getByText("staff · Disabled")).toBeVisible();
  await expect(account.getByRole("combobox", { name: "Access", exact: true })).toHaveValue("0");
  await extraPage.reload();
  await expect(extraPage).toHaveURL(/\/login$/);
  await account.getByRole("combobox", { name: "Access", exact: true }).selectOption("1");
  await account.getByRole("button", { name: "Save account" }).click();
  await expect(account.getByText("staff · Active")).toBeVisible();
  await expect(account.getByRole("combobox", { name: "Access", exact: true })).toHaveValue("1");
  await login(extraPage, "second-admin@example.test");
  await extraContext.close();

  await staffPage.getByRole("textbox", { name: "Session title", exact: true }).fill("Staff session");
  await staffPage.getByRole("textbox", { name: "Court", exact: true }).fill("Court 2");
  const scheduleRequest = staffPage.waitForRequest((request) => request.method() === "POST" && request.headers()["next-action"]);
  await staffPage.getByRole("button", { name: "Create schedule" }).click();
  const record = staffPage.getByRole("article").filter({ hasText: "Staff session" });
  await expect(record).toBeVisible();
  const anonymous = await browser.newContext({ baseURL });
  await replay(anonymous, await scheduleRequest, baseURL);
  await anonymous.close();
  await record.getByText("Edit schedule", { exact: true }).click();
  await record.getByLabel("Session title").fill("Staff session updated");
  await record.getByRole("button", { name: "Save changes" }).click();
  await expect(record.getByRole("heading", { name: "Staff session updated" })).toBeVisible();
  let cancellationPrompted = false;
  staffPage.once("dialog", async (dialog) => {
    cancellationPrompted = true;
    await dialog.dismiss();
  });
  await record.getByRole("button", { name: "Cancel schedule" }).click();
  expect(cancellationPrompted).toBe(true);
  await expect(record.getByText("Scheduled", { exact: true })).toBeVisible();
  staffPage.once("dialog", (dialog) => dialog.accept());
  await record.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(record.getByText("Canceled", { exact: true })).toBeVisible();
  await staffPage.reload();
  await expect(record.getByText("Canceled", { exact: true })).toBeVisible();
  staffPage.once("dialog", (dialog) => dialog.accept());
  await record.getByRole("button", { name: "Delete schedule" }).click();
  await expect(record).toHaveCount(0);
  await staffPage.getByRole("button", { name: "Sign out" }).click();
  await expect(staffPage).toHaveURL(/\/login$/);
  await staffPage.goto("/dashboard");
  await expect(staffPage).toHaveURL(/\/login$/);
  await staffContext.close();
  await page.getByRole("link", { name: "Open Play schedules", exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

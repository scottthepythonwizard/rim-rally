import { expect, test } from "@playwright/test";

test("selects consecutive hours, changes court, and clears on date change", async ({ page }) => {
  await page.goto("/book/rim-and-rally?date=2030-01-01");
  await expect(page.getByRole("table")).toBeVisible();
  const first = page.getByTestId("slot-2030-01-01_pickleball-1_8").filter({ visible: true });
  await first.click();
  await page.getByTestId("slot-2030-01-01_pickleball-1_9").filter({ visible: true }).click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("800");
  await page.getByTestId("slot-2030-01-01_pickleball-1_12").filter({ visible: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("consecutive hours");
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("800");
  await page.getByLabel("Choose court").selectOption("pickleball-2");
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("0");
  await page.getByTestId("slot-2030-01-01_pickleball-2_9").filter({ visible: true }).click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("400");
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page).toHaveURL(/date=2030-01-02/);
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("0");
});

test("calendar selection and browser history preserve the selected date", async ({ page }) => {
  await page.goto("/book/rim-and-rally?date=2030-01-01");
  await page.getByRole("button", { name: "Choose date", exact: true }).click();
  await page.getByRole("button", { name: "Wednesday, January 2nd, 2030", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL(/date=2030-01-02/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Tue, Jan 1", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tue, Jan 1", exact: true })).toBeVisible();
});

test("mobile schedule supports one court and remains within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/book/rim-and-rally?date=2030-01-01");
  await expect(page.getByLabel("Choose court")).toBeVisible();
  await expect(page.getByRole("table")).not.toBeVisible();
  await page.getByTestId("slot-2030-01-01_pickleball-1_8").filter({ visible: true }).click();
  await expect(page.getByLabel("Mobile selection total", { exact: true })).toContainText("400");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Choose date", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close calendar", exact: true }).press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Choose date", exact: true })).toBeFocused();
});

test("rapid sport/date changes discard slow responses and sold-out state recovers", async ({ page }) => {
  await page.goto("/book/rim-and-rally?date=2030-01-01&scenario=slow");
  await page.getByRole("button", { name: "basketball", exact: true }).click();
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Half-court 1", exact: true })).toBeVisible();
  await expect(page.getByTestId("slot-2030-01-02_basketball-1_8").filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel("Choose court").getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("table").locator("thead th")).toHaveCount(2);
  await page.getByText("Demo availability scenarios", { exact: true }).click();
  await page.getByLabel("Demo scenario").selectOption("sold-out");
  await expect(page.getByText("No available hours remain for this day. Choose another date or sport.")).toBeVisible();
  await page.getByLabel("Demo scenario").selectOption("empty");
  await expect(page.getByRole("heading", { name: "No schedules for this day.", exact: true })).toBeVisible();
  await page.getByLabel("Demo scenario").selectOption("error");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await page.getByLabel("Demo scenario").selectOption("normal");
  await expect(page.getByRole("table")).toBeVisible();
});

test("Open Play capacity and demo recovery", async ({ page }) => {
  await page.goto("/book/rim-and-rally?date=2030-01-01&mode=open-play");
  await expect(page.getByText("1 place remaining")).toBeVisible();
  await page.getByRole("button", { name: "Select one place", exact: true }).first().click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("200");
  await page.getByText("Demo availability scenarios", { exact: true }).click();
  await page.getByLabel("Demo scenario").selectOption("malformed");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("incomplete information");
  await page.getByLabel("Demo scenario").selectOption("normal");
  await expect(page.getByText("1 place remaining")).toBeVisible();
  await page.getByRole("button", { name: "basketball", exact: true }).click();
  await expect(page.getByText("11 / 12 players registered", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select one place", exact: true }).first().click();
  await expect(page.getByLabel("Selection total", { exact: true })).toContainText("250");
});

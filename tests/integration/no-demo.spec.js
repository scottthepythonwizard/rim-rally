import { expect, test } from "@playwright/test";

test("schedule shows the API failure without loading demo records", async ({ page }) => {
  const availability = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/availability");
  await page.goto("/book/rim-and-rally");
  expect((await availability).status()).toBe(503);
  await expect(page.getByRole("heading", { name: "We couldn’t load the schedule." })).toBeVisible();
  await expect(page.getByText(/Demo mode · Sample records/)).toHaveCount(0);
  await expect(page.getByTestId(/^slot-/)).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeDisabled();
});

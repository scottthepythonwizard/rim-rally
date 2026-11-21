import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

for (const width of [390, 1440]) test(`shared navigation, pages and assets survive organization at ${width}px`, async ({ page }) => {
  const errors = [], brokenAssets = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() >= 400 && /(?:\/_next\/static\/|\/fonts\/|\/images\/)/.test(path)) brokenAssets.push(path);
  });
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/");
  await expect(page.locator("main h1")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    images.forEach((image) => { image.loading = "eager"; });
    await Promise.all(images.map((image) => image.decode()));
  });
  expect(await page.locator("header img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  const stage = process.env.ORGANIZATION_VISUAL_STAGE === "before" ? "before" : "after";
  const directory = `test-results/frontend-organization/${stage}`;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/home-${width}.png`, fullPage: true, animations: "disabled" });
  if (width < 768) await page.locator("header summary").click();
  const navigation = page.getByRole("navigation", { name: width < 768 ? "Mobile navigation" : "Main navigation", exact: true });
  await navigation.getByRole("link", { name: "Book / Open play", exact: true }).click();
  await expect(page).toHaveURL(/\/book\/rim-and-rally\?mode=open-play$/);
  await expect(page.locator("main h1")).toBeVisible();
  if (width < 768) await page.locator("header summary").click();
  await navigation.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email address", { exact: true })).toBeEnabled();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/facilities/rim-and-rally");
  await expect(page.locator("main h1")).toBeVisible();
  await page.goto("/join#test-only-invalid-invitation");
  await expect(page.getByLabel("Choose a password")).toBeVisible();
  await page.goto("/facilities/does-not-exist");
  await expect(page.getByRole("heading", { name: "This court isn’t here." })).toBeVisible();
  expect(brokenAssets).toEqual([]);
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";

test("Budget plan builder navigation scrolls after same-route clicks and direct hash loads", async ({ page }) => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/budget");
    const openPlanBuilder = page.getByTestId("link-open-plan-builder");
    const planning = page.locator("#budget-planning");
    const planningHeading = planning.getByText("Planning Control Center", { exact: true });

    await expect(openPlanBuilder).toBeVisible();
    await openPlanBuilder.click();
    await expect(page).toHaveURL(/\/budget#budget-planning$/);
    await expect(planningHeading).toBeVisible();
    await expect(planningHeading).toBeInViewport();

    const clickPosition = await planningHeading.boundingBox();
    expect(clickPosition?.y, `${viewport.name} click should scroll to planning`).toBeGreaterThanOrEqual(0);
    expect(clickPosition?.y, `${viewport.name} click should place planning near the viewport top`).toBeLessThan(220);

    await page.goto("/budget#budget-planning");
    await expect(page).toHaveURL(/\/budget#budget-planning$/);
    await expect(planning).toBeVisible();
    await expect(planningHeading).toBeInViewport();

    const directLoadPosition = await planningHeading.boundingBox();
    expect(directLoadPosition?.y, `${viewport.name} direct hash load should scroll to planning`).toBeGreaterThanOrEqual(0);
    expect(directLoadPosition?.y, `${viewport.name} direct hash load should place planning near the viewport top`).toBeLessThan(220);
    }
});
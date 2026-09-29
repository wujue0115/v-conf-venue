import { test, expect } from '@playwright/test'

test('renders the venue planner', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('場地規劃')
  await expect(page.locator('.tile')).toHaveCount(25)
  await expect(page.locator('canvas')).toBeVisible()
})

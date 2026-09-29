import { test, expect } from '@playwright/test'

// a Chinese browser opens the planner in 中文 (anything else starts in English)
test.use({ locale: 'zh-TW' })

test('renders the venue planner', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('場地規劃')
  await expect(page.locator('.tile')).toHaveCount(25)
  await expect(page.locator('canvas')).toBeVisible()
})

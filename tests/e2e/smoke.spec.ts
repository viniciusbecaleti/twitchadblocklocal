import { test, expect } from '@playwright/test';
test('simulated Twitch page remains interactive after a visual-ad cleanup', async ({ page }) => {
  await page.setContent('<button>Chat</button><aside aria-label="Advertisement">Ad</aside>');
  await page.locator('aside').evaluate((node) => node.remove());
  await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible();
});

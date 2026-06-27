// @ts-check
const { test, expect } = require('@playwright/test');

// Deterministic tide fixtures keyed by NOAA begin_date (YYYYMMDD).
const FIXTURES = {
  '20260626': [
    { t: '2026-06-26 02:05', v: '10.322', type: 'H' },
    { t: '2026-06-26 09:31', v: '-0.869', type: 'L' },
    { t: '2026-06-26 17:40', v: '10.690', type: 'H' },
    { t: '2026-06-26 22:33', v: '7.909', type: 'L' },
  ],
  '20260627': [
    { t: '2026-06-27 02:43', v: '10.032', type: 'H' },
    { t: '2026-06-27 10:06', v: '-1.291', type: 'L' },
    { t: '2026-06-27 18:20', v: '11.171', type: 'H' },
    { t: '2026-06-27 23:25', v: '7.976', type: 'L' },
  ],
};

const STATION_META = {
  count: 1,
  stations: [{ id: '9447110', name: 'LOCKHEED SHIPYARD', state: 'WA' }],
};

/**
 * Install API mocks so tests never depend on the live NOAA service.
 */
async function mockNoaa(page) {
  await page.route('**/mdapi/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(STATION_META) })
  );
  await page.route('**/datagetter**', (route) => {
    const url = new URL(route.request().url());
    const begin = url.searchParams.get('begin_date') || '';
    const predictions = FIXTURES[begin] || [];
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ predictions }),
    });
  });
}

// Fixed "now" = 2026-06-26 in America/Los_Angeles (PDT, UTC-7).
function fixedNow(localTime) {
  return new Date(`2026-06-26T${localTime}-07:00`);
}

test.describe('Tide Tracker', () => {
  test('loads station name and default title', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    await expect(page).toHaveTitle(/Tide Tracker/);
    await expect(page.locator('#stationName')).toContainText('LOCKHEED SHIPYARD, WA');
    await expect(page.locator('#stationName')).toContainText('9447110');
  });

  test('today view shows next low and next high tide from this moment', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    await expect(page.locator('#todayPill')).toBeVisible();

    const lowCard = page.locator('.card[data-kind="low"]');
    const highCard = page.locator('.card[data-kind="high"]');

    await expect(lowCard).toHaveAttribute('data-state', 'value');
    await expect(highCard).toHaveAttribute('data-state', 'value');

    // Next high after 13:00 is 17:40; next low after 13:00 is 22:33.
    await expect(highCard.locator('.time')).toContainText('5:40');
    await expect(highCard.locator('.ampm')).toHaveText('PM');
    await expect(lowCard.locator('.time')).toContainText('10:33');
    await expect(lowCard.locator('.ampm')).toHaveText('PM');
  });

  test('shows dash when there is no more high tide today', async ({ page }) => {
    await mockNoaa(page);
    // 18:00 is after the last high (17:40) but before the last low (22:33).
    await page.clock.setFixedTime(fixedNow('18:00:00'));
    await page.goto('/index.html');

    const lowCard = page.locator('.card[data-kind="low"]');
    const highCard = page.locator('.card[data-kind="high"]');

    await expect(highCard).toHaveAttribute('data-state', 'none');
    await expect(highCard.locator('.none')).toHaveText('–');
    await expect(highCard).toContainText('No more high tide today');

    await expect(lowCard).toHaveAttribute('data-state', 'value');
    await expect(lowCard.locator('.time')).toContainText('10:33');
  });

  test('shows dash for both when no tides remain today', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('23:00:00'));
    await page.goto('/index.html');

    await expect(page.locator('.card[data-kind="low"]')).toHaveAttribute('data-state', 'none');
    await expect(page.locator('.card[data-kind="high"]')).toHaveAttribute('data-state', 'none');
  });

  test('navigating to another day shows all tide moments', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    await page.locator('#nextDay').click();

    // Not today: pill hidden, full list shown with every hi/lo moment.
    await expect(page.locator('#todayPill')).toBeHidden();
    await expect(page.locator('.full-list')).toBeVisible();
    // Heading is followed by the formatted date of the viewed day (2026-06-27).
    await expect(page.locator('.full-list h2')).toContainText('All tides for');
    await expect(page.locator('.full-list h2')).toContainText('June 27, 2026');
    await expect(page.locator('.tide-row')).toHaveCount(4);

    const rows = page.locator('.tide-row');
    await expect(rows.nth(0)).toContainText('High');
    await expect(rows.nth(0)).toContainText('2:43');
    await expect(rows.nth(1)).toContainText('Low');
    await expect(rows.nth(1)).toContainText('10:06');
    await expect(rows.nth(3)).toContainText('11:25'); // 23:25

    // "Back to today" returns to the card view.
    await expect(page.locator('#jumpToday')).toBeVisible();
    await page.locator('#jumpToday').click();
    await expect(page.locator('#todayPill')).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(2);
  });

  test('previous-day button works and is symmetric', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    await page.locator('#nextDay').click();
    await expect(page.locator('#datePicker')).toHaveValue('2026-06-27');
    await page.locator('#prevDay').click();
    await expect(page.locator('#datePicker')).toHaveValue('2026-06-26');
    await expect(page.locator('#todayPill')).toBeVisible();
  });

  test('footer links to the NOAA station home page', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    const link = page.locator('#stationHomeLink');
    await expect(link).toHaveAttribute(
      'href',
      'https://tidesandcurrents.noaa.gov/stationhome.html?id=9447110#info'
    );
    await expect(link).toHaveAttribute('target', '_blank');
  });
});

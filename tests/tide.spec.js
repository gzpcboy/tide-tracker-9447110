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
  '20280229': [
    { t: '2028-02-29 01:24', v: '9.1', type: 'H' },
    { t: '2028-02-29 08:11', v: '1.2', type: 'L' },
    { t: '2028-02-29 14:46', v: '8.8', type: 'H' },
    { t: '2028-02-29 21:06', v: '0.4', type: 'L' },
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
    const end = url.searchParams.get('end_date') || begin;
    const predictions = Object.entries(FIXTURES)
      .filter(([date]) => date >= begin && date <= end)
      .flatMap(([, items]) => items);
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

    await expect(page).toHaveTitle(/West Seattle Area Tides/);
    await expect(page.locator('#stationName')).toContainText('LOCKHEED SHIPYARD, WA');
    await expect(page.locator('#stationName')).toContainText('9447110');
  });

  test('today view shows current tide plus next low and next high from this moment', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    await expect(page.locator('#todayPill')).toBeVisible();

    const lowCard = page.locator('.card[data-kind="low"]');
    const highCard = page.locator('.card[data-kind="high"]');

    await expect(lowCard).toHaveAttribute('data-state', 'value');
    await expect(highCard).toHaveAttribute('data-state', 'value');

    // Next high after 13:00 is 17:40; next low after 13:00 is 22:33.
    await expect(highCard.locator('.time')).toHaveText('17:40');
    await expect(lowCard.locator('.time')).toHaveText('22:33');

    const chart = page.locator('#todayTideChart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('.now-marker')).toBeVisible();
    await expect(chart.locator('.now-marker')).toContainText('ft');

    const referenceRows = page.locator('.full-list .tide-row');
    await expect(referenceRows).toHaveCount(4);
    await expect(page.locator('.full-list .tide-row.past')).toHaveCount(2);
  });

  test('continues with tomorrow’s next high after today’s last high', async ({ page }) => {
    await mockNoaa(page);
    // 18:00 is after the last high (17:40) but before the last low (22:33).
    await page.clock.setFixedTime(fixedNow('18:00:00'));
    await page.goto('/index.html');

    const lowCard = page.locator('.card[data-kind="low"]');
    const highCard = page.locator('.card[data-kind="high"]');

    await expect(highCard).toHaveAttribute('data-state', 'value');
    await expect(highCard).toContainText('Tomorrow');
    await expect(highCard.locator('.time')).toHaveText('02:43');

    await expect(lowCard).toHaveAttribute('data-state', 'value');
    await expect(lowCard.locator('.time')).toHaveText('22:33');
  });

  test('continues with tomorrow’s tides after today has ended', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('23:00:00'));
    await page.goto('/index.html');

    await expect(page.locator('#todayTideChart')).toBeVisible();
    const lowCard = page.locator('.card[data-kind="low"]');
    const highCard = page.locator('.card[data-kind="high"]');
    await expect(lowCard).toHaveAttribute('data-state', 'value');
    await expect(highCard).toHaveAttribute('data-state', 'value');
    await expect(lowCard.locator('.time')).toHaveText('10:06');
    await expect(highCard.locator('.time')).toHaveText('02:43');
    await expect(lowCard).toContainText('Tomorrow');
    await expect(highCard).toContainText('Tomorrow');
  });

  test('navigating to another day shows all tide moments', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    await page.locator('#nextDay').click();

    // Non-today: a curve marks every tide plus unobstructed daylight guides.
    await expect(page.locator('#todayPill')).toBeHidden();
    await expect(page.locator('.daylight-summary')).toHaveCount(0);

    const chart = page.locator('#forecastTideChart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('.forecast-one-foot')).toHaveCount(1);
    await expect(chart.locator('.time-guide')).toHaveCount(2);
    await expect(chart).toContainText('09:00');
    await expect(chart).toContainText('START · 09:00');
    await expect(chart).toContainText('SUNSET ·');
    await expect(chart.locator('.forecast-window-band')).toHaveCount(1);
    await expect(chart.locator('.forecast-guide-note')).toHaveCount(2);
    await expect(chart.locator('.forecast-event')).toHaveCount(4);
    await expect(chart.locator('.forecast-curve')).toHaveAttribute('d', /^(?!.*NaN).*L /);
    await expect(chart).toContainText('23:25');
    await expect(page.locator('.full-list')).toHaveCount(0);

    // "Back to today" returns to the card view.
    await expect(page.locator('#jumpToday')).toBeVisible();
    await page.locator('#jumpToday').click();
    await expect(page.locator('#todayPill')).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(2);
    await expect(page.locator('#todayTideChart')).toBeVisible();
  });


  test('uses the dedicated leap-day sunset lookup', async ({ page }) => {
    await mockNoaa(page);
    await page.clock.setFixedTime(fixedNow('13:00:00'));
    await page.goto('/index.html');

    await page.locator('#datePicker').fill('2028-02-29');
    await page.locator('#datePicker').dispatchEvent('change');

    const chart = page.locator('#forecastTideChart');
    await expect(chart).toBeVisible();
    await expect(chart.locator('.forecast-guide-note').filter({ hasText: 'SUNSET' })).toHaveText('SUNSET · 17:52');
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

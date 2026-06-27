# 🌊 Tide Tracker — NOAA Station 9447110

A fancy, single-page web app that shows tide information for **NOAA station 9447110
(Lockheed Shipyard, WA — Puget Sound / Seattle area)**, powered live by the
[NOAA Tides & Currents API](https://api.tidesandcurrents.noaa.gov/).

## Features

- **Today by default** — shows the **next low tide** and **next high tide** from *this
  moment* until the end of the day. If there are no more low/high tides today, it shows `–`.
- **Date controls** — jump to the **previous day**, **next day**, or pick any date with the
  date picker. A *Today* badge marks the current day, and a *Back to today* shortcut appears
  on other days.
- **Full-day view** — when viewing any day other than today, every high/low tide moment for
  that day is listed.
- **Station link** — a footer link opens the
  [NOAA station home page](https://tidesandcurrents.noaa.gov/stationhome.html?id=9447110#info).
- **Live station name** — the station name is fetched from the NOAA metadata API.

The app is a single static `index.html` file (no build step, no backend).

## Run locally

```bash
# Serve the static file (any static server works)
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

## End-to-end tests

Deterministic Playwright regression tests live in [`tests/tide.spec.js`](tests/tide.spec.js).
They mock the NOAA API and freeze the clock so results are stable regardless of the real date/time.

```bash
npm install
npx playwright install chromium
npm test
```

The tests cover: station name loading, the next-low/next-high "today" cards, the `–`
fallback when no more tides remain, full-day navigation, prev/next-day buttons, and the
station footer link.

## Deployment

Pushes to `main` run the Playwright suite and deploy the app to **GitHub Pages** via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Data source

Tide predictions come from the NOAA CO-OPS API (`product=predictions`, `interval=hilo`,
`datum=MLLW`). NOAA tide data is provided for informational purposes and should not be used
for navigation.

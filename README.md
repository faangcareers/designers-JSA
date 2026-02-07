# Designers Job Search Aggregator (Cards)

Paste a designer job listings URL (career page, job board search, etc.) and get the results back as clean, scannable cards.

## Setup

```
npm install
```

## Run locally

```
npm run dev
```

Server defaults to `http://localhost:3000`. To change it, set `PORT` in a `.env` file (see `.env.example`).

## Database

The app uses SQLite for persistence. DB path is stage-aware by default:

- `STAGE=dev` -> `./data/app.dev.db`
- `STAGE=production` -> `./data/app.production.db`

You can override with:

```
DB_PATH=./data/app.db
```

## Daily refresh

A daily refresh runs at 09:00 local time. Override with:

```
CRON_HOUR=9
CRON_TZ=Europe/Berlin
ENABLE_INTERNAL_CRON=true
```

Set `ENABLE_INTERNAL_CRON=false` if you want to disable scheduler inside the web process.

## ScrapingBee (optional)

To help with JS-heavy or rate-limited sites, you can enable ScrapingBee:

1. Add your key to `.env`:
```
SCRAPINGBEE_API_KEY=your_key_here
SCRAPINGBEE_RENDER_JS=true
SCRAPINGBEE_ALWAYS=true
```

2. Restart the server.

When enabled, the server retries with ScrapingBee if a direct fetch fails. If
`SCRAPINGBEE_ALWAYS=true`, all HTML fetches go through ScrapingBee.

## Zyte (optional)

Zyte Extract API can also be used to fetch browser-rendered HTML:

1. Add your key to `.env`:
```
ZYTE_API_KEY=your_key_here
ZYTE_ALWAYS=true
ZYTE_BROWSER_HTML=true
ZYTE_STRUCTURED_DATA=true
ZYTE_EXTRACT_TYPE=jobPosting
```

2. Restart the server.

If `ZYTE_ALWAYS=true`, all HTML fetches go through Zyte. Otherwise Zyte is used
as a fallback when direct fetch fails.

## Usage

1. Open the app in your browser.
2. Paste a URL that already contains designer jobs.
3. Click “Parse jobs”.

The server fetches the HTML, parses it with best-effort heuristics, and returns cards.

## API

`GET /api/health`

Returns current runtime stage and scheduler config.

`POST /api/parse`

Body:

```json
{ "url": "https://..." }
```

Response:

```json
{
  "sourceUrl": "...",
  "host": "...",
  "count": 12,
  "jobs": [
    {
      "title": "Product Designer",
      "company": "Example",
      "location": "Remote",
      "url": "https://...",
      "postedAt": "3 days ago",
      "tags": ["UX", "UI"]
    }
  ],
  "warnings": []
}
```

## Notes about JS-heavy sites

Some pages only render job listings after JavaScript runs in the browser. This app does not use headless browsers, so it may return warnings like:

- “This site may require JavaScript rendering; try another URL or use a different source.”

## Sample URLs (best-effort examples)

These are generic examples and may or may not work depending on site changes:

- `https://www.greenhouse.io/` (company-specific pages under this domain)
- `https://boards.greenhouse.io/<company>`
- `https://jobs.lever.co/<company>`

## How extraction works

Extraction follows a layered pipeline:
1. Domain adapters run first (VK, Spotify, Lever, etc.).
2. Generic rules then run for additional coverage.
3. Results are merged and deduplicated by `title + url`.

Generic heuristics also apply:
- Find repeating blocks with design-related keywords.
- Titles come from prominent headers or anchors.
- Locations are detected from nearby text.
- Company is inferred from meta tags or hostname.
- Duplicate jobs are removed by URL + title.

## Adapters

Specialized adapters exist for some domains to improve accuracy:
- `team.vk.company` (VK careers)
- `lifeatspotify.com` (Spotify careers)
- `jobs.lever.co` (Lever boards, e.g. Bumble)

If a domain doesn’t have a dedicated adapter, the generic parser is used.

Extraction is best-effort and will vary by site structure.

## Stages (dev + production)

Branch mapping:

- `develop` -> `dev` stage
- `main` -> `production` stage

Runtime mapping:

- set `STAGE=dev` for development environment
- set `STAGE=production` for production environment

Both stages should use separate SQLite files/disks.

## Render blueprint

`render.yaml` contains 2 web services:

- `designers-jsa-dev` (branch `develop`)
- `designers-jsa-production` (branch `main`)

Each service has its own persistent disk and DB file path.

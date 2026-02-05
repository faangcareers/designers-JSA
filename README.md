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

## Usage

1. Open the app in your browser.
2. Paste a URL that already contains designer jobs.
3. Click “Parse jobs”.

The server fetches the HTML, parses it with best-effort heuristics, and returns cards.

## API

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

- Generic heuristics find repeating blocks with design-related keywords.
- Titles come from prominent headers or anchors.
- Locations are detected from nearby text.
- Company is inferred from meta tags or hostname.
- Duplicate jobs are removed by URL + title.

Extraction is best-effort and will vary by site structure.

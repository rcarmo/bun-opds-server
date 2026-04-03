# bun-opds-server

A small read-only OPDS server for **multiple Calibre libraries under one filesystem tree**.

It scans for `metadata.db` files, merges EPUB-capable books across libraries, deduplicates by title, and exposes simple OPDS feeds for ebook readers.

## Current MVP

- recursively discovers Calibre libraries under `CALIBRE_ROOT`
- reads `metadata.db` in read-only mode
- merges all books with available **EPUB** and/or **PDF** files
- deduplicates entries by normalized book title, keeping the newest copy
- exposes OPDS feeds for:
  - recent additions (capped for ereader compatibility)
  - recently updated (capped for ereader compatibility)
  - per-library views
  - search results (capped for ereader compatibility)
- exposes lightweight HTML browse pages with:
  - constrained cover display
  - minimal metadata (series, tags, updated/published dates, short description)
  - direct EPUB/PDF download links when available
- supports pagination for browse/feed views
- keeps HTML browse/search views unbounded by the feed cap so full libraries remain browseable
- supports scored search ordering across title, authors, series, tags, and library
- serves direct EPUB downloads
- optionally serves cover images
- supports optional HTTP basic auth

## Why this exists

This is aimed at setups where:

- there are **multiple separate Calibre libraries**
- they live under one parent tree
- a reader should be able to point at **one OPDS endpoint**
- the main use case is: *show me the most recent books and let me download EPUBs*

## Endpoints

### JSON / service
- `/health`
- `/libraries`

### OPDS
- `/opds`
- `/opds/recent`
- `/opds/updated`
- `/opds/library/:librarySlug`
- `/opds/search?q=dune`

### HTML browse views
- `/`
- `/browse/recent`
- `/browse/updated`
- `/library/:librarySlug`
- `/search?q=dune`

### Asset / download
- `/download/:librarySlug/:bookId/epub`
- `/download/:librarySlug/:bookId/pdf`
- `/cover/:librarySlug/:bookId`

Search results are ranked primarily by title matches, then by author/series/tag/library matches, with recency as a tiebreaker. OPDS feeds stay capped to the configured feed limit; HTML browse and search views can paginate through the full result set.

## Quick start

```bash
cd /workspace/projects/bun-opds-server
cp .env.example .env
bun run index.ts
```

Or with inline variables:

```bash
cd /workspace/projects/bun-opds-server
CALIBRE_ROOT=/volume1/books \
BASE_URL=http://localhost:8787 \
bun run index.ts
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CALIBRE_ROOT` | `/volume1/books` | Root directory to scan for Calibre libraries |
| `HOST` | `0.0.0.0` | Bind host |
| `PORT` | `8787` | Bind port |
| `BASE_URL` | `http://localhost:$PORT` | Public base URL used in OPDS links |
| `FEED_LIMIT` | `100` | Max entries in recent/updated feeds |
| `REFRESH_MS` | `600000` | Background refresh interval |
| `BASIC_AUTH_USER` | unset | Optional basic auth username |
| `BASIC_AUTH_PASS` | unset | Optional basic auth password |

## Development

```bash
bun run index.ts --help
bun run --watch index.ts
```

## Docker image

Tagged releases publish a container image to:

- `ghcr.io/rcarmo/bun-opds-server`

### Run with Docker

```bash
docker run --rm -p 8787:8787 \
  -e CALIBRE_ROOT=/books \
  -e BASE_URL=http://localhost:8787 \
  -v /path/to/books:/books:ro \
  ghcr.io/rcarmo/bun-opds-server:latest
```

### Run with Docker Compose

A sample Compose file is included as:

- `docker-compose.yml`

It supports `PUID` / `PGID` via Compose user mapping so the container can read host-mounted libraries as the expected user and group.

Example `.env` values:

```env
PUID=1000
PGID=1000
```

```bash
docker compose up -d
```

## Releases

A GitHub Actions workflow builds and publishes the container image on every pushed tag matching `v*`.

For semver tags like `v0.1.0`, the workflow publishes tags such as:

- `ghcr.io/rcarmo/bun-opds-server:0.1.0`
- `ghcr.io/rcarmo/bun-opds-server:0.1`
- `ghcr.io/rcarmo/bun-opds-server:0`
- `ghcr.io/rcarmo/bun-opds-server:latest`

Example:

```bash
git tag v0.2.2
git push origin v0.2.2
```

## Design notes

- intentionally **read-only**
- currently assumes cover images live at `cover.jpg` inside each Calibre book directory
- cover display in HTML views is size-constrained with CSS; server-side physical resizing is still a future improvement
- currently deduplicates by normalized title and keeps the newest matching item
- search uses simple weighted scoring across title, authors, series, tags, and library name
- currently exposes a **minimal OPDS 1.x-style feed** aimed at ebook readers, with EPUB/PDF acquisition links when present

## Next likely steps

- better cover detection
- server-side thumbnail generation / resizing
- deployment examples (Compose / reverse proxy)
- repository polish (license choice, CI, release tagging)

## Publishing notes

This project lives under `/workspace/projects/bun-opds-server` and has been lightly cleaned up for GitHub publication:

- `.gitignore` added
- `.env.example` added
- README rewritten for public consumption

License: **MIT**.

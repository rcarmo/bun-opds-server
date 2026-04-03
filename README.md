# bun-opds-server

A small read-only OPDS server for **multiple Calibre libraries under one filesystem tree**.

It scans for `metadata.db` files, merges EPUB-capable books across libraries, and exposes simple OPDS feeds for ebook readers.

## Current MVP

- recursively discovers Calibre libraries under `CALIBRE_ROOT`
- reads `metadata.db` in read-only mode
- merges all books with available **EPUB** files
- exposes OPDS feeds for:
  - recent additions
  - recently updated
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

- `/health`
- `/libraries`
- `/opds`
- `/opds/recent`
- `/opds/updated`
- `/download/:librarySlug/:bookId/epub`
- `/cover/:librarySlug/:bookId`

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

## Design notes

- intentionally **read-only**
- currently assumes cover images live at `cover.jpg` inside each Calibre book directory
- currently does **not** deduplicate titles across libraries
- currently exposes a **minimal OPDS 1.x-style feed** aimed at ebook readers

## Next likely steps

- per-library feeds
- search endpoint
- pagination
- better cover detection
- deployment examples (Compose / reverse proxy)
- repository polish (license choice, CI, release tagging)

## Publishing notes

This project lives under `/workspace/projects/bun-opds-server` and has been lightly cleaned up for GitHub publication:

- `.gitignore` added
- `.env.example` added
- README rewritten for public consumption

License: **MIT**.

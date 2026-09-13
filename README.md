# Martini Family Fantasy Football League

Public, static history archive for completed seasons of the Martini family league.

## Local development

```bash
npm ci
npm run generate:data
npm run test:assets
npm run test:unit
VITE_BASE_PATH=/Martini/ npm run build
```

Local development uses `/`; the GitHub Pages project build uses `/Martini/`.

## Data operations

ESPN exports are collected only from an authenticated browser session and kept outside this repository. `scripts/import_martini_espn.py` rejects credential-like fields, validates the configured completed-season range, and stops with a candidate report when a team is not explicitly mapped. Promotion requires a reviewed mapping; no manager transition is inferred from a similar team name.

The current season is intentionally absent. Only completed seasons through 2025 belong in this release. See [docs/MARTINI_DATA_OPERATIONS.md](docs/MARTINI_DATA_OPERATIONS.md) for the review checklist.

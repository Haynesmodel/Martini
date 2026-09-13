# Martini data operations

The canonical history contract is deliberately small: `assets/H2H.json`, `assets/SeasonSummary.json`, and an empty `assets/Rivalries.json`. The generated `asset-manifest.json` records that history is blocked until a reviewed export is promoted; there are no public derived rows while those canonical files are empty.

1. Use the authenticated ESPN browser's History control to verify the first completed season and the last completed season. The current mapping records 2021–2025; 2026 is excluded.
2. Save each raw response outside this repository. Never commit browser exports, cookies, tokens, authorization fields, or session data.
3. Run `python3 scripts/import_martini_espn.py /path/to/export.json --candidate /tmp/martini-candidate.json`. Unknown or ambiguous team identity is a blocker, not a guess.
4. Review team counts, source IDs, dates, matchup uniqueness, standings, and manager-history intervals.
5. Only after explicit review, promote canonical assets and run `npm run generate:data`, `npm run test:assets`, and `npm run test:unit`.

The visible 2026 ESPN evidence includes separate Team Roell and Westbrook Acres Vintage Wines franchises, plus co-managed Team JOELIA. Those are retained as separate mapping evidence; they must never be merged because a manager display is similar.

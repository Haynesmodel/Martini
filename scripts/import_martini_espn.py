#!/usr/bin/env python3
"""Candidate-first ESPN normalizer for the Martini league.

Raw exports stay outside the repository. Without --promote this command only
validates and writes a sanitized candidate; incomplete identity mapping fails
with a concise report instead of guessing a franchise transition.
"""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

PRIVATE = re.compile(r"(?:cookie|session|token|secret|password|authorization|bearer|credential|auth)", re.I)

def reject_private(value, path="input"):
    if isinstance(value, dict):
        for key, child in value.items():
            if PRIVATE.search(str(key)):
                raise ValueError(f"private field rejected at {path}.{key}")
            reject_private(child, f"{path}.{key}")
    elif isinstance(value, list):
        for i, child in enumerate(value): reject_private(child, f"{path}[{i}]")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("export", type=Path)
    parser.add_argument("--mapping", type=Path, default=Path(__file__).with_name("martini_season_mapping.json"))
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()
    try:
        raw = json.loads(args.export.read_text())
        reject_private(raw)
        mapping = json.loads(args.mapping.read_text())
        season = int(raw.get("seasonId", raw.get("season", 0)))
        configured = mapping.get("seasons", {}).get(str(season))
        if not configured: raise ValueError(f"season {season} is outside the configured completed range")
        if season > 2025: raise ValueError(f"season {season} is not completed history")
        teams = raw.get("teams", raw.get("members", []))
        if len(teams) != configured["teams"]: raise ValueError(f"season {season}: expected {configured['teams']} source teams, found {len(teams)}")
        aliases = mapping.get("team_aliases", [])
        all_ids = [str(team_id) for item in aliases for team_id in item.get("espn_team_ids", [])]
        if len(all_ids) != len(set(all_ids)): raise ValueError("ambiguous mapping: one ESPN team ID is assigned to multiple franchises")
        known_ids = set(all_ids)
        missing = [str(item.get("id", item.get("teamId", "?"))) for item in teams if str(item.get("id", item.get("teamId", ""))) not in known_ids]
        if missing: raise ValueError(f"unmapped ESPN team IDs for season {season}: {', '.join(missing)}; add an explicit franchise mapping before promotion")
        matchups = raw.get("matchups", raw.get("schedule", []))
        seen = set()
        for index, matchup in enumerate(matchups):
            matchup_id = matchup.get("id", matchup.get("matchupId"))
            if matchup_id is None or matchup_id in seen: raise ValueError(f"duplicate or missing matchup ID at row {index}")
            seen.add(matchup_id)
            left, right = matchup.get("teamA", matchup.get("homeTeamId")), matchup.get("teamB", matchup.get("awayTeamId"))
            if left is not None and right is not None and str(left) == str(right): raise ValueError(f"self-matchup at row {index}")
            for key in ("scoreA", "scoreB", "homeScore", "awayScore"):
                if key in matchup and matchup[key] is not None and (not isinstance(matchup[key], (int, float)) or matchup[key] < 0): raise ValueError(f"invalid score at matchup row {index}")
        candidate = {"season": season, "status": "candidate", "team_count": len(teams), "source": "sanitized ESPN export"}
        if args.candidate:
            args.candidate.parent.mkdir(parents=True, exist_ok=True); args.candidate.write_text(json.dumps(candidate, indent=2) + "\n")
        if args.promote: raise ValueError("promotion is disabled until the reviewed canonical team/matchup normalizer is complete")
        print(json.dumps(candidate, indent=2))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"CANDIDATE BLOCKED: {exc}", file=sys.stderr); return 1
    return 0

if __name__ == "__main__": raise SystemExit(main())

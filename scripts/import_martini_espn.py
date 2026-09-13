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
        teams = raw.get("teams", raw.get("members", []))
        if len(teams) != configured["teams"]: raise ValueError(f"season {season}: expected {configured['teams']} source teams, found {len(teams)}")
        known_ids = {str(team_id) for item in mapping.get("team_aliases", []) for team_id in item.get("espn_team_ids", [])}
        missing = [str(item.get("id", item.get("teamId", "?"))) for item in teams if str(item.get("id", item.get("teamId", ""))) not in known_ids]
        if missing: raise ValueError(f"unmapped ESPN team IDs for season {season}: {', '.join(missing)}; add an explicit franchise mapping before promotion")
        candidate = {"season": season, "status": "candidate", "team_count": len(teams), "source": "sanitized ESPN export"}
        if args.candidate:
            args.candidate.parent.mkdir(parents=True, exist_ok=True); args.candidate.write_text(json.dumps(candidate, indent=2) + "\n")
        if args.promote: raise ValueError("promotion is disabled until the reviewed canonical team/matchup normalizer is complete")
        print(json.dumps(candidate, indent=2))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"CANDIDATE BLOCKED: {exc}", file=sys.stderr); return 1
    return 0

if __name__ == "__main__": raise SystemExit(main())

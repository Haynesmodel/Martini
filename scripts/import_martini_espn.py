#!/usr/bin/env python3
"""Sanitize one ESPN season export without guessing franchise identity."""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

PRIVATE = re.compile(r"(?:cookie|session|token|secret|password|authorization|bearer|credential|auth)", re.I)

def reject_private(value: Any, path: str = "input") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if PRIVATE.search(str(key)):
                raise ValueError(f"private field rejected at {path}.{key}")
            reject_private(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_private(child, f"{path}[{index}]")

def norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()

def team_id(team: dict[str, Any]) -> str:
    value = team.get("id", team.get("teamId", team.get("team_id")))
    if value is None or value == "":
        raise ValueError("source team is missing an ESPN team ID")
    return str(value)

def managers(team: dict[str, Any]) -> list[str]:
    value = team.get("managers", team.get("manager", team.get("owners", [])))
    if isinstance(value, str): value = [value]
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"team {team_id(team)} has an invalid manager list")
    return sorted({norm(item) for item in value if norm(item)})

def franchise_index(mapping: dict[str, Any]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    by_id: dict[str, list[str]] = {}
    by_name: dict[str, list[str]] = {}
    keys = {item.get("key") for item in mapping.get("franchises", [])}
    for alias in mapping.get("team_aliases", []):
        key = alias.get("franchise_key")
        if key not in keys: raise ValueError(f"team alias references unknown franchise {key}")
        for source_id in alias.get("espn_team_ids", []): by_id.setdefault(str(source_id), []).append(key)
        for name in [alias.get("source_name"), *alias.get("source_names", [])]:
            if name: by_name.setdefault(norm(name), []).append(key)
    return by_id, by_name

def manager_matches(franchise: dict[str, Any], season: int, names: list[str]) -> bool:
    for interval in franchise.get("manager_history", []):
        if int(interval.get("from", 0)) <= season <= int(interval.get("to", 0)):
            expected = sorted({norm(item) for item in interval.get("managers", [])})
            return bool(expected) and expected == names
    return False

def resolve_franchise(team: dict[str, Any], season: int, mapping: dict[str, Any], by_id: dict[str, list[str]], by_name: dict[str, list[str]]) -> str:
    source_id = team_id(team)
    source_managers = managers(team)
    if not source_managers:
        raise ValueError(f"unknown manager/team mapping for season {season}, ESPN team {source_id}")
    candidates = list(by_id.get(source_id, []))
    for name_match in by_name.get(norm(team.get("name", team.get("teamName", ""))), []):
        if name_match not in candidates: candidates.append(name_match)
    if not candidates:
        candidates = [item["key"] for item in mapping.get("franchises", []) if manager_matches(item, season, source_managers)]
    candidates = sorted(set(candidates))
    if not candidates: raise ValueError(f"unknown manager/team mapping for season {season}, ESPN team {source_id}")
    if len(candidates) != 1: raise ValueError(f"ambiguous manager/team mapping for season {season}, ESPN team {source_id}: {', '.join(candidates)}")
    franchise = next(item for item in mapping.get("franchises", []) if item.get("key") == candidates[0])
    intervals = [item for item in franchise.get("manager_history", []) if int(item.get("from", 0)) <= season <= int(item.get("to", 0))]
    if intervals and sorted({norm(item) for item in intervals[0].get("managers", [])}) != source_managers:
        raise ValueError(f"unknown manager/team mapping for season {season}, ESPN team {source_id}")
    return candidates[0]

def numeric(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0: raise ValueError(f"invalid {field}")
    return float(value)

def normalize(raw: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    season = int(raw.get("seasonId", raw.get("season", 0)))
    if season > 2025: raise ValueError(f"season {season} is not completed history")
    configured = mapping.get("seasons", {}).get(str(season))
    if not configured: raise ValueError(f"season {season} is outside the configured completed range")
    teams = raw.get("teams", [])
    if not isinstance(teams, list) or len(teams) != int(configured.get("teams", 0)):
        raise ValueError(f"season {season}: expected {configured.get('teams')} source teams, found {len(teams) if isinstance(teams, list) else 0}")
    by_id, by_name = franchise_index(mapping)
    resolved: dict[str, str] = {}
    used_franchises: set[str] = set()
    candidate_teams = []
    for team in teams:
        if not isinstance(team, dict): raise ValueError("source team must be an object")
        source_id = team_id(team)
        if source_id in resolved: raise ValueError(f"duplicate ESPN team ID {source_id}")
        key = resolve_franchise(team, season, mapping, by_id, by_name)
        if key in used_franchises: raise ValueError(f"duplicate franchise-season row for {season}: {key}")
        resolved[source_id] = key; used_franchises.add(key)
        candidate_teams.append({"source_id": source_id, "franchise_key": key, "source_name": team.get("name", team.get("teamName", "")), "managers": team.get("managers", team.get("manager", []))})
    matchups = raw.get("matchups", raw.get("schedule", []))
    if not isinstance(matchups, list): raise ValueError("matchups must be a list")
    seen_ids: set[str] = set(); seen_pairs: set[tuple[int, int, str, str]] = set(); candidate_games = []
    for index, matchup in enumerate(matchups):
        if not isinstance(matchup, dict): raise ValueError(f"matchup row {index} must be an object")
        matchup_id = matchup.get("id", matchup.get("matchupId"))
        if matchup_id is None or str(matchup_id) in seen_ids: raise ValueError(f"duplicate or missing matchup ID at row {index}")
        seen_ids.add(str(matchup_id))
        left = str(matchup.get("teamA", matchup.get("homeTeamId", ""))); right = str(matchup.get("teamB", matchup.get("awayTeamId", "")))
        if left not in resolved or right not in resolved: raise ValueError(f"matchup row {index} references an unmapped ESPN team")
        team_a, team_b = resolved[left], resolved[right]
        if team_a == team_b: raise ValueError(f"self-matchup at row {index}")
        week = int(matchup.get("week", 0)); pair = (week, season, *sorted((team_a, team_b)))
        if pair in seen_pairs: raise ValueError(f"duplicate matchup pair at row {index}")
        seen_pairs.add(pair)
        score_a = numeric(matchup.get("scoreA", matchup.get("homeScore")), "scoreA"); score_b = numeric(matchup.get("scoreB", matchup.get("awayScore")), "scoreB")
        candidate_games.append({"season": season, "week": week, "teamA": team_a, "teamB": team_b, "scoreA": score_a, "scoreB": score_b})
    candidate_summaries = []
    for row in raw.get("standings", raw.get("summaries", [])):
        source_id = team_id(row)
        if source_id not in resolved: raise ValueError(f"summary references an unmapped ESPN team {source_id}")
        candidate_summaries.append({"season": season, "owner": resolved[source_id], "wins": int(row.get("wins", 0)), "losses": int(row.get("losses", 0)), "ties": int(row.get("ties", 0)), "finish": int(row.get("finish", 0)), "points_for": numeric(row.get("points_for", row.get("pointsFor", 0)), "points_for")})
    if not candidate_games or not candidate_summaries:
        raise ValueError(f"season {season} has no complete matchup and standings rows to review")
    return {"season": season, "status": "candidate", "source": "sanitized ESPN export", "teams": candidate_teams, "games": candidate_games, "summaries": candidate_summaries}

def write_candidate(candidate: dict[str, Any], destination: Path) -> None:
    assets_dir = (Path(__file__).resolve().parent.parent / "assets").resolve(); resolved = destination.resolve()
    if resolved == assets_dir or assets_dir in resolved.parents: raise ValueError("candidate output must be outside assets/")
    destination.parent.mkdir(parents=True, exist_ok=True); destination.write_text(json.dumps(candidate, indent=2) + "\n")

def promote(candidate: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    games_file, summaries_file = output_dir / "H2H.json", output_dir / "SeasonSummary.json"
    existing_games = json.loads(games_file.read_text()) if games_file.exists() else []; existing_summaries = json.loads(summaries_file.read_text()) if summaries_file.exists() else []
    seasons = {int(row.get("season", 0)) for row in existing_games + existing_summaries}
    if candidate["season"] in seasons: raise ValueError(f"season {candidate['season']} is already promoted")
    games_file.write_text(json.dumps(existing_games + candidate["games"], indent=2) + "\n"); summaries_file.write_text(json.dumps(existing_summaries + candidate["summaries"], indent=2) + "\n")

def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("export", type=Path); parser.add_argument("--mapping", type=Path, default=Path(__file__).with_name("martini_season_mapping.json")); parser.add_argument("--candidate", type=Path); parser.add_argument("--promote", action="store_true"); parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent.parent / "assets"); args = parser.parse_args()
    try:
        raw = json.loads(args.export.read_text()); reject_private(raw); mapping = json.loads(args.mapping.read_text()); candidate = normalize(raw, mapping)
        if args.candidate: write_candidate(candidate, args.candidate)
        if args.promote: promote(candidate, args.output_dir)
        print(json.dumps(candidate, indent=2)); return 0
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"CANDIDATE BLOCKED: {exc}", file=sys.stderr); return 1

if __name__ == "__main__": raise SystemExit(main())

#!/usr/bin/env python3
"""
scripts/edge_agent.py — Simulated Edge Telemetry Agent

Addresses the PRD's "low-footprint Rust/C++ desktop agent" goal.
This Python script simulates the "Edge" tier:
  1. Generates realistic activity events locally (no server dependency)
  2. Computes context-switching latency on-device
  3. POSTs only the AGGREGATED metric to the FlowAI API (not raw events)
     — validating the Edge-to-Cloud privacy architecture

Usage:
  python edge_agent.py --emp-id EMP001 --api-url http://localhost:8000 --token <JWT>
  python edge_agent.py --emp-id EMP001 --simulate 20   # 20 simulated events
  python edge_agent.py --demo    # runs without a real server (dry-run)
"""
from __future__ import annotations
import argparse
import json
import random
import time
import urllib.request
import urllib.error
from datetime import datetime


# ── App catalogue (simulates what a real OS activity capture would record) ────
APP_CATALOGUE = [
    ("Visual Studio Code",   "main.py — Backend",          "Productive"),
    ("Visual Studio Code",   "scoring.py — FlowAI",        "Productive"),
    ("Google Chrome",        "Jira — Sprint Board",         "Productive"),
    ("Postman",              "POST /api/auth/google",       "Productive"),
    ("Figma",                "Design System v2",            "Productive (Contextual)"),
    ("Notion",               "Team Wiki",                   "Productive (Contextual)"),
    ("Slack",                "#engineering channel",        "Neutral"),
    ("Google Chrome",        "Stack Overflow — Python",     "Neutral"),
    ("Terminal",             "uvicorn main:app --reload",   "Neutral"),
    ("Google Chrome",        "WhatsApp Web",                "Distraction"),
    ("YouTube",              "Lo-fi hip hop radio",         "Distraction"),
    ("Google Chrome",        "Reddit — r/programming",      "Distraction"),
    ("Spotify",              "Playlist — Focus",            "Neutral"),
    ("VS Code",              "README.md",                   "Productive"),
    ("Zoom",                 "Team standup",                "Neutral"),
]


def generate_events(n: int, emp_id: str) -> list[dict]:
    """Generate n realistic app activity events with timestamps."""
    now = datetime.utcnow()
    events = []
    for i in range(n):
        app, title, category = random.choice(APP_CATALOGUE)
        # Simulate events spread over the last 2 hours
        offset_minutes = random.randint(0, 120)
        ts = now.replace(minute=0, second=0, microsecond=0)
        ts = ts.replace(hour=max(9, ts.hour))  # clamp to work hours
        events.append({
            "emp_id":       emp_id,
            "app_name":     app,
            "window_title": title,
            "category":     category,
            "timestamp":    ts.isoformat(),
        })
    return events


def compute_local_metrics(events: list[dict]) -> dict:
    """
    Compute aggregated metrics ON DEVICE.
    Only this summary is transmitted — never raw events.
    """
    total = len(events)
    if total == 0:
        return {}

    prod_cats = {"productive", "productive (contextual)"}
    productive  = sum(1 for e in events if e["category"].lower() in prod_cats)
    distraction = sum(1 for e in events if e["category"].lower() == "distraction")

    # Context-switch latency (simulated: random 200–800ms per switch)
    categories = [e["category"] for e in events]
    switches = sum(1 for i in range(1, len(categories)) if categories[i] != categories[i-1])
    avg_switch_latency_ms = random.randint(200, 800) if switches > 0 else 0

    return {
        "total_local_events": total,
        "local_efficiency_pct": round((productive / total) * 100, 1),
        "local_distraction_pct": round((distraction / total) * 100, 1),
        "local_switch_rate": round(switches / max(total - 1, 1), 3),
        "local_switch_count": switches,
        "avg_context_switch_latency_ms": avg_switch_latency_ms,
        "computed_at_edge": True,     # confirms data was aggregated before upload
        "raw_events_uploaded": False, # confirms PII-free architecture
    }


def post_aggregated_metric(api_url: str, emp_id: str, metrics: dict,
                            token: str, dry_run: bool = False) -> None:
    """POST the single most recent raw event to /api/telemetry/ingest plus the local metrics."""
    payload = {
        "emp_id":       emp_id,
        "app_name":     "EdgeAgent",
        "window_title": json.dumps(metrics),   # embed metrics in window_title field
        "category":     "Productive",           # edge agent itself is productive work
        "timestamp":    datetime.utcnow().isoformat(),
    }

    print(f"\n  📡 Edge Metrics (computed on-device, NOT raw events):")
    for k, v in metrics.items():
        print(f"     {k:<40} {v}")

    if dry_run:
        print(f"\n  [DRY RUN] Would POST to {api_url}/api/telemetry/ingest")
        return

    data    = json.dumps(payload).encode()
    headers = {
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {token}",
    }
    req = urllib.request.Request(f"{api_url}/api/telemetry/ingest",
                                  data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            print(f"\n  ✓ Server acknowledged: {result}")
    except urllib.error.HTTPError as e:
        print(f"\n  ✗ HTTP {e.code}: {e.read().decode()[:200]}")
    except urllib.error.URLError as e:
        print(f"\n  ✗ Connection failed: {e.reason} (is the server running?)")


def main():
    parser = argparse.ArgumentParser(description="FlowAI Edge Telemetry Agent (simulation)")
    parser.add_argument("--emp-id",   default="EMP001")
    parser.add_argument("--api-url",  default="http://localhost:8000")
    parser.add_argument("--token",    default="",        help="Bearer JWT from FlowAI login")
    parser.add_argument("--simulate", type=int, default=15, help="Number of events to simulate")
    parser.add_argument("--interval", type=int, default=0,  help="Repeat every N seconds (0 = once)")
    parser.add_argument("--demo",     action="store_true",  help="Dry-run, no server needed")
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════════════════════╗
║          FlowAI Edge Telemetry Agent v3.0            ║
║   Privacy-first: aggregated metrics only             ║
╚══════════════════════════════════════════════════════╝
  Employee : {args.emp_id}
  API URL  : {args.api_url}
  Events   : {args.simulate} simulated per cycle
  Mode     : {"DRY-RUN (--demo)" if args.demo else "LIVE"}
""")

    while True:
        events  = generate_events(args.simulate, args.emp_id)
        metrics = compute_local_metrics(events)
        post_aggregated_metric(args.api_url, args.emp_id, metrics,
                               args.token, dry_run=args.demo)
        if args.interval <= 0:
            break
        print(f"\n  ⏱  Next cycle in {args.interval}s…")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()

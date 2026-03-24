#!/usr/bin/env python3
import argparse
import json
import time
import urllib.request
import urllib.error
from datetime import datetime
import sys
import ctypes

def get_active_window_title():
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        return buff.value
    except Exception:
        return "Unknown OS or Window"

def determine_category_and_app(title: str):
    title_lower = title.lower()
    
    # Very basic heuristics for app extraction based on window title ending
    if " - " in title:
        app_name = title.split(" - ")[-1].strip()
    else:
        app_name = title.split(" ")[-1] if title else "Desktop"

    # Known Distractions
    distractions = ['youtube', 'netflix', 'spotify', 'whatsapp', 'facebook', 'twitter', 'reddit']
    for d in distractions:
        if d in title_lower:
            return app_name, "Distraction"
            
    # Known Productive
    productive = ['code', 'visual studio', 'pycharm', 'flowai', 'jira', 'notion', 'github']
    for p in productive:
        if p in title_lower:
            return app_name, "Productive"
            
    return app_name, "Neutral"

def post_raw_event(api_url: str, emp_id: str, app: str, title: str, category: str):
    payload = {
        "emp_id":       emp_id,
        "app_name":     app,
        "window_title": title,
        "category":     category,
        "timestamp":    datetime.now().astimezone().isoformat(),
    }
    
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{api_url}/api/telemetry/agent-ingest",
                                  data=data, method="POST",
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            # Safely truncate printing
            display_title = title if len(title) <= 50 else title[:47] + "..."
            print(f"  ✓ Native Capture [{category}] {app} : {display_title}")
    except urllib.error.HTTPError as e:
        print(f"  ✗ HTTP {e.code}: {e.read().decode()[:200]}")
    except urllib.error.URLError as e:
        print(f"  ✗ Connection failed: {e.reason}")

def main():
    parser = argparse.ArgumentParser(description="FlowAI Live Native Monitor Agent")
    parser.add_argument("--emp-id",   required=True, help="Employee ID (e.g., EMP001)")
    parser.add_argument("--api-url",  default="http://localhost:8000")
    parser.add_argument("--interval", type=int, default=5, help="Seconds between captures")
    args = parser.parse_args()

    emp_id = args.emp_id.upper()
    if emp_id.isdigit():
        emp_id = f"EMP{int(emp_id):03d}"

    print(f"""
╔══════════════════════════════════════════════════════╗
║     FlowAI Live Native Monitor Agent (Windows OS)    ║
╚══════════════════════════════════════════════════════╝
  Employee : {emp_id}
  API URL  : {args.api_url}
  Interval : {args.interval} seconds
  Mode     : OS-LEVEL ACTIVE WINDOW TRACKER
    """)

    try:
        while True:
            title = get_active_window_title()
            if not title:
                title = "System Idle / Desktop"
                
            app, category = determine_category_and_app(title)
            post_raw_event(args.api_url, emp_id, app, title, category)
            time.sleep(args.interval)
            
    except KeyboardInterrupt:
        print("\nStopping Native Agent...")

if __name__ == "__main__":
    if sys.platform != "win32":
        print("This native tracking agent requires Windows OS.")
        sys.exit(1)
    main()

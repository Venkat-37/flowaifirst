"""
FlowAI Desktop Monitor Agent
Monitors active window usage on Windows and sends real telemetry
to the FlowAI backend. Run this alongside the backend.

Usage:
    python monitor_agent.py [--emp-id EMP203] [--interval 10]
"""
import time
import json
import argparse
import ctypes
from ctypes import wintypes
from datetime import datetime

try:
    import requests
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests

# ── Windows API for active window ────────────────────────────────────────────
user32 = ctypes.windll.user32

def get_active_window_info():
    """Get the currently focused window's title and process name."""
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None, None

    # Window title
    length = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buf, length + 1)
    title = buf.value

    # Process name
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    app_name = _get_process_name(pid.value)

    return app_name, title

def _get_process_name(pid):
    """Get process name from PID using Windows API."""
    try:
        PROCESS_QUERY_INFORMATION = 0x0400
        PROCESS_VM_READ = 0x0010
        kernel32 = ctypes.windll.kernel32
        psapi = ctypes.windll.psapi

        h_process = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
        if not h_process:
            return "Unknown"

        buf = ctypes.create_unicode_buffer(260)
        psapi.GetModuleBaseNameW(h_process, None, buf, 260)
        kernel32.CloseHandle(h_process)
        name = buf.value
        return name if name else "Unknown"
    except Exception:
        return "Unknown"


# ── App categorisation ───────────────────────────────────────────────────────
PRODUCTIVE_APPS = {
    'code.exe': 'Productive', 'Code.exe': 'Productive',
    'devenv.exe': 'Productive', 'pycharm64.exe': 'Productive',
    'idea64.exe': 'Productive', 'webstorm64.exe': 'Productive',
    'sublime_text.exe': 'Productive', 'notepad++.exe': 'Productive',
    'WindowsTerminal.exe': 'Productive', 'cmd.exe': 'Productive',
    'powershell.exe': 'Productive', 'pwsh.exe': 'Productive',
    'mintty.exe': 'Productive', 'ConEmu64.exe': 'Productive',
    'node.exe': 'Productive', 'python.exe': 'Productive',
    'Postman.exe': 'Productive', 'Insomnia.exe': 'Productive',
    'GitHubDesktop.exe': 'Productive',
    'WINWORD.EXE': 'Productive', 'EXCEL.EXE': 'Productive',
    'POWERPNT.EXE': 'Productive', 'ONENOTE.EXE': 'Productive',
    'Notion.exe': 'Productive', 'Obsidian.exe': 'Productive',
    'figma.exe': 'Productive', 'Figma.exe': 'Productive',
}

DISTRACTION_APPS = {
    'WhatsApp.exe': 'Distraction', 'Telegram.exe': 'Distraction',
    'Discord.exe': 'Distraction', 'Spotify.exe': 'Distraction',
    'vlc.exe': 'Distraction', 'Steam.exe': 'Distraction',
    'EpicGamesLauncher.exe': 'Distraction',
}

CONTEXTUAL_KEYWORDS = {
    'Stack Overflow': 'Productive (Contextual)',
    'GitHub': 'Productive (Contextual)',
    'stackoverflow': 'Productive (Contextual)',
    'github.com': 'Productive (Contextual)',
    'docs.python': 'Productive (Contextual)',
    'MDN Web Docs': 'Productive (Contextual)',
    'npm': 'Productive (Contextual)',
    'documentation': 'Productive (Contextual)',
    'API reference': 'Productive (Contextual)',
    'tutorial': 'Productive (Contextual)',
    'MongoDB': 'Productive (Contextual)',
    'React': 'Productive (Contextual)',
    'FastAPI': 'Productive (Contextual)',
    'localhost': 'Productive (Contextual)',
    'ChatGPT': 'Productive (Contextual)',
    'Claude': 'Productive (Contextual)',
    'Gemini': 'Productive (Contextual)',
}

DISTRACTION_KEYWORDS = {
    'YouTube': 'Distraction', 'Netflix': 'Distraction',
    'Instagram': 'Distraction', 'Facebook': 'Distraction',
    'Twitter': 'Distraction', 'Reddit': 'Distraction',
    'TikTok': 'Distraction', 'Twitch': 'Distraction',
    'Amazon Shopping': 'Distraction', 'Flipkart': 'Distraction',
    'WhatsApp Web': 'Distraction',
}


def categorise(app_name: str, window_title: str) -> str:
    """Categorise app usage as Productive, Neutral, or Distraction."""
    if not app_name:
        return 'Neutral'

    # Check app-level first
    if app_name in PRODUCTIVE_APPS:
        return PRODUCTIVE_APPS[app_name]
    if app_name in DISTRACTION_APPS:
        return DISTRACTION_APPS[app_name]

    # For browsers, check window title keywords
    browser_names = {'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
                     'opera.exe', 'Arc.exe', 'vivaldi.exe',
                     'Chrome', 'Edge', 'Firefox', 'Brave'}
    is_browser = any(b.lower() in app_name.lower() for b in browser_names)

    if is_browser and window_title:
        title_lower = window_title.lower()
        # Check distraction keywords first
        for kw, cat in DISTRACTION_KEYWORDS.items():
            if kw.lower() in title_lower:
                return cat
        # Check productive keywords
        for kw, cat in CONTEXTUAL_KEYWORDS.items():
            if kw.lower() in title_lower:
                return cat
        return 'Neutral'

    # Communication apps — neutral (could be work-related)
    comm_apps = {'Teams.exe', 'Zoom.exe', 'slack.exe', 'Slack.exe',
                 'OUTLOOK.EXE', 'Thunderbird.exe', 'ms-teams.exe'}
    if app_name in comm_apps:
        return 'Neutral'

    return 'Neutral'


def send_telemetry(emp_id: str, app_name: str, window_title: str, category: str, api_url: str, token: str):
    """Send a single telemetry event to FlowAI backend."""
    payload = {
        "emp_id": emp_id,
        "app_name": app_name or "Unknown",
        "window_title": window_title or "",
        "category": category,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        resp = requests.post(f"{api_url}/api/telemetry/agent-ingest", json=payload, headers=headers, timeout=3)
        return resp.status_code == 200
    except Exception as e:
        return False


def main():
    parser = argparse.ArgumentParser(description="FlowAI Desktop Monitor Agent")
    parser.add_argument("--emp-id", default="EMP203", help="Employee ID to track")
    parser.add_argument("--interval", type=int, default=10, help="Polling interval in seconds")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL")
    parser.add_argument("--token", default="", help="JWT token for authentication")
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════════════════════════╗
║  FlowAI Desktop Monitor Agent v1.0                      ║
║  Employee: {args.emp_id:<46}║
║  Interval: {args.interval}s{' ' * 44}║
║  Backend:  {args.api_url:<46}║
╚══════════════════════════════════════════════════════════╝
""")

    last_app = None
    last_title = None
    event_count = 0

    while True:
        try:
            app_name, title = get_active_window_info()

            # Only log if window changed (avoid spamming same window)
            if app_name != last_app or title != last_title:
                category = categorise(app_name, title)
                ok = send_telemetry(args.emp_id, app_name, title, category, args.api_url, args.token)
                event_count += 1

                # Category emoji
                cat_icon = '🟢' if 'Productive' in category else '🔴' if category == 'Distraction' else '⚪'
                status = '✓' if ok else '✗'

                ts = datetime.now().strftime('%H:%M:%S')
                print(f"  {ts}  {cat_icon} [{category:<24}] {status}  {app_name or '?':<20} {(title or '')[:50]}")

                last_app = app_name
                last_title = title

            time.sleep(args.interval)

        except KeyboardInterrupt:
            print(f"\n  Agent stopped. {event_count} events sent.")
            break
        except Exception as e:
            print(f"  ⚠ Error: {e}")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()

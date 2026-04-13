#!/usr/bin/env python3
"""
HAControlPanel Browser Bridge — Test Client

Simulates the Firefox extension by connecting to the GNOME extension's
WebSocket server and streaming random (or cycling) colors.

Usage:
    python3 tools/bridge-test-client.py [--port 7842] [--mode cycle|random|sunset]
                                        [--tabs N] [--active-tab INDEX]

    --tabs N          Simulate N YouTube tabs (default: 1)
    --active-tab I    Which tab is in the foreground, 0-based (default: 0)
                      Use -1 to simulate all tabs being in the background.

Requirements:
    pip install websockets        # or: apt install python3-websockets
"""

import argparse
import asyncio
import json
import random
import sys


# ── Color generators ──────────────────────────────────────────────────────────

def color_random():
    """Fully random RGB."""
    while True:
        yield {'r': random.randint(0, 255), 'g': random.randint(0, 255), 'b': random.randint(0, 255)}


def color_cycle():
    """Smooth HSV rainbow cycle."""
    h = 0.0
    while True:
        r, g, b = hsv_to_rgb(h % 1.0, 0.9, 0.8)
        yield {'r': int(r * 255), 'g': int(g * 255), 'b': int(b * 255)}
        h += 0.005


def color_sunset():
    """Warm sunset palette cycling."""
    palettes = [
        (255, 80, 20),   # deep orange
        (255, 140, 0),   # amber
        (220, 50, 50),   # red
        (180, 30, 80),   # magenta-red
        (100, 20, 120),  # purple
    ]
    step = 0
    while True:
        i = int(step) % len(palettes)
        j = (i + 1) % len(palettes)
        t = step - int(step)
        r1, g1, b1 = palettes[i]
        r2, g2, b2 = palettes[j]
        yield {
            'r': int(r1 + (r2 - r1) * t),
            'g': int(g1 + (g2 - g1) * t),
            'b': int(b1 + (b2 - b1) * t),
        }
        step += 0.02


def hsv_to_rgb(h, s, v):
    if s == 0:
        return v, v, v
    i = int(h * 6)
    f = h * 6 - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    return [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]


TAB_TITLES = [
    'Big Buck Bunny — YouTube',
    'Never Gonna Give You Up — YouTube',
    'Blender Open Movie — YouTube',
    'Lo-fi Hip Hop Radio — YouTube',
    'Aurora Borealis 4K — YouTube',
]


def make_tabs(n: int, active_idx: int) -> list[dict]:
    """Build a list of fake YouTube tab descriptors."""
    return [
        {
            'tabId': 100 + i,
            'title': TAB_TITLES[i % len(TAB_TITLES)],
            'active': (i == active_idx),
        }
        for i in range(n)
    ]


# ── WebSocket client ──────────────────────────────────────────────────────────

async def run(port: int, mode: str, interval: float, n_tabs: int, active_idx: int):
    uri = f'ws://localhost:{port}'
    print(f'Connecting to {uri} …')

    generators = {'random': color_random, 'cycle': color_cycle, 'sunset': color_sunset}
    gen = generators.get(mode, color_cycle)()

    try:
        import websockets
    except ImportError:
        print('Error: websockets not installed. Run:  pip install websockets')
        sys.exit(1)

    tabs = make_tabs(n_tabs, active_idx)
    active_tab_id = tabs[active_idx]['tabId'] if active_idx >= 0 else None

    print(f'Simulating {n_tabs} tab(s):')
    for t in tabs:
        marker = '▶' if t['active'] else ' '
        print(f'  {marker} Tab {t["tabId"]}: {t["title"]}')
    if active_tab_id is None:
        print('  (no active tab — testing background/fallback behaviour)')
    print()

    try:
        async with websockets.connect(uri) as ws:
            print(f'Connected! Streaming {mode} colors at {1/interval:.0f}fps  (Ctrl+C to stop)\n')

            # Send initial status with all tabs
            await ws.send(json.dumps({'type': 'status', 'tabs': tabs}))

            selected_tab = None  # filled in by config message from GNOME

            async def recv_loop():
                nonlocal selected_tab
                async for msg in ws:
                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        continue
                    if data.get('type') == 'config':
                        selected_tab = data.get('selectedTab')
                        print(f'\n  ← Config from GNOME: selectedTab={selected_tab}')

            recv_task = asyncio.create_task(recv_loop())

            try:
                frame = 0
                while True:
                    color = next(gen)
                    # Send frame from the active tab (or all tabs if no specific active tab)
                    send_tab_id = active_tab_id if active_tab_id is not None else (100 if n_tabs > 0 else 42)
                    await ws.send(json.dumps({
                        'type': 'frame',
                        'tabId': send_tab_id,
                        'color': color,
                    }))
                    hex_color = '#{r:02x}{g:02x}{b:02x}'.format(**color)
                    bar_len = 20
                    r_norm = color['r'] / 255
                    bar = '█' * int(r_norm * bar_len) + '░' * (bar_len - int(r_norm * bar_len))
                    sel_info = f'  sel={selected_tab}' if selected_tab is not None else ''
                    print(f'  → Frame {frame:4d}  {hex_color}  {bar}  tab={send_tab_id}{sel_info}', end='\r')
                    frame += 1
                    await asyncio.sleep(interval)
            finally:
                recv_task.cancel()

    except ConnectionRefusedError:
        print(f'\nConnection refused on port {port}.')
        print('Is the GNOME extension running with Browser Bridge enabled?')
        print('Try:  make test-bridge   (in the repo directory)')
        sys.exit(1)
    except KeyboardInterrupt:
        print('\n\nStopped.')


def main():
    parser = argparse.ArgumentParser(
        description='HAControlPanel Browser Bridge test client',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  # single tab (default)
  python3 tools/bridge-test-client.py --mode sunset

  # three tabs, second one active (index 1)
  python3 tools/bridge-test-client.py --tabs 3 --active-tab 1

  # three tabs, none active (tests smart-mode fallback)
  python3 tools/bridge-test-client.py --tabs 3 --active-tab -1
""",
    )
    parser.add_argument('--port', type=int, default=7842,
                        help='WebSocket port (default: 7842)')
    parser.add_argument('--mode', choices=['cycle', 'random', 'sunset'], default='cycle',
                        help='Color mode (default: cycle)')
    parser.add_argument('--fps', type=float, default=10.0,
                        help='Frames per second (default: 10)')
    parser.add_argument('--tabs', type=int, default=1, metavar='N',
                        help='Number of simulated YouTube tabs (default: 1)')
    parser.add_argument('--active-tab', type=int, default=0, metavar='INDEX',
                        help='0-based index of the foreground tab; -1 = none active (default: 0)')
    args = parser.parse_args()

    if args.tabs < 1:
        parser.error('--tabs must be at least 1')
    if args.active_tab >= args.tabs:
        parser.error(f'--active-tab {args.active_tab} is out of range for --tabs {args.tabs}')

    asyncio.run(run(args.port, args.mode, 1.0 / args.fps, args.tabs, args.active_tab))


if __name__ == '__main__':
    main()

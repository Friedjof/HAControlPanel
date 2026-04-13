#!/usr/bin/env python3
"""
HAControlPanel Browser Bridge — Test Client

Simulates the Firefox extension by connecting to the GNOME extension's
WebSocket server and streaming random (or cycling) colors.

Usage:
    python3 tools/bridge-test-client.py [--port 7842] [--mode cycle|random|sunset]

Requirements:
    pip install websockets        # or: apt install python3-websockets
"""

import argparse
import asyncio
import json
import math
import random
import sys
import time


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


# ── WebSocket client ──────────────────────────────────────────────────────────

async def run(port: int, mode: str, interval: float):
    uri = f'ws://localhost:{port}'
    print(f'Connecting to {uri} …')

    generators = {'random': color_random, 'cycle': color_cycle, 'sunset': color_sunset}
    gen = generators.get(mode, color_cycle)()

    try:
        import websockets
    except ImportError:
        print('Error: websockets not installed. Run:  pip install websockets')
        sys.exit(1)

    FAKE_TAB_ID = 42
    FAKE_TITLE = 'Big Buck Bunny — YouTube'

    try:
        async with websockets.connect(uri) as ws:
            print(f'Connected! Streaming {mode} colors at {1/interval:.0f}fps  (Ctrl+C to stop)\n')

            # Send initial status
            await ws.send(json.dumps({
                'type': 'status',
                'tabs': [{'tabId': FAKE_TAB_ID, 'title': FAKE_TITLE, 'active': True}],
            }))

            frame = 0
            async def recv_loop():
                async for msg in ws:
                    data = json.loads(msg)
                    if data.get('type') == 'config':
                        print(f'  ← Config from GNOME: selectedTab={data.get("selectedTab")}')

            recv_task = asyncio.create_task(recv_loop())

            try:
                while True:
                    color = next(gen)
                    await ws.send(json.dumps({
                        'type': 'frame',
                        'tabId': FAKE_TAB_ID,
                        'color': color,
                    }))
                    hex_color = '#{r:02x}{g:02x}{b:02x}'.format(**color)
                    bar_len = 20
                    r_norm = color['r'] / 255
                    bar = '█' * int(r_norm * bar_len) + '░' * (bar_len - int(r_norm * bar_len))
                    print(f'  → Frame {frame:4d}  {hex_color}  {bar}', end='\r')
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
    parser = argparse.ArgumentParser(description='HAControlPanel Browser Bridge test client')
    parser.add_argument('--port', type=int, default=7842, help='WebSocket port (default: 7842)')
    parser.add_argument('--mode', choices=['cycle', 'random', 'sunset'], default='cycle',
                        help='Color mode (default: cycle)')
    parser.add_argument('--fps', type=float, default=10.0, help='Frames per second (default: 10)')
    args = parser.parse_args()

    asyncio.run(run(args.port, args.mode, 1.0 / args.fps))


if __name__ == '__main__':
    main()

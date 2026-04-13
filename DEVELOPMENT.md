# HAControlPanel — Development Guide

## Prerequisites

| Tool | Purpose |
|---|---|
| GNOME Shell 45–47 | Runtime for the extension |
| `glib-compile-schemas` | Compile GSettings schema (part of `glib2-devel` / `libglib2.0-dev`) |
| `web-ext` | Build and sign the Firefox add-on (`npm install -g web-ext`) |
| Firefox 115+ | Load the companion browser extension for bridge testing |
| Python 3.10+ | Optional bridge test client (`tools/bridge-test-client.py`) |
| `make` | Build automation |

---

## Install the extension locally

```bash
make install
```

This runs `build-css` (regenerates `stylesheet.css` from `styles/`), compiles the
GSettings schema, and copies the extension directory to
`~/.local/share/gnome-shell/extensions/hacontrolpanel@friedjof.github.io`.

---

## Run a nested GNOME Shell session

```bash
make run
```

Starts a nested Wayland compositor in a window and enables the extension inside
it. Shell JavaScript errors are written to `/tmp/hacontrolpanel-shell.log`.

```bash
make log          # tail the shell log
```

---

## Test the browser bridge

```bash
make test-bridge  # starts a nested shell with the bridge pre-configured
make check-bridge # in a second terminal — checks whether port 7842 is open
```

To simulate Firefox without the real extension:

```bash
python3 tools/bridge-test-client.py
```

---

## Build release artifacts

```bash
make pack           # creates dist/hacontrolpanel@friedjof.github.io.shell-extension.zip
make pack-firefox   # creates dist/hacontrolpanel-bridge.firefox-extension.xpi
```

Both targets run `build-css` first, so `stylesheet.css` is always up to date in
the archive.

---

## Editing styles

All CSS lives in component files under `hacontrolpanel@friedjof.github.io/styles/`:

| File | Contents |
|---|---|
| `common.css` | Settings bar items, section labels, separators, chips |
| `panel.css` | Panel indicator, menu container, page switcher |
| `colors.css` | Color picker, screen sync toggle, color wheel, history |
| `sliders.css` | Dimmer slider |
| `actions.css` | Action buttons |
| `sensors.css` | Sensor tile grid, gauges, sparklines |

**Always edit the component files, not `stylesheet.css` directly.**
After editing, regenerate:

```bash
make build-css
make install      # picks up build-css automatically
```

`stylesheet.css` is committed so the extension works for users who install
manually (without running `make`).

---

## Versioning

The version is stored as a single source of truth in the `VERSION` file at the
repository root.

- **`VERSION`** — used by `make` and the CI workflows; format: `MAJOR.MINOR.PATCH`
- **`firefox-extension/manifest.json`** — `"version"` must match `VERSION`
- **`hacontrolpanel@friedjof.github.io/metadata.json`** — `"version"` must be an
  **integer** (GNOME extensions.gnome.org requirement); increment it manually
  for each release and keep it in sync conceptually with the semantic version.

When bumping a release:
1. Edit `VERSION`
2. Update `firefox-extension/manifest.json` `"version"` to match
3. Increment the integer `"version"` in `metadata.json`
4. Tag the commit: `git tag v$(cat VERSION)`

---

## Project structure

```
.
├── hacontrolpanel@friedjof.github.io/   GNOME Shell extension
│   ├── extension.js                     Entry point; wires up all subsystems
│   ├── prefs.js                         Preferences window entry point
│   ├── stylesheet.css                   Generated — do not edit directly
│   ├── styles/                          CSS source files (edit these)
│   ├── lib/
│   │   ├── ha/                          HA client, WebSocket, service templates
│   │   ├── sync/                        Screen sync controller, color history
│   │   ├── bridge/                      Browser bridge WebSocket server
│   │   └── config/                      Backup, YAML, config adapters/validators
│   ├── ui/                              Panel menu and section widgets
│   └── prefs/                           Preferences pages and shared utilities
├── firefox-extension/                   Companion Firefox WebExtension
├── tools/                               Development helpers (bridge test client)
├── .github/workflows/                   CI: build, release, AMO signing
├── Makefile                             Build automation
├── VERSION                              Single version source of truth
├── ARCHITECTURE.md                      Module graph and data flows
└── DEVELOPMENT.md                       This file
```

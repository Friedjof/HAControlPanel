# RoomPanel

RoomPanel is a GNOME Shell extension that puts a compact Home Assistant control panel into the top bar. The current state of the project is beta.

## Features

- Color picker that sends live Home Assistant service calls
- Slider control with configurable entity, service, attribute, and range
- Configurable action buttons with emoji, optional color, and custom service data
- Preferences UI for connection setup, entity/service lookup, and YAML import/export
- Optional automatic YAML backup without exporting the Home Assistant token

## Requirements

- GNOME Shell 45, 46, or 47
- `gjs`, `glib-compile-schemas`, and standard GNOME extension tooling
- A reachable Home Assistant instance with a long-lived access token

## Installation

Until the extension is published on extensions.gnome.org, install it from the GitHub Releases page.

1. Download `roompanel@friedjof.github.io.shell-extension.zip` from the latest release.
2. Install it with `gnome-extensions install --force roompanel@friedjof.github.io.shell-extension.zip`.
3. Enable it with `gnome-extensions enable roompanel@friedjof.github.io` or the Extensions app.

## Development

The project directory is the unpacked extension source:

```text
roompanel@friedjof.github.io/
```

Useful commands:

```bash
make install
make reinstall
make pack
make run
make log
```

`make run` starts a nested GNOME Shell session and writes shell output to `/tmp/roompanel-shell.log`.
`make pack` creates a release-ready ZIP in `dist/`.

## Notes

- The generated schema cache `roompanel@friedjof.github.io/schemas/gschemas.compiled` should not be committed.
- Local tool configuration in `.claude/` is intentionally ignored.
- YAML backups include panel settings and button configuration, but not the Home Assistant token.

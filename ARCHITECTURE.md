# HAControlPanel — Architecture

HAControlPanel is a GNOME Shell extension that integrates with Home Assistant.
It provides a panel indicator with a color picker, dimmer slider, action buttons,
sensor tiles, and screen-sync — all driven by HA's REST and WebSocket APIs.
A companion Firefox extension bridges YouTube's ambient color to the same sync
pipeline over a local WebSocket server.

---

## Module Dependency Graph

```
extension.js
├── lib/ha/haClient.js            REST + WebSocket wrapper for HA
│   └── lib/ha/haWebSocket.js    Low-level WebSocket state subscription
├── lib/sync/screenSyncController.js  Screen sampling → HA light update loop
│   └── lib/sync/colorHistory.js     Ring buffer of recent sampled colors
├── lib/bridge/browserBridgeServer.js WebSocket server for Firefox bridge
├── lib/config/backup.js          YAML backup read/write helpers
│   └── lib/config/yaml.js        Minimal YAML serialiser
└── ui/panelIndicator.js          St.Button that owns the panel menu
    └── ui/panelMenu.js           Adw-style menu with page switcher
        ├── ui/colorSection.js    Color wheel + history chips
        ├── ui/sliderSection.js   Brightness/dimmer slider
        ├── ui/actionSection.js   Configurable HA action buttons
        └── ui/sensorSection.js   Sensor tile grid with sparklines/gauges

prefs.js  (ExtensionPreferences)
├── prefs/connectionPage.js       HA URL, token, SSL toggle, sync button
├── prefs/buttonsPage.js          Color picker entities, slider, action buttons
├── prefs/screenSyncPage.js       Screen sync + browser bridge settings
├── prefs/sensorsPage.js          Sensor tile configuration
├── prefs/backupPage.js           YAML import/export
└── prefs/haDataStore.js          Shared singleton: caches entities + services
    └── lib/ha/haClient.js

Shared utilities
├── lib/config/configAdapters.js  Parse GSettings JSON into typed config objects
├── lib/config/configValidator.js Validate user-supplied config blobs
├── lib/ha/serviceTemplates.js    Default service templates for entity domains
├── prefs/utils.js                Markup escape, entity search helpers
├── prefs/popovers/entitySearch.js  Entity picker popover
└── prefs/popovers/serviceSearch.js Service picker popover
```

---

## Key Data Flows

### 1. Color picker → HA light

```
User drags color wheel
  → colorSection.js emits 'color-changed'
    → panelMenu.js calls haClient.callService('light.turn_on', {rgb_color})
      → haClient.js sends POST /api/services/light/turn_on
```

### 2. Screen sync loop

```
ScreenSyncController._tick() (every N ms, set in settings)
  → Reads GNOME Shell screenshot (GdkPixbuf or Clutter.OffscreenEffect)
    → Extracts dominant / average / vibrant … color
      → Applies interpolation (EMA / Catmull-Rom / Spring / …)
        → haClient.callService('light.turn_on', {rgb_color})
          if condition gate passes
```

### 3. Firefox browser bridge

```
Firefox extension sends WebSocket message {type: 'color', r, g, b}
  → browserBridgeServer.js fires onColor(r, g, b)
    → screenSyncController.pushExternalColor(r, g, b)
      → Bypasses sampling; uses browser color directly
        → haClient.callService('light.turn_on', {rgb_color})
```

### 4. Preferences → extension

Settings live in GSettings (`org.gnome.shell.extensions.hacontrolpanel`).
`extension.js` connects `settings.connect('changed', …)` to react to:
- `ha-url` / `ha-token` / `ha-verify-ssl` — re-applies credentials
- `browser-bridge-enabled` — starts / stops the bridge server
- Any key change — triggers auto-YAML backup if enabled

---

## Key Abstractions

| Class / Object | File | Responsibility |
|---|---|---|
| `HaClient` | `lib/ha/haClient.js` | All communication with HA (REST + live WebSocket) |
| `HaWebSocket` | `lib/ha/haWebSocket.js` | Low-level subscribe/unsubscribe for state-changed events |
| `ScreenSyncController` | `lib/sync/screenSyncController.js` | Sampling loop, interpolation, condition gate, HA output |
| `ColorHistory` | `lib/sync/colorHistory.js` | Fixed-size ring buffer of recent colors for history chips |
| `BrowserBridgeServer` | `lib/bridge/browserBridgeServer.js` | WebSocket server; forwards color + tab state to the sync controller |
| `haDataStore` | `prefs/haDataStore.js` | Singleton that caches entities and services; emits `changed` |
| `HaControlPanelIndicator` | `ui/panelIndicator.js` | GNOME panel button; creates and owns the menu |
| `HaControlPanelMenu` | `ui/panelMenu.js` | Multi-page menu; coordinates all UI sections |
| `ScreenSyncPage` | `prefs/screenSyncPage.js` | All screen-sync + browser-bridge preference rows |
| `ButtonsPage` | `prefs/buttonsPage.js` | Color picker, slider, and action button preference rows |

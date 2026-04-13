import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { ActionButton } from './actionButton.js';
import { ColorSection } from './colorSection.js';
import { SliderSection } from './sliderSection.js';
import { SensorSection } from './sensorSection.js';
import { readButtonsConfig, readSliderConfigs } from '../lib/config/configAdapters.js';

/**
 * The dropdown menu content.
 * Orchestrates ColorSection, SliderSection, action buttons, and live-sync.
 */
export class HaControlPanelMenu extends PopupMenu.PopupMenuSection {
    constructor(settings, haClient, openPrefs) {
        super();

        this._settings = settings;
        this._haClient = haClient;
        this._openPrefs = openPrefs ?? null;
        this._currentPage = 'actions';
        this._liveStateHandler = null;

        // Echo-suppression: after a user command we ignore HA state echoes
        // for this many ms so the UI does not jump back to the stale value.
        this._suppressLiveUntil = 0;

        this._colorSection = new ColorSection(
            settings, haClient,
            () => this._suppressLiveUntil,
            () => this._markUserCommand()
        );

        this._sliderSection = new SliderSection(
            settings, haClient,
            () => this._suppressLiveUntil,
            () => this._markUserCommand()
        );

        this._sensorSection = new SensorSection(settings, haClient);

        this._buildUI();
        this._connectSettings();
        this._initLiveSync();
    }

    // ── UI construction ──────────────────────────────────────────────────────

    _buildUI() {
        // ── Settings row ──────────────────────────────────────────────
        this._settingsItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this._settingsItem.add_style_class_name('hacontrolpanel-settings-item');
        this.addMenuItem(this._settingsItem);

        const headerRow = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'hacontrolpanel-header-row',
        });
        this._settingsItem.add_child(headerRow);

        const settingsBtn = new St.Button({
            style_class: 'hacontrolpanel-settings-btn',
            can_focus: true,
            reactive: true,
        });
        settingsBtn.connect('clicked', () => this._openPrefs?.());

        const settingsBtnInner = new St.BoxLayout({
            vertical: false,
            style_class: 'hacontrolpanel-settings-btn-inner',
        });
        settingsBtn.set_child(settingsBtnInner);

        settingsBtnInner.add_child(new St.Icon({
            icon_name: 'preferences-system-symbolic',
            style_class: 'hacontrolpanel-settings-icon',
        }));

        this._domainLabel = new St.Label({
            style_class: 'hacontrolpanel-settings-domain',
            y_align: Clutter.ActorAlign.CENTER,
        });
        settingsBtnInner.add_child(this._domainLabel);

        headerRow.add_child(settingsBtn);

        const spacer = new St.Widget({ x_expand: true });
        headerRow.add_child(spacer);

        this._pageSwitcher = new St.BoxLayout({
            vertical: false,
            style_class: 'hacontrolpanel-page-switcher',
            x_align: Clutter.ActorAlign.END,
        });
        headerRow.add_child(this._pageSwitcher);

        this._actionsPageBtn = this._createPageButton(
            'go-previous-symbolic',
            () => this._setPage('actions')
        );
        this._pageSwitcher.add_child(this._actionsPageBtn);

        this._pageLabel = new St.Label({
            text: 'Actions',
            style_class: 'hacontrolpanel-page-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._pageSwitcher.add_child(this._pageLabel);

        this._sensorsPageBtn = this._createPageButton(
            'go-next-symbolic',
            () => this._setPage('sensors')
        );
        this._pageSwitcher.add_child(this._sensorsPageBtn);

        this._updateDomainLabel();

        // ── Color + Slider sections ───────────────────────────────────
        this.addMenuItem(this._colorSection.getMenuItem());
        this.addMenuItem(this._sliderSection.getMenuItem());
        this.addMenuItem(this._sliderSection.getSeparator());

        // ── Sensor section ────────────────────────────────────────────
        this.addMenuItem(this._sensorSection.getSeparator());
        this.addMenuItem(this._sensorSection.getMenuItem());

        // ── Action Buttons ────────────────────────────────────────────
        this._buttonsItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this.addMenuItem(this._buttonsItem);

        this._buttonsBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        this._buttonsBox.add_style_class_name('hacontrolpanel-menu');
        this._buttonsBox.add_style_class_name('hacontrolpanel-buttons-box');
        this._buttonsItem.add_child(this._buttonsBox);

        this._rebuildButtons();
        this._setPage('actions');
    }

    _createPageButton(iconName, onClick) {
        const icon = new St.Icon({
            icon_name: iconName,
            style_class: 'hacontrolpanel-page-button-icon',
        });

        const button = new St.Button({
            style_class: 'hacontrolpanel-page-button',
            can_focus: true,
            reactive: true,
            child: icon,
        });
        button.connect('clicked', onClick);
        return button;
    }

    _connectSettings() {
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'buttons-config' || key === 'button-count')
                this._rebuildButtons();

            if (key === 'ha-url')
                this._updateDomainLabel();

            if ([
                'color-entities',
                'slider-entities-config',
                'sensor-widgets-config',
            ].includes(key)) {
                this._applyPageVisibility();
            }
        });
    }

    // ── Live sync ────────────────────────────────────────────────────────────

    _initLiveSync() {
        this._liveStateHandler = data => this._onLiveStateChanged(data);
        this._haClient.connectLive(this._liveStateHandler);
        void this._colorSection.hydrateFromHA();
        void this._sliderSection.hydrateFromHA();
        void this._sensorSection.hydrateFromHA();
    }

    _onLiveStateChanged({ entity_id, new_state }) {
        if (!new_state) return;
        this._colorSection.onStateChanged(entity_id, new_state);
        this._sliderSection.onStateChanged(entity_id, new_state);
        this._sensorSection.onStateChanged(entity_id, new_state);
    }

    /** Called before every user-initiated HA command to suppress echo-updates. */
    _markUserCommand() {
        this._suppressLiveUntil = Date.now() + 2000;
        this._colorSection.cancelPendingSync();
        this._sliderSection.cancelPendingSync();
    }

    // ── Page switching ───────────────────────────────────────────────────────

    _setPage(page) {
        this._currentPage = page === 'sensors' ? 'sensors' : 'actions';
        this._updatePageSwitcher();
        this._applyPageVisibility();
    }

    _updatePageSwitcher() {
        const isActions = this._currentPage === 'actions';
        this._pageLabel.text = isActions ? 'Actions' : 'Sensors';

        if (isActions) {
            this._actionsPageBtn.add_style_class_name('hacontrolpanel-page-button-active');
            this._sensorsPageBtn.remove_style_class_name('hacontrolpanel-page-button-active');
        } else {
            this._sensorsPageBtn.add_style_class_name('hacontrolpanel-page-button-active');
            this._actionsPageBtn.remove_style_class_name('hacontrolpanel-page-button-active');
        }
    }

    _applyPageVisibility() {
        const showActions = this._currentPage === 'actions';
        const showSensors = this._currentPage === 'sensors';

        const hasColor = this._settings.get_strv('color-entities').some(Boolean);
        const hasSlider = readSliderConfigs(this._settings).some(cfg => cfg.entity_id);

        this._colorSection.getMenuItem().visible = showActions && hasColor;
        this._sliderSection.getMenuItem().visible = showActions && hasSlider;
        this._sliderSection.getSeparator().visible = showActions && hasSlider;
        this._buttonsItem.visible = showActions;

        this._sensorSection.getMenuItem().visible = showSensors;
        this._sensorSection.getSeparator().visible = showSensors;
    }

    // ── Action buttons ───────────────────────────────────────────────────────

    _rebuildButtons() {
        const children = this._buttonsBox.get_children();
        for (const child of children)
            this._buttonsBox.remove_child(child);

        const configs = readButtonsConfig(this._settings);

        const count = this._settings.get_int('button-count');
        const slice = configs.slice(0, count);

        if (slice.length === 0) {
            this._buttonsBox.add_child(new St.Label({
                text: 'No buttons configured',
                style: 'color: rgba(255,255,255,0.4); padding: 4px;',
            }));
            return;
        }

        for (let i = 0; i < slice.length; i += 2) {
            const row = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                style_class: 'hacontrolpanel-button-row',
            });

            for (const config of slice.slice(i, i + 2))
                row.add_child(new ActionButton(config, this._haClient));

            this._buttonsBox.add_child(row);
        }
    }

    // ── Domain label ─────────────────────────────────────────────────────────

    _updateDomainLabel() {
        const url = this._settings.get_string('ha-url').trim();
        const m = url.match(/^https?:\/\/([^/:?#\s]+)/i);
        this._domainLabel.text = m ? m[1] : '—';
    }

    // ── Cleanup ──────────────────────────────────────────────────────────────

    destroy() {
        if (this._liveStateHandler) {
            this._haClient.disconnectLive(this._liveStateHandler);
            this._liveStateHandler = null;
        }

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._colorSection.destroy();
        this._sliderSection.destroy();
        this._sensorSection.destroy();

        super.destroy();
    }
}

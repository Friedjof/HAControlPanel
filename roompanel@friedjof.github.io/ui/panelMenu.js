import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { ActionButton } from './actionButton.js';
import { ColorSection } from './colorSection.js';
import { SliderSection } from './sliderSection.js';

/**
 * The dropdown menu content.
 * Orchestrates ColorSection, SliderSection, action buttons, and live-sync.
 */
export class RoomPanelMenu extends PopupMenu.PopupMenuSection {
    constructor(settings, haClient, openPrefs) {
        super();

        this._settings = settings;
        this._haClient = haClient;
        this._openPrefs = openPrefs ?? null;

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

        this._buildUI();
        this._connectSettings();
        this._initLiveSync();
    }

    // ── UI construction ──────────────────────────────────────────────────────

    _buildUI() {
        // ── Settings row ──────────────────────────────────────────────
        this._settingsItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this._settingsItem.add_style_class_name('roompanel-settings-item');
        this.addMenuItem(this._settingsItem);

        const settingsBtn = new St.Button({
            style_class: 'roompanel-settings-btn',
            can_focus: true,
            reactive: true,
        });
        settingsBtn.connect('clicked', () => this._openPrefs?.());

        const settingsBtnInner = new St.BoxLayout({
            vertical: false,
            style_class: 'roompanel-settings-btn-inner',
        });
        settingsBtn.set_child(settingsBtnInner);

        settingsBtnInner.add_child(new St.Icon({
            icon_name: 'preferences-system-symbolic',
            style_class: 'roompanel-settings-icon',
        }));

        this._domainLabel = new St.Label({
            style_class: 'roompanel-settings-domain',
            y_align: Clutter.ActorAlign.CENTER,
        });
        settingsBtnInner.add_child(this._domainLabel);

        this._settingsItem.add_child(settingsBtn);
        this._updateDomainLabel();

        // ── Color + Slider sections ───────────────────────────────────
        this.addMenuItem(this._colorSection.getMenuItem());
        this.addMenuItem(this._sliderSection.getMenuItem());
        this.addMenuItem(this._sliderSection.getSeparator());

        // ── Action Buttons ────────────────────────────────────────────
        this._buttonsItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        this.addMenuItem(this._buttonsItem);

        this._buttonsBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        this._buttonsBox.add_style_class_name('roompanel-menu');
        this._buttonsBox.add_style_class_name('roompanel-buttons-box');
        this._buttonsItem.add_child(this._buttonsBox);

        this._rebuildButtons();
    }

    _connectSettings() {
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'buttons-config' || key === 'button-count')
                this._rebuildButtons();

            if (key === 'ha-url')
                this._updateDomainLabel();
        });
    }

    // ── Live sync ────────────────────────────────────────────────────────────

    _initLiveSync() {
        this._haClient.connectLive(data => this._onLiveStateChanged(data));
        void this._colorSection.hydrateFromHA();
        void this._sliderSection.hydrateFromHA();
    }

    _onLiveStateChanged({ entity_id, new_state }) {
        if (!new_state) return;
        this._colorSection.onStateChanged(entity_id, new_state);
        this._sliderSection.onStateChanged(entity_id, new_state);
    }

    /** Called before every user-initiated HA command to suppress echo-updates. */
    _markUserCommand() {
        this._suppressLiveUntil = Date.now() + 2000;
        this._colorSection.cancelPendingSync();
        this._sliderSection.cancelPendingSync();
    }

    // ── Action buttons ───────────────────────────────────────────────────────

    _rebuildButtons() {
        const children = this._buttonsBox.get_children();
        for (const child of children)
            this._buttonsBox.remove_child(child);

        let configs = [];
        try {
            configs = JSON.parse(this._settings.get_string('buttons-config'));
        } catch {
            configs = [];
        }

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
                style_class: 'roompanel-button-row',
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
        this._haClient.disconnectLive();

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._colorSection.destroy();
        this._sliderSection.destroy();

        super.destroy();
    }
}

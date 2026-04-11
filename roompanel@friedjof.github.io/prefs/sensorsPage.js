import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import { haDataStore } from './haDataStore.js';
import { readSensorWidgets } from '../lib/configAdapters.js';
import { SensorWidgetDialog, SensorWidgetRow } from './dialogs/sensorWidgetEdit.js';

export const SensorsPage = GObject.registerClass(
class SensorsPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: 'Sensors',
            icon_name: 'utilities-system-monitor-symbolic',
            name: 'sensors',
        });

        this._settings = settings;
        this._entities = haDataStore.getEntities();
        this._widgets = readSensorWidgets(settings);
        this._widgetRows = [];
        this._haDataChangedId = haDataStore.connect('changed', () => this._applyHAData());
        this._widgetsChangedId = settings.connect('changed::sensor-widgets-config', () => {
            this._widgets = readSensorWidgets(this._settings);
            this._rebuildList();
        });

        const infoGroup = new Adw.PreferencesGroup({
            title: 'Entity Search',
            description: 'Sensor entities are loaded from the Connection tab.',
        });
        this.add(infoGroup);

        infoGroup.add(new Adw.ActionRow({
            title: 'Data Source',
            subtitle: 'Open Connection to refresh Home Assistant entities and services before configuring sensor widgets.',
            activatable: false,
        }));

        this._widgetsGroup = new Adw.PreferencesGroup({
            title: 'Sensor Widgets',
            description: 'Read-only tiles shown in the panel menu',
        });
        this.add(this._widgetsGroup);

        const addBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            css_classes: ['suggested-action', 'circular'],
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Add sensor widget',
        });
        this._widgetsGroup.set_header_suffix(addBtn);
        addBtn.connect('clicked', () => void this._openEditDialog(null, null));

        this._rebuildList();
    }

    _makeRowConfig(config) {
        const entityId = String(config?.entity_id ?? '');
        const displayName = this._entities.find(entity => entity.entity_id === entityId)
            ?.attributes?.friendly_name;
        return displayName ? { ...config, display_name: displayName } : config;
    }

    _rebuildList() {
        for (const row of this._widgetRows)
            this._widgetsGroup.remove(row);
        this._widgetRows = [];

        if (this._widgets.length === 0) {
            const placeholder = new Adw.ActionRow({
                title: 'No sensor widgets configured',
                subtitle: 'Click + to add a sensor tile to the panel menu',
                sensitive: false,
            });
            this._widgetsGroup.add(placeholder);
            this._widgetRows.push(placeholder);
            return;
        }

        for (let i = 0; i < this._widgets.length; i++) {
            const row = new SensorWidgetRow(
                this._makeRowConfig(this._widgets[i]),
                i,
                idx => this._openEditDialog(idx, this._widgets[idx]),
                idx => this._confirmDeleteWidget(idx)
            );
            this._widgetsGroup.add(row);
            this._widgetRows.push(row);
        }
    }

    async _openEditDialog(index, config) {
        const isNew = index === null;
        const dialog = new SensorWidgetDialog(
            config ?? {},
            this._entities,
            saved => {
                if (isNew)
                    this._widgets.push(saved);
                else
                    this._widgets[index] = saved;

                this._saveWidgets();
                this._rebuildList();
            }
        );
        dialog.present(this.get_root());
    }

    _confirmDeleteWidget(index) {
        const config = this._widgets[index];
        if (!config)
            return;

        const rowConfig = this._makeRowConfig(config);
        const label = String(rowConfig.display_name || rowConfig.entity_id || `Widget ${index + 1}`).trim();

        const dialog = new Adw.MessageDialog({
            transient_for: this.get_root(),
            heading: 'Delete Sensor Widget?',
            body: `Remove "${label}" from the panel?`,
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('delete', 'Delete');
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dialog, response) => {
            if (response === 'delete')
                this._deleteWidget(index);
        });
        dialog.present();
    }

    _deleteWidget(index) {
        this._widgets.splice(index, 1);
        this._saveWidgets();
        this._rebuildList();
    }

    _saveWidgets() {
        this._settings.set_string('sensor-widgets-config', JSON.stringify(this._widgets));
    }

    _applyHAData() {
        this._entities = haDataStore.getEntities();
        this._rebuildList();
    }

    vfunc_unroot() {
        if (this._haDataChangedId) {
            haDataStore.disconnect(this._haDataChangedId);
            this._haDataChangedId = null;
        }

        if (this._widgetsChangedId) {
            this._settings.disconnect(this._widgetsChangedId);
            this._widgetsChangedId = null;
        }

        super.vfunc_unroot();
    }
});

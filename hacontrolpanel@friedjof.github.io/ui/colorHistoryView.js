import St from 'gi://St';
import Clutter from 'gi://Clutter';

/**
 * Renders a grid of color-history swatches inside a vertical BoxLayout.
 *
 * Owns no mutable color state — the caller manages the history array and
 * calls rebuild() whenever it changes.
 *
 * @param {Function} onSelected  (hex: string) → void — called when a swatch is clicked
 */
export class ColorHistoryView {
    constructor(onSelected) {
        this._onSelected = onSelected;

        this._actor = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'roompanel-color-history',
        });
    }

    /** The St actor to insert into the parent layout. */
    getActor() {
        return this._actor;
    }

    /**
     * Clear and redraw the swatch grid from the given color array.
     * @param {string[]} colors  Hex strings (e.g. '#ff8800')
     */
    rebuild(colors) {
        for (const child of this._actor.get_children())
            this._actor.remove_child(child);

        if (colors.length === 0) {
            this._actor.add_child(new St.Label({
                text: 'Recent colors appear here',
                style_class: 'roompanel-history-placeholder',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            return;
        }

        for (let i = 0; i < colors.length; i += 2) {
            const row = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                style_class: 'roompanel-history-row',
            });

            for (let j = i; j < Math.min(i + 2, colors.length); j++) {
                const hex = colors[j];
                const swatch = new St.Button({
                    style_class: 'button roompanel-history-swatch',
                    x_expand: true,
                    can_focus: true,
                    reactive: true,
                });
                swatch.set_style(`background-color: ${hex};`);
                swatch.connect('clicked', () => this._onSelected(hex));
                row.add_child(swatch);
            }

            this._actor.add_child(row);
        }
    }

    destroy() {
        // No timer state — nothing to clean up.
    }
}

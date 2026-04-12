import GLib from 'gi://GLib';

/**
 * Shared helper for echo-suppression and post-suppression re-sync.
 *
 * Both ColorSection and SliderSection follow the same pattern after a
 * live HA state update arrives:
 *
 *   1. If within the echo-suppression window → schedule a re-sync for
 *      when the window expires.
 *   2. Otherwise → call the sync callback immediately.
 *
 * This class encapsulates that pattern so neither section needs its own
 * timer bookkeeping.
 *
 * @param {Function} getSuppressUntil  () → number  — ms timestamp set by markUserCommand()
 */
export class LiveValueSync {
    constructor(getSuppressUntil) {
        this._getSuppressUntil = getSuppressUntil;
        this._sourceId = null;
    }

    /** True while inside the echo-suppression window. */
    isSuppressed() {
        return Date.now() < this._getSuppressUntil();
    }

    /**
     * Cancel any pending scheduled sync.
     * Called by panelMenu._markUserCommand() before a new user command.
     */
    cancelPending() {
        if (this._sourceId) {
            GLib.source_remove(this._sourceId);
            this._sourceId = null;
        }
    }

    /**
     * If currently suppressed, schedule `callback` to run once the
     * suppression window expires (+25 ms slack).  Otherwise call it now.
     *
     * @param {Function} callback  () → void
     */
    scheduleSync(callback) {
        const remaining = Math.max(0, this._getSuppressUntil() - Date.now());
        this.cancelPending();

        if (remaining <= 0) {
            callback();
            return;
        }

        this._sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, remaining + 25, () => {
            this._sourceId = null;
            callback();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this.cancelPending();
    }
}

import { hexToRgb } from '../lib/colorHistory.js';
import { rgbToHex } from './colorWheel.js';

export function entityMatchesDomain(entityId, domain) {
    return Boolean(entityId) && Boolean(domain) && entityId.split('.')[0] === domain;
}

export function formatEntityLabel(entityId) {
    const value = String(entityId ?? '').trim();
    if (!value)
        return 'No entity selected';

    const separatorIndex = value.indexOf('.');
    const objectId = separatorIndex >= 0 ? value.slice(separatorIndex + 1) : value;
    return objectId
        .split('_')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function buildColorPreviewStyle(hex) {
    return `background-color: ${hex}; width: 26px; height: 26px; min-width: 26px; min-height: 26px; border-radius: 999px; border: 2px solid rgba(255, 255, 255, 0.3);`;
}

export function darkenHex(hex, factor = 0.55) {
    const rgb = hexToRgb(hex);
    if (!rgb)
        return null;

    return rgbToHex(rgb.map(v => Math.max(0, Math.min(255, Math.round(v * factor)))));
}

export function formatSliderValue(value) {
    if (!Number.isFinite(value))
        return '—';

    const rounded = Math.round(value * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.001)
        return String(Math.round(rounded));

    return String(rounded);
}

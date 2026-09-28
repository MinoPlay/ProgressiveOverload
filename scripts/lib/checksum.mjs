// Stable checksums for migration records.

import { createHash } from 'node:crypto';

function stableValue(value) {
    if (Array.isArray(value)) {
        return value.map(stableValue);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map(key => [key, stableValue(value[key])])
        );
    }
    return value;
}

export function stableStringify(value) {
    return JSON.stringify(stableValue(value));
}

export function checksum(value) {
    return createHash('sha256')
        .update(stableStringify(value))
        .digest('hex');
}

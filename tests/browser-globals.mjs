// Minimal browser globals so browser modules (e.g. js/config.js) can be imported in Node.
globalThis.window ??= globalThis;

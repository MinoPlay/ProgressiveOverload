import test from 'node:test';
import assert from 'node:assert/strict';

import '../js/deploy-env.js';

const { DeployEnv } = globalThis;

class FakeStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
    key(i) { return [...this.map.keys()][i] ?? null; }
    clear() { this.map.clear(); }
    get length() { return this.map.size; }
}

test('getDeployId resolves main vs preview from pathname', () => {
    assert.equal(DeployEnv.getDeployId('/ProgressiveOverload/'), '');
    assert.equal(DeployEnv.getDeployId('/ProgressiveOverload/index.html'), '');
    assert.equal(DeployEnv.getDeployId('/'), '');
    assert.equal(DeployEnv.getDeployId('/ProgressiveOverload/preview/feature-x/'), 'feature-x');
    assert.equal(DeployEnv.getDeployId('/ProgressiveOverload/preview/feature-x/sw.js'), 'feature-x');
});

test('slugifyBranch and nsPrefix', () => {
    assert.equal(DeployEnv.slugifyBranch('MKUC/skill-and-data'), 'mkuc-skill-and-data');
    assert.equal(DeployEnv.nsPrefix(''), '');
    assert.equal(DeployEnv.nsPrefix('x'), 'preview-x:');
});

test('cache names keep legacy names on main and are isolated per preview', () => {
    assert.equal(DeployEnv.getCacheName('static', 'v73r', ''), 'po-static-v73r');
    assert.equal(DeployEnv.getCacheName('cdn', 'v73r', 'x'), 'po-x-cdn-v73r');
    assert.equal(DeployEnv.isOwnCache('po-static-v73q', ''), true);
    assert.equal(DeployEnv.isOwnCache('some-legacy-cache', ''), true);
    assert.equal(DeployEnv.isOwnCache('po-x-static-v73q', ''), false);
    assert.equal(DeployEnv.isOwnCache('po-static-static-v1', ''), false);
    assert.equal(DeployEnv.isOwnCache('po-x-cdn-v73q', 'x'), true);
    assert.equal(DeployEnv.isOwnCache('po-x-y-static-v1', 'x'), false);
    assert.equal(DeployEnv.isOwnCache('po-static-v73q', 'x'), false);
});

test('storage namespace isolates preview keys and is a no-op on main', () => {
    const proto = FakeStorage.prototype;
    const store = new FakeStorage();
    store.setItem('theme', 'dark');

    assert.equal(typeof DeployEnv.installStorageNamespace(proto, '')(), 'undefined');
    assert.equal(store.getItem('theme'), 'dark');

    const restore = DeployEnv.installStorageNamespace(proto, 'x');
    try {
        assert.equal(store.getItem('theme'), null);
        assert.equal(store.length, 0);
        store.setItem('a', '1');
        assert.equal(store.getItem('a'), '1');
        assert.equal(store.length, 1);
        assert.equal(store.key(0), 'a');
        store.clear();
        assert.equal(store.length, 0);
    } finally {
        restore();
    }
    assert.equal(store.getItem('theme'), 'dark');
    assert.equal(store.getItem('preview-x:a'), null);
});

test('storage event keys are un-prefixed for own namespace and null otherwise', () => {
    class FakeEvent {
        constructor(key) { this._key = key; }
        get key() { return this._key; }
    }
    const restore = DeployEnv.installStorageEventNamespace(FakeEvent.prototype, 'x');
    try {
        assert.equal(new FakeEvent('preview-x:theme').key, 'theme');
        assert.equal(new FakeEvent('theme').key, null);
        assert.equal(new FakeEvent('preview-y:theme').key, null);
    } finally {
        restore();
    }
    assert.equal(new FakeEvent('theme').key, 'theme');
});

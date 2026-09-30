// Deploy identity for parallel GitHub Pages branch previews
// (see .github/features/preview-deployments.md). Main → id ''; a branch preview
// served at /…/preview/<slug>/ → id '<slug>'. Main keeps all legacy keys/cache names.
// Classic script (no import/export) so it runs synchronously in the <head> of
// index.html and workout.html, and via importScripts() in sw.js. Exposes `DeployEnv`.
(function (root) {
    if (root.DeployEnv) return;

    const PREVIEW_CACHE_RE = /^po-[a-z0-9-]+-(static|cdn)-v[^-]*$/;

    const DeployEnv = {
        /**
         * @param {string} pathname - URL pathname
         * @returns {string} '' for main, '<slug>' for /preview/<slug>/
         */
        getDeployId(pathname = '') {
            const m = /\/preview\/([a-z0-9-]+)(\/|$)/.exec(pathname);
            return m ? m[1] : '';
        },

        /**
         * @param {string} branch - git branch name
         * @returns {string} URL slug used under /preview/
         */
        slugifyBranch(branch) {
            return String(branch).toLowerCase().replace(/[^a-z0-9-]/g, '-');
        },

        /**
         * @param {string} id - deploy id
         * @returns {string} storage key prefix ('' for main)
         */
        nsPrefix(id) {
            return id ? `preview-${id}:` : '';
        },

        /**
         * @returns {string} deploy id of the current document / worker
         */
        currentDeployId() {
            try { return this.getDeployId(root.location.pathname); } catch { return ''; }
        },

        /**
         * @param {'static'|'cdn'} kind - cache bucket
         * @param {string} version - CACHE_VERSION
         * @param {string} id - deploy id
         * @returns {string} po-<kind>-<v> (main) or po-<slug>-<kind>-<v> (preview)
         */
        getCacheName(kind, version, id) {
            return id ? `po-${id}-${kind}-${version}` : `po-${kind}-${version}`;
        },

        /**
         * Whether a cache belongs to this deploy. Main owns every cache that is
         * not a preview cache (legacy behaviour); a preview owns only its own.
         * @param {string} name - cache name
         * @param {string} id - deploy id
         * @returns {boolean}
         */
        isOwnCache(name, id) {
            if (!id) return !PREVIEW_CACHE_RE.test(name);
            return new RegExp(`^po-${id}-(static|cdn)-v[^-]*$`).test(name);
        },

        /**
         * Patch Storage.prototype so localStorage/sessionStorage keys are transparently
         * prefixed. Instance-level overrides are impossible (the Storage named-property
         * setter would store them as items), hence the prototype patch. No-op on main.
         * @param {object} proto - Storage.prototype
         * @param {string} id - deploy id
         * @returns {Function} restore
         */
        installStorageNamespace(proto, id) {
            const prefix = this.nsPrefix(id);
            if (!prefix) return () => {};
            const orig = {
                getItem: proto.getItem,
                setItem: proto.setItem,
                removeItem: proto.removeItem,
                key: proto.key,
                clear: proto.clear,
                length: Object.getOwnPropertyDescriptor(proto, 'length'),
            };
            const ownKeys = (store) => {
                const out = [];
                const n = orig.length.get.call(store);
                for (let i = 0; i < n; i++) {
                    const k = orig.key.call(store, i);
                    if (k && k.startsWith(prefix)) out.push(k);
                }
                return out;
            };
            proto.getItem = function (k) { return orig.getItem.call(this, prefix + k); };
            proto.setItem = function (k, v) { return orig.setItem.call(this, prefix + k, v); };
            proto.removeItem = function (k) { return orig.removeItem.call(this, prefix + k); };
            proto.key = function (i) {
                const k = ownKeys(this)[i];
                return k === undefined ? null : k.slice(prefix.length);
            };
            proto.clear = function () { ownKeys(this).forEach(k => orig.removeItem.call(this, k)); };
            Object.defineProperty(proto, 'length', {
                configurable: true,
                enumerable: orig.length.enumerable,
                get() { return ownKeys(this).length; },
            });
            return () => {
                proto.getItem = orig.getItem;
                proto.setItem = orig.setItem;
                proto.removeItem = orig.removeItem;
                proto.key = orig.key;
                proto.clear = orig.clear;
                Object.defineProperty(proto, 'length', orig.length);
            };
        },

        /**
         * Patch StorageEvent.prototype.key so cross-tab `storage` listeners see
         * un-prefixed keys for their own namespace and null for other deploys. No-op on main.
         * @param {object} proto - StorageEvent.prototype
         * @param {string} id - deploy id
         * @returns {Function} restore
         */
        installStorageEventNamespace(proto, id) {
            const prefix = this.nsPrefix(id);
            if (!prefix) return () => {};
            const orig = Object.getOwnPropertyDescriptor(proto, 'key');
            Object.defineProperty(proto, 'key', {
                configurable: true,
                enumerable: orig.enumerable,
                get() {
                    const k = orig.get.call(this);
                    return k && k.startsWith(prefix) ? k.slice(prefix.length) : null;
                },
            });
            return () => Object.defineProperty(proto, 'key', orig);
        },
    };

    root.DeployEnv = DeployEnv;

    const id = DeployEnv.currentDeployId();
    if (typeof Storage !== 'undefined') DeployEnv.installStorageNamespace(Storage.prototype, id);
    if (typeof StorageEvent !== 'undefined') DeployEnv.installStorageEventNamespace(StorageEvent.prototype, id);
})(typeof self !== 'undefined' ? self : globalThis);

// GitHub snapshot loading through the Contents API.

import { parseSnapshotFiles } from './serialization.mjs';

const workoutFilePattern = /^workouts-\d{4}-\d{2}\.json$/;

function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

export class GitHubContentsClient {
    constructor({ token, repository, ref = 'main' }) {
        if (!token) throw new Error('GITHUB_TOKEN is required');
        if (!repository) throw new Error('GitHub repository is required');
        this.token = token;
        this.repository = repository;
        this.ref = ref;
    }

    async request(path, options = {}) {
        const response = await fetch(`https://api.github.com${path}`, {
            ...options,
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${this.token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                ...options.headers
            }
        });
        if (options.allowNotFound && response.status === 404) {
            return null;
        }
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`GitHub API ${response.status}: ${body}`);
        }
        if (response.status === 204) {
            return null;
        }
        return response.json();
    }

    async list(directory, ref = this.ref) {
        return (await this.request(
            `/repos/${this.repository}/contents/${encodePath(directory)}?ref=${encodeURIComponent(ref)}`,
            { allowNotFound: true }
        )) || [];
    }

    async getText(path, ref = this.ref, optional = false) {
        const result = await this.request(
            `/repos/${this.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
            { allowNotFound: optional }
        );
        if (!result) return null;
        if (result.type !== 'file' || !result.content) {
            throw new Error(`Expected GitHub file at ${path}`);
        }
        return Buffer.from(result.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }
}

export async function loadGitHubSnapshot({
    token,
    repository = 'MinoPlay/ProgressiveOverload',
    directory = 'progressive-overload',
    ref = 'main'
}) {
    const client = new GitHubContentsClient({ token, repository, ref });
    const entries = await client.list(directory);
    const names = new Set(entries.filter(entry => entry.type === 'file').map(entry => entry.name));
    const requiredFiles = ['exercises.json'];
    const optionalFiles = ['session-templates.json', 'user-settings.json'];
    const workoutFiles = [...names].filter(name => workoutFilePattern.test(name)).sort();
    const filesToLoad = [
        ...requiredFiles,
        ...optionalFiles.filter(name => names.has(name)),
        ...workoutFiles
    ];

    for (const requiredFile of requiredFiles) {
        if (!names.has(requiredFile)) {
            throw new Error(`Required source file is missing: ${directory}/${requiredFile}`);
        }
    }

    const loaded = await Promise.all(filesToLoad.map(async name => [
        name,
        await client.getText(`${directory}/${name}`, ref)
    ]));

    return {
        snapshot: parseSnapshotFiles(new Map(loaded)),
        sourceFiles: filesToLoad
    };
}

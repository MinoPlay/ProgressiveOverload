// Deterministic GitHub backup branch updates.

import { GitHubContentsClient } from './github-snapshot.mjs';

function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

export async function ensureBranch(client, branch, sourceBranch = 'main') {
    const existing = await client.request(
        `/repos/${client.repository}/git/ref/heads/${encodePath(branch)}`,
        { allowNotFound: true }
    );
    if (existing) return;

    const source = await client.request(
        `/repos/${client.repository}/git/ref/heads/${encodePath(sourceBranch)}`
    );
    await client.request(`/repos/${client.repository}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: source.object.sha
        })
    });
}

async function getExistingFile(client, path, branch) {
    return client.request(
        `/repos/${client.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
        { allowNotFound: true }
    );
}

async function putFile(client, path, content, branch, sha) {
    await client.request(`/repos/${client.repository}/contents/${encodePath(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Back up ${path}`,
            branch,
            content: Buffer.from(content).toString('base64'),
            ...(sha ? { sha } : {})
        })
    });
}

async function deleteFile(client, path, branch, sha) {
    await client.request(`/repos/${client.repository}/contents/${encodePath(path)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Remove obsolete ${path}`,
            branch,
            sha
        })
    });
}

export function assertSafeBackupChange(files, existingEntries, allowDestructiveChanges) {
    const existingWorkoutFiles = existingEntries
        .filter(entry => entry.type === 'file')
        .filter(entry => /^workouts-\d{4}-\d{2}\.json$/.test(entry.name));
    const nextWorkoutFileCount = [...files.keys()]
        .filter(name => /^workouts-\d{4}-\d{2}\.json$/.test(name))
        .length;

    if (!allowDestructiveChanges &&
        existingWorkoutFiles.length > 0 &&
        nextWorkoutFileCount === 0) {
        throw new Error('Refusing to publish an empty workout backup without an explicit override');
    }

    const removedCount = existingWorkoutFiles
        .filter(entry => !files.has(entry.name))
        .length;
    if (!allowDestructiveChanges &&
        existingWorkoutFiles.length >= 2 &&
        removedCount / existingWorkoutFiles.length > 0.5) {
        throw new Error('Refusing to remove more than half of existing workout backup files');
    }
}

export async function writeBackupBranch({
    token,
    repository,
    branch,
    sourceBranch = 'main',
    directory = 'progressive-overload',
    files,
    allowDestructiveChanges = false
}) {
    const client = new GitHubContentsClient({
        token,
        repository,
        ref: branch
    });
    await ensureBranch(client, branch, sourceBranch);

    const existingEntries = await client.list(directory, branch);
    assertSafeBackupChange(files, existingEntries, allowDestructiveChanges);
    const existingByName = new Map(
        existingEntries
            .filter(entry => entry.type === 'file')
            .map(entry => [entry.name, entry])
    );

    for (const [name, content] of files) {
        const path = `${directory}/${name}`;
        const existing = await getExistingFile(client, path, branch);
        const current = existing?.content
            ? Buffer.from(existing.content.replace(/\n/g, ''), 'base64').toString('utf8')
            : null;
        if (current === content) continue;
        await putFile(client, path, content, branch, existing?.sha);
    }

    const obsoleteWorkoutFiles = [...existingByName.values()]
        .filter(entry => /^workouts-\d{4}-\d{2}\.json$/.test(entry.name))
        .filter(entry => !files.has(entry.name));
    for (const entry of obsoleteWorkoutFiles) {
        await deleteFile(client, `${directory}/${entry.name}`, branch, entry.sha);
    }

    return {
        written: [...files.keys()],
        removed: obsoleteWorkoutFiles.map(entry => entry.name)
    };
}

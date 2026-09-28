#!/usr/bin/env node
// Automate the safe CLI-side stages of the GitHub-to-Supabase migration.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const defaultRepository = 'MinoPlay/ProgressiveOverload';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const usage = `Usage:
  npm run migration:setup -- --project-ref <ref> --supabase-url <url> --legacy-user-id <uuid>
  npm run migration:forward -- --dry-run
  npm run migration:forward
  npm run migration:dispatch -- --dry-run
  npm run migration:cutover -- --confirm-writes-paused --confirm-supabase-verified
  npm run migration:backup

Required before setup:
  - Install and authenticate the Supabase CLI.
  - Install and authenticate the GitHub CLI.
  - Create/sign in the legacy Supabase Auth user and copy its UUID.
  - Set SUPABASE_SERVICE_ROLE_KEY in the current shell.
  - Set SUPABASE_DB_PASSWORD in the current shell.
  - Push these migration files and workflows before using migration:dispatch.

Setup parameters can also be supplied as environment variables:
  SUPABASE_PROJECT_REF
  SUPABASE_URL
  SUPABASE_LEGACY_USER_ID
  SUPABASE_DB_PASSWORD
  MIGRATION_REPOSITORY
  MIGRATION_WORKFLOW_REF
  GITHUB_DATA_REPOSITORY
  GITHUB_DATA_DIRECTORY
  GITHUB_SOURCE_REF
  GITHUB_BACKUP_REPOSITORY
  SUPABASE_BACKUP_BRANCH

Setup options:
  --repository <owner/repo>   GitHub repository to configure
  --directory <path>         Data directory (default: progressive-overload)
  --source-ref <ref>         Source branch/tag (default: main)
  --backup-repo <owner/repo> Backup repository (default: configured repository)
  --backup-branch <branch>   Backup branch (default: supabase-backup)
  --skip-db-push             Link/configure without applying migrations
  --dry-run                  Print the setup plan without changing anything

Still manual after setup:
  - Expose progressive_overload in Supabase Data API settings.
  - Configure Supabase Auth production/local redirect URLs.
  - Verify the migrated account in Supabase mode.
  - Switch the app/browser backend to Supabase at cutover.
`;

export function parseArgs(argv) {
    const args = {};
    let mode = 'help';

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--help' || token === '-h' || token === '-?') {
            mode = 'help';
            continue;
        }
        if (token.startsWith('--')) {
            const separator = token.indexOf('=');
            const key = token.slice(2, separator === -1 ? undefined : separator);
            const inlineValue = separator === -1 ? undefined : token.slice(separator + 1);
            const nextValue = inlineValue ?? argv[i + 1];

            if (nextValue && !nextValue.startsWith('--')) {
                args[key] = nextValue;
                if (inlineValue === undefined) i += 1;
            } else {
                args[key] = true;
            }
            continue;
        }
        if (mode === 'help') mode = token;
    }

    return { mode, args };
}

function effectiveValue(args, key, env, envKey, fallback) {
    return args[key] || env[envKey] || fallback;
}

function requireValue(value, message) {
    if (!value) throw new Error(message);
    return value;
}

export function resolveSetupConfig(args, env = process.env) {
    const skipDbPush = args['skip-db-push'] === true;
    const projectRef = requireValue(
        effectiveValue(args, 'project-ref', env, 'SUPABASE_PROJECT_REF'),
        'Provide --project-ref or set SUPABASE_PROJECT_REF.'
    );
    const supabaseUrl = requireValue(
        effectiveValue(args, 'supabase-url', env, 'SUPABASE_URL'),
        'Provide --supabase-url or set SUPABASE_URL.'
    );
    const serviceRoleKey = requireValue(
        env.SUPABASE_SERVICE_ROLE_KEY,
        'Set SUPABASE_SERVICE_ROLE_KEY in the current shell. It is intentionally not accepted as a command-line argument.'
    );
    if (!skipDbPush) {
        requireValue(
            env.SUPABASE_DB_PASSWORD,
            'Set SUPABASE_DB_PASSWORD in the current shell. This prevents the Supabase CLI from using its unreliable temporary login-role flow.'
        );
    }
    const legacyUserId = requireValue(
        effectiveValue(args, 'legacy-user-id', env, 'SUPABASE_LEGACY_USER_ID'),
        'Provide --legacy-user-id or set SUPABASE_LEGACY_USER_ID.'
    );

    try {
        const parsedUrl = new URL(supabaseUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
    } catch {
        throw new Error('SUPABASE_URL must be a valid HTTP or HTTPS URL.');
    }
    if (!uuidPattern.test(legacyUserId)) {
        throw new Error('SUPABASE_LEGACY_USER_ID must be a valid UUID.');
    }

    const repository = effectiveValue(
        args,
        'repository',
        env,
        'MIGRATION_REPOSITORY',
        defaultRepository
    );

    return {
        projectRef,
        supabaseUrl,
        serviceRoleKey,
        legacyUserId,
        repository,
        dataRepository: effectiveValue(
            args,
            'data-repository',
            env,
            'GITHUB_DATA_REPOSITORY',
            repository
        ),
        backupRepository: effectiveValue(
            args,
            'backup-repo',
            env,
            'GITHUB_BACKUP_REPOSITORY',
            repository
        ),
        dataDirectory: effectiveValue(
            args,
            'directory',
            env,
            'GITHUB_DATA_DIRECTORY',
            'progressive-overload'
        ),
        sourceRef: effectiveValue(args, 'source-ref', env, 'GITHUB_SOURCE_REF', 'main'),
        backupBranch: effectiveValue(
            args,
            'backup-branch',
            env,
            'SUPABASE_BACKUP_BRANCH',
            'supabase-backup'
        ),
        skipDbPush
    };
}

function ghValueStep(kind, name, value, repository) {
    return {
        label: `Set GitHub ${kind} ${name}`,
        command: 'gh',
        args: [kind, 'set', name, '--repo', repository],
        input: value,
        sensitive: kind === 'secret'
    };
}

export function buildSetupPlan(config) {
    const plan = [{
        label: 'Link the Supabase project',
        command: 'supabase',
        args: ['link', '--project-ref', config.projectRef]
    }];

    if (!config.skipDbPush) {
        plan.push({
            label: 'Apply Supabase migrations',
            command: 'supabase',
            args: ['db', 'push']
        });
    }

    plan.push(
        ghValueStep('secret', 'SUPABASE_URL', config.supabaseUrl, config.repository),
        ghValueStep(
            'secret',
            'SUPABASE_SERVICE_ROLE_KEY',
            config.serviceRoleKey,
            config.repository
        ),
        ghValueStep(
            'secret',
            'SUPABASE_LEGACY_USER_ID',
            config.legacyUserId,
            config.repository
        ),
        ghValueStep(
            'variable',
            'GITHUB_DATA_REPOSITORY',
            config.dataRepository,
            config.repository
        ),
        ghValueStep(
            'variable',
            'GITHUB_BACKUP_REPOSITORY',
            config.backupRepository,
            config.repository
        ),
        ghValueStep(
            'variable',
            'GITHUB_DATA_DIRECTORY',
            config.dataDirectory,
            config.repository
        ),
        ghValueStep('variable', 'GITHUB_SOURCE_REF', config.sourceRef, config.repository),
        ghValueStep(
            'variable',
            'SUPABASE_BACKUP_BRANCH',
            config.backupBranch,
            config.repository
        ),
        ghValueStep('variable', 'SUPABASE_CUTOVER', 'false', config.repository),
        ghValueStep('variable', 'ALLOW_DESTRUCTIVE_BACKUP', 'false', config.repository)
    );

    return plan;
}

export function resolveDispatchConfig(args, env = process.env) {
    return {
        repository: effectiveValue(
            args,
            'repository',
            env,
            'MIGRATION_REPOSITORY',
            defaultRepository
        ),
        workflowRef: effectiveValue(
            args,
            'workflow-ref',
            env,
            'MIGRATION_WORKFLOW_REF',
            'main'
        )
    };
}

export function commandInvocation(
    command,
    args,
    platform = process.platform,
    env = process.env
) {
    if (platform === 'win32' && command === 'supabase') {
        return {
            command: env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', 'supabase.cmd', ...args]
        };
    }

    return { command, args };
}

function runCommand(command, args, { env = process.env, input } = {}) {
    const invocation = commandInvocation(command, args, process.platform, env);
    const result = spawnSync(invocation.command, invocation.args, {
        env,
        input,
        shell: false,
        stdio: input === undefined
            ? 'inherit'
            : ['pipe', 'inherit', 'inherit']
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

function ensureCli(command, installMessage) {
    const invocation = commandInvocation(command, ['--version']);
    const result = spawnSync(invocation.command, invocation.args, {
        encoding: 'utf8',
        shell: false
    });
    if (result.error || result.status !== 0) throw new Error(installMessage);
}

function ensureRequiredEnv(keys) {
    const missing = keys.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

function printPlan(plan) {
    for (const step of plan) {
        const input = step.input === undefined
            ? ''
            : ` < ${step.sensitive ? '[secret value]' : JSON.stringify(step.input)}`;
        console.log(`- ${step.label}: ${step.command} ${step.args.join(' ')}${input}`);
    }
}

function setup(job) {
    const config = resolveSetupConfig(job.args);
    const plan = buildSetupPlan(config);

    if (job.args['dry-run']) {
        printPlan(plan);
        return;
    }

    ensureCli(
        'supabase',
        'Supabase CLI is not installed or not on PATH. Install it before running setup.'
    );
    ensureCli('gh', 'GitHub CLI is not installed or not on PATH. Install it before running setup.');
    runCommand('gh', ['auth', 'status']);

    for (const step of plan) {
        console.log(`\n${step.label}...`);
        runCommand(step.command, step.args, { input: step.input });
    }

    console.log('\nAutomated setup completed.');
    console.log('Manual prerequisites before synchronization:');
    console.log('  1. Expose progressive_overload in Supabase Data API settings.');
    console.log('  2. Configure Supabase Auth redirect URLs.');
    console.log('  3. Ensure these workflows are pushed to the configured GitHub repository.');
    console.log('Then run: npm run migration:dispatch -- --dry-run');
}

function forwardSync(job) {
    ensureRequiredEnv([
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_LEGACY_USER_ID',
        'GITHUB_TOKEN'
    ]);

    const args = ['scripts/sync-github-to-supabase.mjs'];
    if (job.args['dry-run']) args.push('--dry-run');

    const env = { ...process.env };
    const repository = effectiveValue(
        job.args,
        'repository',
        process.env,
        'GITHUB_DATA_REPOSITORY'
    );
    const directory = effectiveValue(
        job.args,
        'directory',
        process.env,
        'GITHUB_DATA_DIRECTORY'
    );
    const sourceRef = effectiveValue(
        job.args,
        'source-ref',
        process.env,
        'GITHUB_SOURCE_REF'
    );

    if (repository) env.GITHUB_DATA_REPOSITORY = repository;
    if (directory) env.GITHUB_DATA_DIRECTORY = directory;
    if (sourceRef) env.GITHUB_SOURCE_REF = sourceRef;
    runCommand('node', args, { env });
}

function dispatchForward(job) {
    ensureCli('gh', 'GitHub CLI is not installed or not on PATH.');
    runCommand('gh', ['auth', 'status']);
    const config = resolveDispatchConfig(job.args);
    runCommand('gh', [
        'workflow',
        'run',
        'sync-github-to-supabase.yml',
        '--repo',
        config.repository,
        '--ref',
        config.workflowRef,
        '--raw-field',
        `dry_run=${job.args['dry-run'] === true}`
    ]);
}

function backupSync(job) {
    ensureRequiredEnv([
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_LEGACY_USER_ID',
        'GITHUB_TOKEN'
    ]);

    const env = { ...process.env };
    const mappings = [
        ['backup-branch', 'SUPABASE_BACKUP_BRANCH'],
        ['backup-repo', 'GITHUB_BACKUP_REPOSITORY'],
        ['directory', 'GITHUB_DATA_DIRECTORY'],
        ['source-ref', 'GITHUB_SOURCE_REF']
    ];
    for (const [argument, environment] of mappings) {
        const value = effectiveValue(job.args, argument, process.env, environment);
        if (value) env[environment] = value;
    }

    runCommand('node', ['scripts/export-supabase-to-github.mjs'], { env });
}

function cutover(job) {
    if (!job.args['confirm-writes-paused'] || !job.args['confirm-supabase-verified']) {
        throw new Error(
            'Cutover requires --confirm-writes-paused and --confirm-supabase-verified.'
        );
    }

    const repository = effectiveValue(
        job.args,
        'repository',
        process.env,
        'MIGRATION_REPOSITORY',
        defaultRepository
    );
    forwardSync(job);
    ensureCli('gh', 'GitHub CLI is not installed or not on PATH.');
    runCommand('gh', ['variable', 'set', 'SUPABASE_CUTOVER', '--repo', repository], {
        input: 'true'
    });
    console.log('Final reconciliation completed and forward synchronization is disabled.');
    console.log('Switch the app/browser backend to Supabase, then run npm run migration:backup.');
}

export function main(argv = process.argv.slice(2)) {
    const job = parseArgs(argv);

    if (job.mode === 'help') {
        console.log(usage);
    } else if (job.mode === 'setup' || job.mode === 'preflight') {
        setup(job);
    } else if (job.mode === 'forward') {
        forwardSync(job);
    } else if (job.mode === 'dispatch-forward') {
        dispatchForward(job);
    } else if (job.mode === 'backup') {
        backupSync(job);
    } else if (job.mode === 'cutover') {
        cutover(job);
    } else {
        throw new Error(
            `Unknown mode: ${job.mode}. Supported modes: setup, forward, dispatch-forward, cutover, backup`
        );
    }
}

const invokedDirectly = process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        console.error('');
        console.error('For help: npm run migration:help');
        process.exit(1);
    }
}

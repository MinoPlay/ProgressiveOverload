// Tests for the migration automation command.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildSetupPlan,
    commandInvocation,
    parseArgs,
    resolveDispatchConfig,
    resolveSetupConfig
} from '../scripts/run-migration.mjs';

const serviceRoleKey = 'service-role-secret';
const databasePassword = 'database-password';

const setupEnvironment = {
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SUPABASE_DB_PASSWORD: databasePassword
};

test('setup accepts command-line values and supplies safe defaults', () => {
    const job = parseArgs([
        'setup',
        '--project-ref',
        'project-ref',
        '--supabase-url',
        'https://example.supabase.co',
        '--legacy-user-id',
        '11111111-1111-4111-8111-111111111111'
    ]);

    const config = resolveSetupConfig(job.args, setupEnvironment);

    assert.equal(config.projectRef, 'project-ref');
    assert.equal(config.repository, 'MinoPlay/ProgressiveOverload');
    assert.equal(config.dataDirectory, 'progressive-overload');
    assert.equal(config.sourceRef, 'main');
    assert.equal(config.backupBranch, 'supabase-backup');
});

test('setup plan passes secrets over standard input instead of command arguments', () => {
    const config = resolveSetupConfig({
        'project-ref': 'project-ref',
        'supabase-url': 'https://example.supabase.co',
        'legacy-user-id': '11111111-1111-4111-8111-111111111111'
    }, setupEnvironment);

    const plan = buildSetupPlan(config);
    const serviceKeyStep = plan.find((step) =>
        step.command === 'gh'
        && step.args.includes('SUPABASE_SERVICE_ROLE_KEY')
    );

    assert.equal(serviceKeyStep.input, serviceRoleKey);
    assert.doesNotMatch(serviceKeyStep.args.join(' '), /service-role-secret/);
});

test('setup rejects an invalid legacy user ID before running commands', () => {
    assert.throws(
        () => resolveSetupConfig({
            'project-ref': 'project-ref',
            'supabase-url': 'https://example.supabase.co',
            'legacy-user-id': 'not-a-uuid'
        }, setupEnvironment),
        /valid UUID/i
    );
});

test('setup rejects a missing database password before invoking Supabase', () => {
    assert.throws(
        () => resolveSetupConfig({
            'project-ref': 'project-ref',
            'supabase-url': 'https://example.supabase.co',
            'legacy-user-id': '11111111-1111-4111-8111-111111111111'
        }, {
            SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey
        }),
        /SUPABASE_DB_PASSWORD/
    );
});

test('setup does not require a database password when database push is skipped', () => {
    assert.doesNotThrow(() => resolveSetupConfig({
        'project-ref': 'project-ref',
        'supabase-url': 'https://example.supabase.co',
        'legacy-user-id': '11111111-1111-4111-8111-111111111111',
        'skip-db-push': true
    }, {
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey
    }));
});

test('setup keeps the app repository separate from an overridden data repository', () => {
    const config = resolveSetupConfig({
        'project-ref': 'project-ref',
        'supabase-url': 'https://example.supabase.co',
        'legacy-user-id': '11111111-1111-4111-8111-111111111111'
    }, {
        ...setupEnvironment,
        GITHUB_DATA_REPOSITORY: 'AnotherOwner/LegacyData'
    });

    assert.equal(config.repository, 'MinoPlay/ProgressiveOverload');
    assert.equal(config.dataRepository, 'AnotherOwner/LegacyData');
});

test('workflow dispatch ref is independent from the legacy data source ref', () => {
    const config = resolveDispatchConfig({}, {
        GITHUB_SOURCE_REF: 'legacy-data',
        MIGRATION_WORKFLOW_REF: 'main'
    });

    assert.equal(config.workflowRef, 'main');
});

test('Windows invokes npm command shims through cmd.exe', () => {
    assert.deepEqual(
        commandInvocation('supabase', ['--version'], 'win32', {
            ComSpec: 'C:\\Windows\\System32\\cmd.exe'
        }),
        {
            command: 'C:\\Windows\\System32\\cmd.exe',
            args: ['/d', '/s', '/c', 'supabase.cmd', '--version']
        }
    );
});

test('non-Windows invokes commands directly', () => {
    assert.deepEqual(
        commandInvocation('supabase', ['--version'], 'linux', {}),
        {
            command: 'supabase',
            args: ['--version']
        }
    );
});

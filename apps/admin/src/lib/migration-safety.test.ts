import { describe, expect, test } from 'bun:test';
import { analyzeMigrationSafety, deriveMigrationBackupReadiness } from './migration-safety';

describe('migration safety analysis', () => {
  test('flags destructive SQL and requires rollback acknowledgement', () => {
    const backup = deriveMigrationBackupReadiness({
      enabled: true,
      destination: 'storage',
      runs: [],
    });

    const result = analyzeMigrationSafety(
      [
        {
          id: '1',
          key: '2026032801_drop_users_bio',
          title: 'drop users bio',
          status: 'pending',
          sql: 'alter table "users" drop column "bio";',
          appliedAt: null,
        },
      ],
      backup,
    );

    expect(result.level).toBe('destructive');
    expect(result.requiresBackupConfirmation).toBe(true);
    expect(result.requiresRollbackConfirmation).toBe(true);
    expect(result.concerns.map((item) => item.title)).toContain('Drops a column');
  });

  test('treats successful backup runs as recovery-ready context', () => {
    const backup = deriveMigrationBackupReadiness({
      enabled: true,
      destination: 'storage',
      runs: [
        {
          id: 'run_1',
          status: 'succeeded',
          trigger: 'manual',
          destination: 'storage',
          filePath: 'backups/latest.dump',
          sizeBytes: 100,
          details: { operation: 'backup' },
          error: null,
          startedAt: '2026-03-28T10:00:00.000Z',
          completedAt: '2026-03-28T10:01:00.000Z',
        },
      ],
    });

    const result = analyzeMigrationSafety(
      [
        {
          id: '1',
          key: '2026032802_add_index',
          title: 'add index',
          status: 'pending',
          sql: 'create index "posts_published_at_idx" on "posts" ("published_at");',
          appliedAt: null,
        },
      ],
      backup,
    );

    expect(result.level).toBe('safe');
    expect(result.requiresBackupConfirmation).toBe(false);
    expect(result.guidance[0]).toContain('Latest successful backup');
  });
});

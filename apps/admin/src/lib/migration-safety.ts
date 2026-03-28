import type { BackupRun, MigrationRecord } from '@authend/shared';

export type MigrationSafetySeverity = 'warning' | 'destructive';

export type MigrationSafetyConcern = {
  severity: MigrationSafetySeverity;
  title: string;
  detail: string;
  migrationKey: string;
  migrationTitle: string;
};

export type MigrationBackupReadiness = {
  enabled: boolean;
  destination: string;
  latestSuccessfulBackupAt: string | null;
};

export type MigrationSafetyReview = {
  level: 'safe' | 'warning' | 'destructive';
  summary: string;
  concerns: MigrationSafetyConcern[];
  guidance: string[];
  requiresSqlReview: boolean;
  requiresBackupConfirmation: boolean;
  requiresRollbackConfirmation: boolean;
};

type PatternRule = {
  severity: MigrationSafetySeverity;
  title: string;
  regex: RegExp;
  detail: string;
};

const PATTERN_RULES: PatternRule[] = [
  {
    severity: 'destructive',
    title: 'Drops a table',
    regex: /\bdrop\s+table\b/i,
    detail: 'This removes a table and its records. Recovery usually means restoring a backup.',
  },
  {
    severity: 'destructive',
    title: 'Drops a column',
    regex: /\bdrop\s+column\b/i,
    detail: 'This removes stored data from an existing column.',
  },
  {
    severity: 'destructive',
    title: 'Truncates table data',
    regex: /\btruncate\s+table\b/i,
    detail: 'This clears table rows immediately and is not a safe routine migration.',
  },
  {
    severity: 'destructive',
    title: 'Deletes existing rows',
    regex: /\bdelete\s+from\b/i,
    detail: 'This migration contains data-deletion SQL and should be reviewed as a destructive change.',
  },
  {
    severity: 'warning',
    title: 'Changes a column type',
    regex: /\balter\s+column\b[\s\S]{0,120}\btype\b/i,
    detail: 'Type changes can fail on incompatible rows or require manual cleanup before apply.',
  },
  {
    severity: 'warning',
    title: 'Makes a column required',
    regex: /\balter\s+column\b[\s\S]{0,120}\bset\s+not\s+null\b/i,
    detail: 'Existing null rows will cause this migration to fail unless they are fixed first.',
  },
  {
    severity: 'warning',
    title: 'Drops a constraint',
    regex: /\bdrop\s+constraint\b/i,
    detail: 'Constraint removal can change data integrity guarantees or relation behavior.',
  },
  {
    severity: 'warning',
    title: 'Renames schema objects',
    regex: /\brename\s+(?:to|column)\b/i,
    detail: 'Renames can break application code or scripts that still reference the old name.',
  },
];

function isSuccessfulBackupRun(run: BackupRun) {
  if (run.status !== 'succeeded') {
    return false;
  }

  const operation = run.details?.operation;
  return operation === undefined || operation === 'backup';
}

export function analyzeMigrationSafety(
  pending: MigrationRecord[],
  backupReadiness: MigrationBackupReadiness,
): MigrationSafetyReview {
  const concerns: MigrationSafetyConcern[] = [];

  for (const migration of pending) {
    for (const rule of PATTERN_RULES) {
      if (!rule.regex.test(migration.sql)) {
        continue;
      }

      concerns.push({
        severity: rule.severity,
        title: rule.title,
        detail: rule.detail,
        migrationKey: migration.key,
        migrationTitle: migration.title,
      });
    }
  }

  const destructiveCount = concerns.filter((item) => item.severity === 'destructive').length;
  const warningCount = concerns.length - destructiveCount;
  const hasBackup = Boolean(backupReadiness.latestSuccessfulBackupAt);

  const level =
    destructiveCount > 0 ? 'destructive' : warningCount > 0 ? 'warning' : 'safe';

  const summary =
    pending.length === 0
      ? 'No pending migrations.'
      : level === 'destructive'
        ? `${destructiveCount} destructive change${destructiveCount === 1 ? '' : 's'} detected across ${pending.length} pending migration${pending.length === 1 ? '' : 's'}.`
        : level === 'warning'
          ? `${warningCount} migration change${warningCount === 1 ? '' : 's'} need extra review before apply.`
          : `${pending.length} pending migration${pending.length === 1 ? '' : 's'} look routine based on the current SQL preview.`;

  const guidance = [
    hasBackup
      ? `Latest successful backup: ${new Date(backupReadiness.latestSuccessfulBackupAt!).toLocaleString()}.`
      : 'No successful backup is recorded yet. Take one before applying risky migrations.',
    backupReadiness.enabled
      ? `Backups are enabled and currently targeting ${backupReadiness.destination}.`
      : 'Scheduled backups are disabled. Manual backup is the only recovery path right now.',
    destructiveCount > 0
      ? 'Rollback is not a one-click undo for forward migrations. Recovery means restoring a backup, then reverting the migration source before applying again.'
      : 'If apply fails part-way through authoring work, fix the migration source, preview again, and only then rerun apply.',
  ];

  return {
    level,
    summary,
    concerns,
    guidance,
    requiresSqlReview: pending.length > 0,
    requiresBackupConfirmation: pending.length > 0 && (destructiveCount > 0 || !hasBackup),
    requiresRollbackConfirmation: destructiveCount > 0,
  };
}

export function deriveMigrationBackupReadiness(input: {
  enabled: boolean;
  destination: string | null | undefined;
  runs: BackupRun[];
}): MigrationBackupReadiness {
  const latestSuccessfulBackup = input.runs.find(isSuccessfulBackupRun);

  return {
    enabled: input.enabled,
    destination: input.destination?.trim() ? input.destination : 'configured storage',
    latestSuccessfulBackupAt: latestSuccessfulBackup?.completedAt ?? latestSuccessfulBackup?.startedAt ?? null,
  };
}

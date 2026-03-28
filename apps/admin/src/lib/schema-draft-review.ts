import type { FieldBlueprint, RelationBlueprint, SchemaDraft, TableBlueprint } from '@authend/shared';

export type SchemaDraftReviewChange = {
  severity: 'info' | 'warning' | 'destructive';
  title: string;
  detail: string;
};

export type SchemaDraftReviewSummary = {
  level: 'safe' | 'warning' | 'destructive';
  changes: SchemaDraftReviewChange[];
  destructive: boolean;
};

function tableMap(tables: TableBlueprint[]) {
  return new Map(tables.map((table) => [table.name, table]));
}

function fieldMap(fields: FieldBlueprint[]) {
  return new Map(fields.map((field) => [field.name, field]));
}

function relationKey(relation: RelationBlueprint) {
  return `${relation.sourceTable}:${relation.sourceField}:${relation.targetTable}:${relation.targetField}:${relation.alias ?? ''}`;
}

function relationMap(relations: RelationBlueprint[]) {
  return new Map(relations.map((relation) => [relationKey(relation), relation]));
}

export function summarizeSchemaDraftReview(current: SchemaDraft, next: SchemaDraft): SchemaDraftReviewSummary {
  const changes: SchemaDraftReviewChange[] = [];
  const currentTables = tableMap(current.tables);
  const nextTables = tableMap(next.tables);

  for (const [tableName, nextTable] of nextTables) {
    const existing = currentTables.get(tableName);
    if (!existing) {
      changes.push({
        severity: 'info',
        title: `Create table ${tableName}`,
        detail: `${nextTable.fields.length} fields will be created.`,
      });
      continue;
    }

    const existingFields = fieldMap(existing.fields);
    const nextFields = fieldMap(nextTable.fields);

    for (const [fieldName, field] of nextFields) {
      const previous = existingFields.get(fieldName);
      if (!previous) {
        changes.push({
          severity: 'info',
          title: `Add field ${tableName}.${fieldName}`,
          detail: `${field.type}${field.nullable ? ', optional' : ', required'}${field.default ? `, default ${field.default}` : ''}.`,
        });
        continue;
      }

      if (previous.type !== field.type) {
        changes.push({
          severity: 'destructive',
          title: `Change field type ${tableName}.${fieldName}`,
          detail: `${previous.type} -> ${field.type}. Existing rows may no longer cast cleanly.`,
        });
      }

      if (previous.nullable && !field.nullable) {
        changes.push({
          severity: 'warning',
          title: `Make field required ${tableName}.${fieldName}`,
          detail: 'Existing null rows will block the migration unless they are fixed first.',
        });
      }

      if ((previous.default ?? '') !== (field.default ?? '')) {
        changes.push({
          severity: 'info',
          title: `Change default ${tableName}.${fieldName}`,
          detail: `${previous.default ?? 'no default'} -> ${field.default ?? 'no default'}.`,
        });
      }
    }

    for (const [fieldName] of existingFields) {
      if (!nextFields.has(fieldName)) {
        changes.push({
          severity: 'destructive',
          title: `Drop field ${tableName}.${fieldName}`,
          detail: 'This removes stored column data from the table.',
        });
      }
    }

    const previousIndexes = new Set(existing.indexes.map((columns) => columns.join(',')));
    const nextIndexes = new Set(nextTable.indexes.map((columns) => columns.join(',')));
    for (const columns of nextIndexes) {
      if (!previousIndexes.has(columns)) {
        changes.push({
          severity: 'info',
          title: `Add index ${tableName}(${columns})`,
          detail: 'This adds a compound index for lookup or sorting.',
        });
      }
    }
    for (const columns of previousIndexes) {
      if (!nextIndexes.has(columns)) {
        changes.push({
          severity: 'warning',
          title: `Remove index ${tableName}(${columns})`,
          detail: 'This can change query performance for existing reads.',
        });
      }
    }

    if (JSON.stringify(existing.api) !== JSON.stringify(nextTable.api)) {
      changes.push({
        severity: 'warning',
        title: `Update API rules for ${tableName}`,
        detail: 'Access rules, route metadata, or query capabilities will change.',
      });
    }

    if (JSON.stringify(existing.hooks) !== JSON.stringify(nextTable.hooks)) {
      changes.push({
        severity: 'warning',
        title: `Update hooks for ${tableName}`,
        detail: 'Record automation behavior will change for this table.',
      });
    }
  }

  for (const [tableName] of currentTables) {
    if (!nextTables.has(tableName)) {
      changes.push({
        severity: 'destructive',
        title: `Drop table ${tableName}`,
        detail: 'This removes the table and its rows. Recovery means restoring a backup.',
      });
    }
  }

  const currentRelations = relationMap(current.relations);
  const nextRelations = relationMap(next.relations);

  for (const [key, relation] of nextRelations) {
    if (!currentRelations.has(key)) {
      changes.push({
        severity: 'info',
        title: `Add relation ${relation.sourceTable}.${relation.sourceField} -> ${relation.targetTable}.${relation.targetField}`,
        detail: `Join alias ${relation.alias ?? 'none'} will become available to the API and SDK.`,
      });
    }
  }

  for (const [key, relation] of currentRelations) {
    if (!nextRelations.has(key)) {
      changes.push({
        severity: 'destructive',
        title: `Remove relation ${relation.sourceTable}.${relation.sourceField} -> ${relation.targetTable}.${relation.targetField}`,
        detail: 'Includes and foreign-key behavior for this relation will be removed.',
      });
    }
  }

  const destructive = changes.some((change) => change.severity === 'destructive');
  const warning = changes.some((change) => change.severity === 'warning');

  return {
    level: destructive ? 'destructive' : warning ? 'warning' : 'safe',
    changes,
    destructive,
  };
}

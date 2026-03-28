import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { SYSTEM_TABLES } from '../lib/tables';

import { useNavigate } from '@tanstack/react-router';
import {
  analyseTableApiPolicyWarnings,
  buildTableApiAccessPreset,
  detectTableApiAccessPreset,
  suggestOwnershipField,
  tableApiPolicyPresets,
} from '@authend/shared';
import type {
  ApiAccessActor,
  ApiFieldVisibilityRule,
  ApiPreviewOperation,
  FieldBlueprint,
  RelationBlueprint,
  SchemaDraft,
  TableApiAccess,
  TableApiConfig,
  TableApiPolicyPreset,
  TableBlueprint,
  TableHook,
  TableDescriptor,
} from '@authend/shared';
import { client } from '../lib/client';
import { summarizeSchemaDraftReview } from '../lib/schema-draft-review';
import { SidePanel } from './ui/side-panel';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CodeBlock } from './ui/code-block';
import { TooltipComponent as Tooltip } from './ui/tooltip';
import { Input } from './ui/input';
import { getErrorMessage, useFeedback } from './ui/feedback';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Globe,
  Link2,
  Lock,
  Mail,
  Plus,
  Route,
  Settings2,
  Slack,
  SlidersHorizontal,
  Trash2,
  Zap,
} from 'lucide-react';

type EditableField = FieldBlueprint;
type EditableRelation = RelationBlueprint & {
  sourceFieldMode: 'existing' | 'auto';
  generatedSourceField: string;
};
type TablePreset = {
  id: string;
  label: string;
  description: string;
  create: () => {
    name: string;
    displayName: string;
    fields: EditableField[];
    indexes: string[][];
    apiConfig: TableApiConfig;
  };
};
type FieldTemplate = {
  id: string;
  label: string;
  create: () => EditableField;
};

const tableEditorTabs = [
  { key: 'fields', label: 'Fields' },
  { key: 'api', label: 'API Rules' },
  { key: 'hooks', label: 'Hooks' },
] as const;

const accessActors: ApiAccessActor[] = ['public', 'session', 'apiKey', 'superadmin'];
const appFacingFieldActors: ApiAccessActor[] = ['public', 'session', 'apiKey'];
const operationKeys: ApiPreviewOperation['key'][] = ['list', 'get', 'create', 'update', 'delete'];
const queryCapabilityKeys = ['hiddenFields', 'pagination', 'filtering', 'sorting', 'includes'] as const;

type QueryCapabilityKey = (typeof queryCapabilityKeys)[number];

async function invalidateSchemaQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['schema'] }),
    queryClient.invalidateQueries({ queryKey: ['tables'] }),
    queryClient.invalidateQueries({ queryKey: ['table-meta'] }),
    queryClient.invalidateQueries({ queryKey: ['records'] }),
    queryClient.invalidateQueries({ queryKey: ['table-catalog'] }),
  ]);
}

function emptyField(): EditableField {
  return {
    name: '',
    type: 'text',
    nullable: true,
    default: '',
    unique: false,
    indexed: false,
    size: 255,
    enumValues: [],
  };
}

function booleanDefaultValue(value: boolean) {
  return value ? 'true' : 'false';
}

function defaultTableApiConfig(): TableApiConfig {
  return {
    authMode: 'superadmin',
    access: buildTableApiAccessPreset('adminOnly'),
    operations: {
      list: true,
      get: true,
      create: true,
      update: true,
      delete: true,
    },
    pagination: {
      enabled: true,
      defaultPageSize: 20,
      maxPageSize: 100,
    },
    filtering: {
      enabled: true,
      fields: [],
    },
    sorting: {
      enabled: true,
      fields: [],
      defaultField: 'id',
      defaultOrder: 'desc',
    },
    includes: {
      enabled: true,
      fields: [],
    },
    hiddenFields: [],
    fieldVisibility: {},
    routeSegment: null,
    sdkName: null,
    tag: null,
    description: null,
  };
}

const tablePresets: TablePreset[] = [
  {
    id: 'content',
    label: 'Content',
    description: 'Title/body publishing flow with slug and publish date.',
    create: () => ({
      name: 'posts',
      displayName: 'Posts',
      fields: [
        { name: 'title', type: 'text', nullable: false, default: '', unique: false, indexed: false, size: 255, enumValues: [] },
        { name: 'slug', type: 'varchar', nullable: false, default: '', unique: true, indexed: true, size: 160, enumValues: [] },
        { name: 'status', type: 'enum', nullable: false, default: 'draft', unique: false, indexed: true, size: 255, enumValues: ['draft', 'published', 'archived'] },
        { name: 'body', type: 'text', nullable: true, default: '', unique: false, indexed: false, size: 255, enumValues: [] },
        { name: 'published_at', type: 'timestamp', nullable: true, default: '', unique: false, indexed: true, size: 255, enumValues: [] },
      ],
      indexes: [['status', 'published_at']],
      apiConfig: {
        ...defaultTableApiConfig(),
        authMode: 'public',
        access: buildTableApiAccessPreset('publicReadOnly'),
        routeSegment: 'posts',
        sdkName: 'posts',
        tag: 'content',
      },
    }),
  },
  {
    id: 'profile',
    label: 'Profile',
    description: 'One-user-owned profile or preferences table.',
    create: () => ({
      name: 'profiles',
      displayName: 'Profiles',
      fields: [
        { name: 'user_id', type: 'uuid', nullable: false, default: '', unique: true, indexed: true, size: 255, enumValues: [] },
        { name: 'display_name', type: 'varchar', nullable: true, default: '', unique: false, indexed: false, size: 120, enumValues: [] },
        { name: 'bio', type: 'text', nullable: true, default: '', unique: false, indexed: false, size: 255, enumValues: [] },
        { name: 'avatar_url', type: 'text', nullable: true, default: '', unique: false, indexed: false, size: 255, enumValues: [] },
      ],
      indexes: [],
      apiConfig: {
        ...defaultTableApiConfig(),
        authMode: 'session',
        access: buildTableApiAccessPreset('sessionPrivate', 'user_id'),
        routeSegment: 'profiles',
        sdkName: 'profiles',
        tag: 'users',
      },
    }),
  },
  {
    id: 'lookup',
    label: 'Lookup',
    description: 'Small reusable list such as categories or statuses.',
    create: () => ({
      name: 'categories',
      displayName: 'Categories',
      fields: [
        { name: 'name', type: 'varchar', nullable: false, default: '', unique: true, indexed: true, size: 120, enumValues: [] },
        { name: 'slug', type: 'varchar', nullable: false, default: '', unique: true, indexed: true, size: 120, enumValues: [] },
        { name: 'sort_order', type: 'integer', nullable: false, default: '0', unique: false, indexed: true, size: 255, enumValues: [] },
      ],
      indexes: [['sort_order', 'name']],
      apiConfig: {
        ...defaultTableApiConfig(),
        authMode: 'public',
        access: buildTableApiAccessPreset('publicReadOnly'),
        routeSegment: 'categories',
        sdkName: 'categories',
        tag: 'lookup',
      },
    }),
  },
  {
    id: 'join',
    label: 'Join table',
    description: 'Two foreign keys plus created-at for many-to-many links.',
    create: () => ({
      name: 'memberships',
      displayName: 'Memberships',
      fields: [
        { name: 'left_id', type: 'uuid', nullable: false, default: '', unique: false, indexed: true, size: 255, enumValues: [] },
        { name: 'right_id', type: 'uuid', nullable: false, default: '', unique: false, indexed: true, size: 255, enumValues: [] },
        { name: 'created_at', type: 'timestamp', nullable: false, default: 'now()', unique: false, indexed: true, size: 255, enumValues: [] },
      ],
      indexes: [['left_id', 'right_id']],
      apiConfig: {
        ...defaultTableApiConfig(),
        routeSegment: 'memberships',
        sdkName: 'memberships',
        tag: 'relations',
      },
    }),
  },
];

const fieldTemplates: FieldTemplate[] = [
  {
    id: 'email',
    label: 'Email',
    create: () => ({ name: 'email', type: 'varchar', nullable: false, default: '', unique: true, indexed: true, size: 255, enumValues: [] }),
  },
  {
    id: 'slug',
    label: 'Slug',
    create: () => ({ name: 'slug', type: 'varchar', nullable: false, default: '', unique: true, indexed: true, size: 160, enumValues: [] }),
  },
  {
    id: 'status',
    label: 'Status enum',
    create: () => ({ name: 'status', type: 'enum', nullable: false, default: 'draft', unique: false, indexed: true, size: 255, enumValues: ['draft', 'published', 'archived'] }),
  },
  {
    id: 'published_at',
    label: 'Published at',
    create: () => ({ name: 'published_at', type: 'timestamp', nullable: true, default: '', unique: false, indexed: true, size: 255, enumValues: [] }),
  },
  {
    id: 'owner_id',
    label: 'Owner id',
    create: () => ({ name: 'owner_id', type: 'uuid', nullable: false, default: '', unique: false, indexed: true, size: 255, enumValues: [] }),
  },
];

function defaultSuggestions(field: EditableField) {
  switch (field.type) {
    case 'uuid':
      return ['gen_random_uuid()'];
    case 'timestamp':
      return ['now()'];
    case 'date':
      return ['current_date'];
    case 'boolean':
      return [booleanDefaultValue(false), booleanDefaultValue(true)];
    case 'integer':
    case 'bigint':
    case 'numeric':
      return ['0', '1'];
    case 'enum':
      return field.enumValues?.length ? [field.enumValues[0]] : [];
    default:
      return [];
  }
}

function actorLabel(actor: ApiAccessActor) {
  switch (actor) {
    case 'public':
      return 'Public';
    case 'session':
      return 'Session';
    case 'apiKey':
      return 'API Key';
    default:
      return 'Superadmin';
  }
}

function actorDescription(actor: ApiAccessActor) {
  switch (actor) {
    case 'public':
      return 'No auth required';
    case 'session':
      return 'Signed-in users';
    case 'apiKey':
      return 'Keys with route permission';
    default:
      return 'Full admin access';
  }
}

function operationLabel(operation: ApiPreviewOperation['key']) {
  switch (operation) {
    case 'list':
      return 'List';
    case 'get':
      return 'Get';
    case 'create':
      return 'Create';
    case 'update':
      return 'Update';
    default:
      return 'Delete';
  }
}

function joinLabels(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? '';
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function describeAccess(access: TableApiAccess) {
  const byActor = new Map<ApiAccessActor, string[]>();

  for (const operation of operationKeys) {
    const rule = access[operation];
    for (const actor of rule.actors) {
      const label =
        rule.scope === 'own' && actor !== 'superadmin'
          ? `${operationLabel(operation).toLowerCase()} own`
          : operationLabel(operation).toLowerCase();
      const current = byActor.get(actor) ?? [];
      current.push(label);
      byActor.set(actor, current);
    }
  }

  const parts = accessActors
    .filter((actor) => byActor.has(actor))
    .map((actor) => `${actorLabel(actor)} can ${joinLabels(byActor.get(actor) ?? [])}`);

  const ownOperations = operationKeys.filter((operation) => access[operation].scope === 'own');
  if (access.ownershipField && ownOperations.length > 0) {
    parts.push(
      `Owner checks use ${access.ownershipField} for ${joinLabels(ownOperations.map((operation) => operationLabel(operation).toLowerCase()))}`,
    );
  }

  return parts.join('. ');
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function defaultFieldVisibilityRule(): ApiFieldVisibilityRule {
  return {
    read: [...appFacingFieldActors],
    create: [...appFacingFieldActors],
    update: [...appFacingFieldActors],
  };
}

function FieldToggleList({
  fields,
  selected,
  disabled,
  emptyLabel,
  onToggle,
}: {
  fields: string[];
  selected: string[];
  disabled: boolean;
  emptyLabel: string;
  onToggle: (field: string) => void;
}) {
  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {fields.map((field) => {
        const checked = selected.includes(field);
        return (
          <label
            key={field}
            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-foreground/30 bg-muted/30' : 'border-border/70'} ${
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            }`}
          >
            <span className="font-mono text-xs">{field}</span>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(field)}
              disabled={disabled}
              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
            />
          </label>
        );
      })}
    </div>
  );
}

function normaliseIdentifier(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function buildGeneratedSourceFieldName(targetTable: string, targetField: string, alias?: string | null) {
  const base = normaliseIdentifier(alias || targetTable || 'relation');
  const suffix = normaliseIdentifier(targetField || 'id');
  return suffix === 'id' ? `${base}_id` : `${base}_${suffix}`;
}

function emptyRelation(sourceTable: string, targetTable: string): EditableRelation {
  return {
    sourceTable,
    sourceField: '',
    targetTable,
    targetField: 'id',
    alias: '',
    sourceAlias: '',
    targetAlias: '',
    joinType: 'left',
    onDelete: 'no action',
    onUpdate: 'no action',
    description: '',
    sourceFieldMode: 'auto',
    generatedSourceField: buildGeneratedSourceFieldName(targetTable, 'id'),
  };
}

function relationLabel(relation: EditableRelation) {
  const sourceField = relation.sourceFieldMode === 'auto' ? relation.generatedSourceField : relation.sourceField;
  return relation.alias || `${sourceField || 'source'} -> ${relation.targetTable || 'target'}`;
}

function inferAutoField(
  relation: EditableRelation,
  tableCatalog: Record<string, TableDescriptor> | undefined,
): EditableField | null {
  const sourceFieldName = relation.generatedSourceField.trim();
  if (!sourceFieldName) {
    return null;
  }

  const targetField = tableCatalog?.[relation.targetTable]?.fields.find((field) => field.name === relation.targetField);
  if (!targetField) {
    return null;
  }

  return {
    name: sourceFieldName,
    type: targetField.type,
    nullable: relation.joinType !== 'inner',
    unique: false,
    indexed: true,
    default: undefined,
    size: targetField.type === 'varchar' ? targetField.size : undefined,
    enumValues: targetField.type === 'enum' ? targetField.enumValues : undefined,
  };
}

export function TableSchemaPanel({
  tableName,
  isOpen,
  onClose,
  onSuccess,
}: {
  tableName?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const isEditing = !!tableName;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showNotice, confirm } = useFeedback();

  const { data: schemaData, isLoading: isSchemaLoading } = useQuery({
    queryKey: ['schema'],
    queryFn: () => client.system.schema.get(),
    enabled: isOpen,
  });

  const { data: tableCatalog, isLoading: isCatalogLoading } = useQuery({
    queryKey: ['table-catalog'],
    queryFn: async () => {
      const response = await client.data.tables();
      const entries = await Promise.all(response.tables.map(async (table) => [table, await client.data.meta(table)] as const));
      return Object.fromEntries(entries) as Record<string, TableDescriptor>;
    },
    enabled: isOpen,
  });

  const schemaEditorRowIdRef = useRef(0);
  const nextSchemaEditorRowId = () => {
    schemaEditorRowIdRef.current += 1;
    return `schema-editor-row-${schemaEditorRowIdRef.current}`;
  };

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fields, setFields] = useState<EditableField[]>([]);
  const [fieldRowIds, setFieldRowIds] = useState<string[]>([]);
  const [collapsedFields, setCollapsedFields] = useState<boolean[]>([]);
  const [relations, setRelations] = useState<EditableRelation[]>([]);
  const [relationRowIds, setRelationRowIds] = useState<string[]>([]);
  const [collapsedRelations, setCollapsedRelations] = useState<boolean[]>([]);
  const [indexes, setIndexes] = useState<string[][]>([]);
  const [indexRowIds, setIndexRowIds] = useState<string[]>([]);
  const [apiConfig, setApiConfig] = useState<TableApiConfig>(defaultTableApiConfig());
  const [hooks, setHooks] = useState<TableHook[]>([]);
  const [activeTab, setActiveTab] = useState<(typeof tableEditorTabs)[number]['key']>('fields');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reviewState, setReviewState] = useState<{
    mode: 'save' | 'delete';
    nextDraft: SchemaDraft;
    previousDraft: SchemaDraft;
    sql: string[];
    warnings: string[];
    summary: ReturnType<typeof summarizeSchemaDraftReview>;
  } | null>(null);
  const [sqlReviewed, setSqlReviewed] = useState(false);
  const [destructiveAcknowledged, setDestructiveAcknowledged] = useState(false);
  const [collapsedQuerySections, setCollapsedQuerySections] = useState<Record<QueryCapabilityKey, boolean>>({
    hiddenFields: true,
    pagination: true,
    filtering: true,
    sorting: true,
    includes: true,
  });
  const [collapsedFieldVisibility, setCollapsedFieldVisibility] = useState<Record<string, boolean>>({});

  const toggleFieldVisibilityCollapsed = (field: string) => {
    setCollapsedFieldVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const editingDescriptor = useMemo(() => {
    if (!isEditing) {
      return null;
    }
    const key = tableName ?? '';
    return tableCatalog?.[key] ?? null;
  }, [isEditing, tableCatalog, tableName]);
  const canDeleteTable = !isEditing || editingDescriptor?.source === 'generated';

  const availableTableNames = useMemo(() => {
    const names = Object.keys(tableCatalog ?? {});
    if (!isEditing && name && !names.includes(name)) {
      return [name, ...names];
    }
    return names;
  }, [isEditing, name, tableCatalog]);

  const currentSourceTable = name || tableName || '';
  const sourceFieldOptions = useMemo(
    () => [
      'id',
      ...fields
        .map((field) => field.name.trim())
        .filter(Boolean)
        .filter((field, index, collection) => collection.indexOf(field) === index),
    ],
    [fields],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!isEditing) {
      return;
    }

    // Clear previous table state immediately when switching system tables,
    // so we don't show stale fields while the catalog/meta loads.
    setName(tableName ?? '');
    setDisplayName(tableName ?? '');
    setFields([]);
    setFieldRowIds([]);
    setCollapsedFields([]);
    setRelations([]);
    setRelationRowIds([]);
    setCollapsedRelations([]);
    setIndexes([]);
    setIndexRowIds([]);
    setApiConfig(defaultTableApiConfig());
    setHooks([]);
    setCollapsedFieldVisibility({});
  }, [isEditing, isOpen, tableName]);

  useEffect(() => {
    if (!isOpen || !schemaData) {
      return;
    }

    if (isEditing) {
      const table = schemaData.tables.find((entry) => entry.name === tableName);
      if (table) {
        setName(table.name);
        setDisplayName(table.displayName || table.name);
        const editableFields = table.fields
          .filter((field) => field.name !== table.primaryKey)
          .map((field) => ({
            ...field,
            default: field.default ?? '',
            unique: !!field.unique,
            indexed: !!field.indexed,
            nullable: !!field.nullable,
            size: field.size ?? 255,
            enumValues: field.enumValues ?? [],
          }));
        setFields(editableFields);
        setFieldRowIds(editableFields.map(() => nextSchemaEditorRowId()));
        setCollapsedFields(editableFields.map(() => true));
        const editableRelations = schemaData.relations
          .filter((relation) => relation.sourceTable === table.name)
          .map((relation) => ({
            ...relation,
            alias: relation.alias ?? '',
            sourceAlias: relation.sourceAlias ?? '',
            targetAlias: relation.targetAlias ?? '',
            joinType: relation.joinType ?? 'left',
            description: relation.description ?? '',
            sourceFieldMode: 'existing' as const,
            generatedSourceField: relation.sourceField,
          }));
        setRelations(editableRelations);
        setRelationRowIds(editableRelations.map(() => nextSchemaEditorRowId()));
        setCollapsedRelations(editableRelations.map(() => true));
        setIndexes(table.indexes ?? []);
        setIndexRowIds((table.indexes ?? []).map(() => nextSchemaEditorRowId()));
        setApiConfig({
          ...defaultTableApiConfig(),
          ...table.api,
          access: table.api?.access ?? defaultTableApiConfig().access,
          operations: table.api?.operations ?? defaultTableApiConfig().operations,
          pagination: table.api?.pagination ?? defaultTableApiConfig().pagination,
          filtering: table.api?.filtering ?? defaultTableApiConfig().filtering,
          sorting: table.api?.sorting ?? defaultTableApiConfig().sorting,
          includes: table.api?.includes ?? defaultTableApiConfig().includes,
        });
        setHooks(table.hooks || []);
        return;
      }

      const catalog = editingDescriptor;
      if (!catalog) {
        return;
      }

      setName(tableName ?? catalog.table);
      setDisplayName(catalog.table);
      const pk = catalog.primaryKey;
      const editableFields = catalog.fields
        .filter((field) => field.name !== pk)
        .map((field) => ({
          ...field,
          default: '',
          unique: !!field.unique,
          indexed: !!field.indexed,
          nullable: !!field.nullable,
          size: (field as { size?: number | null }).size ?? 255,
          enumValues: (field as { enumValues?: string[] | null }).enumValues ?? [],
        }));
      setFields(editableFields);
      setFieldRowIds(editableFields.map(() => nextSchemaEditorRowId()));
      setCollapsedFields(editableFields.map(() => true));
      setRelations([]);
      setRelationRowIds([]);
      setCollapsedRelations([]);
      setIndexes([]);
      setIndexRowIds([]);
      setApiConfig(defaultTableApiConfig());
      return;
    }

    setName('');
    setDisplayName('');
    setFields([]);
    setFieldRowIds([]);
    setCollapsedFields([]);
    setRelations([]);
    setRelationRowIds([]);
    setCollapsedRelations([]);
    setIndexes([]);
    setIndexRowIds([]);
    setApiConfig(defaultTableApiConfig());
  }, [editingDescriptor, isEditing, isOpen, schemaData, tableName]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('fields');
      setCollapsedQuerySections({
        hiddenFields: true,
        pagination: true,
        filtering: true,
        sorting: true,
        includes: true,
      });
    }
  }, [isOpen]);

  const handleAddField = () => {
    setFields((current) => [...current, emptyField()]);
    setFieldRowIds((current) => [...current, nextSchemaEditorRowId()]);
    setCollapsedFields((current) => [...current, false]);
  };

  const handleAddFieldTemplate = (template: FieldTemplate) => {
    setFields((current) => [...current, template.create()]);
    setFieldRowIds((current) => [...current, nextSchemaEditorRowId()]);
    setCollapsedFields((current) => [...current, false]);
  };

  const handleFieldChange = (index: number, key: keyof EditableField, value: unknown) => {
    setFields((current) =>
      current.map((field, fieldIndex) => {
        if (fieldIndex !== index) {
          return field;
        }

        const next = {
          ...field,
          [key]:
            key === 'name'
              ? String(value)
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, '')
              : value,
        } as EditableField;

        if (key === 'type' && value !== 'varchar') {
          next.size = undefined;
        }

        if (key === 'type' && value === 'varchar' && !next.size) {
          next.size = 255;
        }

        if (key === 'type' && value !== 'enum') {
          next.enumValues = [];
        }

        return next;
      }),
    );
  };

  const handleRemoveField = (index: number) => {
    setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
    setFieldRowIds((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
    setCollapsedFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  };

  const toggleFieldCollapsed = (index: number) => {
    setCollapsedFields((current) => current.map((collapsed, fieldIndex) => (fieldIndex === index ? !collapsed : collapsed)));
  };

  const setAllFieldsCollapsed = (collapsed: boolean) => {
    setCollapsedFields(fields.map(() => collapsed));
  };

  const handleAddRelation = () => {
    const initialTarget = availableTableNames.find((entry) => entry !== currentSourceTable) ?? 'user';
    setRelations((current) => [...current, emptyRelation(currentSourceTable, initialTarget)]);
    setRelationRowIds((current) => [...current, nextSchemaEditorRowId()]);
    setCollapsedRelations((current) => [...current, false]);
  };

  const handleAddQuickRelation = (targetTable: string, alias?: string) => {
    const nextRelation = emptyRelation(currentSourceTable, targetTable);
    if (alias) {
      nextRelation.alias = alias;
      nextRelation.generatedSourceField = buildGeneratedSourceFieldName(targetTable, nextRelation.targetField, alias);
    }
    setRelations((current) => [...current, nextRelation]);
    setRelationRowIds((current) => [...current, nextSchemaEditorRowId()]);
    setCollapsedRelations((current) => [...current, false]);
  };

  const handleRelationChange = (index: number, key: keyof EditableRelation, value: string) => {
    setRelations((current) =>
      current.map((relation, relationIndex) => {
        if (relationIndex !== index) {
          return relation;
        }

        const nextValue = key === 'alias' || key === 'sourceAlias' || key === 'targetAlias' ? normaliseIdentifier(value) : value;
        const next = { ...relation, [key]: nextValue } as EditableRelation;

        if (key === 'targetTable') {
          const targetFields = tableCatalog?.[value]?.fields ?? [];
          next.targetField = targetFields.some((field) => field.name === next.targetField)
            ? next.targetField
            : (targetFields[0]?.name ?? 'id');
          if (next.sourceFieldMode === 'auto' && !relation.alias) {
            next.generatedSourceField = buildGeneratedSourceFieldName(value, next.targetField, relation.alias);
          }
        }

        if (key === 'targetField' && next.sourceFieldMode === 'auto' && !relation.alias) {
          next.generatedSourceField = buildGeneratedSourceFieldName(next.targetTable, value, relation.alias);
        }

        if (key === 'alias' && next.sourceFieldMode === 'auto') {
          next.generatedSourceField = buildGeneratedSourceFieldName(next.targetTable, next.targetField, nextValue);
        }

        if (key === 'sourceFieldMode' && value === 'auto' && !next.generatedSourceField) {
          next.generatedSourceField = buildGeneratedSourceFieldName(next.targetTable, next.targetField, next.alias);
        }

        return next;
      }),
    );
  };

  const handleRemoveRelation = (index: number) => {
    setRelations((current) => current.filter((_, relationIndex) => relationIndex !== index));
    setRelationRowIds((current) => current.filter((_, relationIndex) => relationIndex !== index));
    setCollapsedRelations((current) => current.filter((_, relationIndex) => relationIndex !== index));
  };

  const toggleRelationCollapsed = (index: number) => {
    setCollapsedRelations((current) =>
      current.map((collapsed, relationIndex) => (relationIndex === index ? !collapsed : collapsed)),
    );
  };

  const setAllRelationsCollapsed = (collapsed: boolean) => {
    setCollapsedRelations(relations.map(() => collapsed));
  };

  const handleAddIndex = () => {
    setIndexes((current) => [...current, []]);
    setIndexRowIds((current) => [...current, nextSchemaEditorRowId()]);
  };

  const handleRemoveIndex = (index: number) => {
    setIndexes((current) => current.filter((_, indexPosition) => indexPosition !== index));
    setIndexRowIds((current) => current.filter((_, indexPosition) => indexPosition !== index));
  };

  const toggleIndexField = (index: number, field: string) => {
    setIndexes((current) =>
      current.map((columns, indexPosition) => {
        if (indexPosition !== index) {
          return columns;
        }
        return toggleListValue(columns, field);
      }),
    );
  };

  const applyTablePreset = (preset: TablePreset) => {
    if (isEditing) {
      return;
    }

    const next = preset.create();
    setName(next.name);
    setDisplayName(next.displayName);
    setFields(next.fields);
    setFieldRowIds(next.fields.map(() => nextSchemaEditorRowId()));
    setCollapsedFields(next.fields.map(() => true));
    setRelations([]);
    setRelationRowIds([]);
    setCollapsedRelations([]);
    setIndexes(next.indexes);
    setIndexRowIds(next.indexes.map(() => nextSchemaEditorRowId()));
    setApiConfig(next.apiConfig);
    setHooks([]);
    setActiveTab('fields');
  };

  const toggleQuerySectionCollapsed = (section: QueryCapabilityKey) => {
    setCollapsedQuerySections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const setAllQuerySectionsCollapsed = (collapsed: boolean) => {
    setCollapsedQuerySections({
      hiddenFields: collapsed,
      pagination: collapsed,
      filtering: collapsed,
      sorting: collapsed,
      includes: collapsed,
    });
  };

  const emptyHook = (): TableHook => ({
    id: crypto.randomUUID(),
    eventType: 'afterCreate',
    type: 'webhook',
    blocking: false,
    enabled: true,
    url: '',
    config: {},
  });

  const handleAddHook = () => {
    setHooks((current) => [...current, emptyHook()]);
  };

  const handleHookChange = (index: number, key: keyof TableHook, value: unknown) => {
    setHooks((current) =>
      current.map((hook, hookIndex) => {
        if (hookIndex !== index) {
          return hook;
        }

        const next = { ...hook, [key]: value } as TableHook;

        if (key === 'type') {
          if (value === 'webhook') {
            next.recipeId = undefined;
            next.url = next.url || '';
          } else {
            next.url = undefined;
            next.recipeId = next.recipeId || 'send_email';
          }
        }

        return next;
      }),
    );
  };

  const handleRemoveHook = (index: number) => {
    setHooks((current) => current.filter((_, hookIndex) => hookIndex !== index));
  };

  const buildTableDraft = (): TableBlueprint => {
    const manualFields = fields
      .filter((field) => String(field.name ?? '').trim().length > 0)
      .map((field) => ({
        ...field,
        default: field.default ? String(field.default) : undefined,
        size: field.type === 'varchar' ? Number(field.size || 255) : undefined,
        enumValues: field.type === 'enum' ? (field.enumValues ?? []).map((value) => value.trim()).filter(Boolean) : undefined,
      }));

    const autoFields = relations
      .filter((relation) => relation.sourceFieldMode === 'auto')
      .map((relation) => {
        const inferred = inferAutoField(relation, tableCatalog);
        if (!inferred) {
          throw new Error(
            `Could not infer a foreign key field for relation ${relation.alias || relation.targetTable}. Select a valid target table and field.`,
          );
        }
        return inferred;
      })
      .filter((field): field is EditableField => Boolean(field))
      .filter((field, index, collection) => collection.findIndex((entry) => entry.name === field.name) === index)
      .filter((field) => !manualFields.some((entry) => entry.name === field.name));

    const resolvedPrimaryKey = editingDescriptor?.primaryKey ?? 'id';
    const primaryKeyField =
      editingDescriptor?.fields.find((field) => field.name === resolvedPrimaryKey) ??
      ({
        name: 'id',
        type: 'uuid',
        nullable: false,
        unique: true,
        indexed: true,
        default: 'gen_random_uuid()',
      } as FieldBlueprint);

    return {
      name,
      displayName: displayName || name,
      primaryKey: resolvedPrimaryKey,
      indexes: indexes.filter((columns) => columns.length > 0),
      fields: [primaryKeyField, ...manualFields.filter((field) => field.name !== resolvedPrimaryKey), ...autoFields],
      api: {
        ...apiConfig,
        routeSegment: apiConfig.routeSegment || undefined,
        sdkName: apiConfig.sdkName || undefined,
        tag: apiConfig.tag || undefined,
        description: apiConfig.description || undefined,
      },
      hooks,
    };
  };

  const buildRelationDraft = () =>
    relations
      .map((relation) => ({
        ...relation,
        sourceField: relation.sourceFieldMode === 'auto' ? relation.generatedSourceField.trim() : relation.sourceField,
      }))
      .filter((relation) => relation.sourceField && relation.targetTable && relation.targetField)
      .map((relation) => {
        const { sourceFieldMode: _sourceFieldMode, generatedSourceField: _generatedSourceField, ...persistedRelation } = relation;

        return {
          ...persistedRelation,
          sourceTable: currentSourceTable || name,
          alias: relation.alias ? relation.alias.trim() : undefined,
          sourceAlias: relation.sourceAlias ? relation.sourceAlias.trim() : undefined,
          targetAlias: relation.targetAlias ? relation.targetAlias.trim() : undefined,
          description: relation.description ? relation.description.trim() : undefined,
        };
      });

  const availableFieldNames = useMemo(() => {
    const manual = fields.map((field) => field.name.trim()).filter(Boolean);
    const inferred = relations
      .filter((relation) => relation.sourceFieldMode === 'auto')
      .map((relation) => inferAutoField(relation, tableCatalog)?.name ?? '')
      .filter(Boolean);
    return Array.from(new Set([...manual, ...inferred]));
  }, [fields, relations, tableCatalog]);
  const filterableFieldNames = useMemo(
    () =>
      ['id', ...availableFieldNames]
        .filter((field, index, collection) => collection.indexOf(field) === index)
        .filter((field) => !apiConfig.hiddenFields.includes(field)),
    [availableFieldNames, apiConfig.hiddenFields],
  );

  const availableSortFields = apiConfig.sorting.fields;
  const visibleFieldOptions = useMemo(
    () => ['id', ...availableFieldNames].filter((field, index, collection) => collection.indexOf(field) === index),
    [availableFieldNames],
  );
  const hasOwnScopedOperation = operationKeys.some((operation) => apiConfig.access[operation].scope === 'own');
  const routeSegment = apiConfig.routeSegment || name;
  const accessSummary = describeAccess(apiConfig.access);
  const selectedPolicyPreset = detectTableApiAccessPreset(apiConfig.access);
  const suggestedOwnershipField = suggestOwnershipField(availableFieldNames);
  const policyWarnings = analyseTableApiPolicyWarnings(apiConfig.access, {
    filteringEnabled: apiConfig.filtering.enabled,
    filteringFields: apiConfig.filtering.fields,
    includesEnabled: apiConfig.includes.enabled,
    includeFields: apiConfig.includes.fields,
    hiddenFields: apiConfig.hiddenFields,
  });

  const updateApiOperationEnabled = (operation: keyof TableApiConfig['operations'], enabled: boolean) => {
    setApiConfig((current) => ({
      ...current,
      operations: {
        ...current.operations,
        [operation]: enabled,
      },
    }));
  };

  const updateAccessActors = (operation: ApiPreviewOperation['key'], actor: ApiAccessActor, checked: boolean) => {
    setApiConfig((current) => {
      const nextActors: ApiAccessActor[] = checked
        ? Array.from(new Set<ApiAccessActor>([...current.access[operation].actors, actor]))
        : current.access[operation].actors.filter((entry): entry is ApiAccessActor => entry !== actor);

      return {
        ...current,
        access: {
          ...current.access,
          [operation]: {
            ...current.access[operation],
            actors: nextActors,
            scope:
              actor === 'public' && checked && current.access[operation].scope === 'own'
                ? 'all'
                : current.access[operation].scope,
          },
        },
      };
    });
  };

  const updateAccessScope = (operation: ApiPreviewOperation['key'], scope: 'all' | 'own') => {
    setApiConfig((current) => ({
      ...current,
      access: {
        ...current.access,
        [operation]: {
          ...current.access[operation],
          actors:
            scope === 'own'
              ? current.access[operation].actors.filter((actor) => actor !== 'public')
              : current.access[operation].actors,
          scope,
        },
      },
    }));
  };

  const applyPolicyPreset = (preset: TableApiPolicyPreset) => {
    const presetDefinition = tableApiPolicyPresets.find((entry) => entry.id === preset);
    const ownershipField = presetDefinition?.ownershipRequired
      ? (apiConfig.access.ownershipField ?? suggestedOwnershipField)
      : null;

    if (presetDefinition?.ownershipRequired && !ownershipField) {
      showNotice({
        title: 'Owner field required',
        description: 'Add a field like owner_id or user_id first, then apply an owner-scoped policy preset.',
        variant: 'destructive',
      });
      return;
    }

    setApiConfig((current) => ({
      ...current,
      access: buildTableApiAccessPreset(preset, ownershipField),
    }));
  };

  const toggleFilterField = (field: string) => {
    setApiConfig((current) => ({
      ...current,
      filtering: {
        ...current.filtering,
        fields: toggleListValue(current.filtering.fields, field),
      },
    }));
  };

  const toggleSortField = (field: string) => {
    setApiConfig((current) => {
      const nextFields = toggleListValue(current.sorting.fields, field);
      return {
        ...current,
        sorting: {
          ...current.sorting,
          fields: nextFields,
          defaultField: nextFields.includes(current.sorting.defaultField ?? '')
            ? current.sorting.defaultField
            : (nextFields[0] ?? ''),
        },
      };
    });
  };

  const toggleIncludeField = (field: string) => {
    setApiConfig((current) => ({
      ...current,
      includes: {
        ...current.includes,
        fields: toggleListValue(current.includes.fields, field),
      },
    }));
  };

  const toggleHiddenField = (field: string) => {
    setApiConfig((current) => {
      const hiddenFields = toggleListValue(current.hiddenFields, field);
      const visibleFields = ['id', ...availableFieldNames]
        .filter((entry, index, collection) => collection.indexOf(entry) === index)
        .filter((entry) => !hiddenFields.includes(entry));
      const nextSortFields = current.sorting.fields.filter((entry) => visibleFields.includes(entry));
      const nextFilterFields = current.filtering.fields.filter((entry) => visibleFields.includes(entry));

      return {
        ...current,
        hiddenFields,
        filtering: {
          ...current.filtering,
          fields: nextFilterFields,
        },
        sorting: {
          ...current.sorting,
          fields: nextSortFields,
          defaultField: nextSortFields.includes(current.sorting.defaultField ?? '')
            ? current.sorting.defaultField
            : (nextSortFields[0] ?? ''),
        },
      };
    });
  };

  const fieldVisibilityActors = (field: string, operation: keyof ApiFieldVisibilityRule) =>
    apiConfig.fieldVisibility[field]?.[operation] ?? defaultFieldVisibilityRule()[operation];

  const toggleFieldVisibilityActor = (field: string, operation: keyof ApiFieldVisibilityRule, actor: ApiAccessActor) => {
    setApiConfig((current) => {
      const existing = current.fieldVisibility[field] ?? defaultFieldVisibilityRule();
      const nextActors = toggleListValue(existing[operation], actor) as ApiAccessActor[];

      return {
        ...current,
        fieldVisibility: {
          ...current.fieldVisibility,
          [field]: {
            ...existing,
            [operation]: nextActors,
          },
        },
      };
    });
  };

  const resetReview = () => {
    setReviewState(null);
    setSqlReviewed(false);
    setDestructiveAcknowledged(false);
  };

  const applyReviewedDraft = async (input: { nextDraft: SchemaDraft; previousDraft: SchemaDraft; mode: 'save' | 'delete' }) => {
    try {
      if (input.mode === 'save') {
        setIsSaving(true);
      } else {
        setIsDeleting(true);
      }

      await client.system.schema.apply(input.nextDraft);
      await invalidateSchemaQueries(queryClient);

      onSuccess?.();
      onClose();
      resetReview();
      void navigate({ to: '/data', search: { table: input.mode === 'delete' ? 'user' : name, page: undefined, pageSize: undefined } });

      showNotice({
        title: input.mode === 'delete' ? `Deleted ${tableName}` : isEditing ? `Saved ${name}` : `Created ${name}`,
        description:
          input.mode === 'delete'
            ? 'Undo reapplies the previous schema draft only. Recreated tables will be empty unless you restore from a backup.'
            : 'Undo reapplies the previous schema draft only (no full-table row snapshot). Use backups for large or critical data.',
        variant: 'success',
        durationMs: 30000,
        actionLabel: 'Undo',
        onAction: async () => {
          await client.system.schema.apply(input.previousDraft);
          await invalidateSchemaQueries(queryClient);
          onSuccess?.();
          void navigate({ to: '/data', search: { table: tableName ?? 'user', page: undefined, pageSize: undefined } });
        },
      });
    } catch (error) {
      showNotice({
        title: input.mode === 'delete' ? 'Failed to delete table' : 'Failed to save schema',
        description: getErrorMessage(error, input.mode === 'delete' ? 'The table could not be deleted.' : 'The schema change could not be applied.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      setIsDeleting(false);
    }
  };

  const startReview = async (input: { nextDraft: SchemaDraft; previousDraft: SchemaDraft; mode: 'save' | 'delete' }) => {
    try {
      if (input.mode === 'save') {
        setIsSaving(true);
      } else {
        setIsDeleting(true);
      }

      const preview = await client.system.schema.preview(input.nextDraft);
      const summary = summarizeSchemaDraftReview(input.previousDraft, input.nextDraft);
      setReviewState({
        mode: input.mode,
        nextDraft: input.nextDraft,
        previousDraft: input.previousDraft,
        sql: preview.sql,
        warnings: preview.warnings,
        summary,
      });
      setSqlReviewed(false);
      setDestructiveAcknowledged(false);
      setActiveTab('fields');
    } catch (error) {
      showNotice({
        title: 'Preview failed',
        description: getErrorMessage(error, 'The schema preview could not be generated.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      setIsDeleting(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showNotice({
        title: 'Table name is required',
        description: 'Enter a lowercase identifier before saving the table.',
        variant: 'destructive',
      });
      return;
    }

    if (!schemaData) {
      showNotice({
        title: 'Schema metadata is still loading',
        description: 'Wait a moment for the live draft to load, then try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const previousDraft = schemaData;
      const newTable = buildTableDraft();
      const newRelations = buildRelationDraft();
      const baseDraft: SchemaDraft = schemaData;
      const relationSourceName = tableName ?? name;

      const nextTables = [...baseDraft.tables];
      if (isEditing) {
        const existingIndex = nextTables.findIndex((table) => table.name === tableName);
        if (existingIndex === -1) {
          nextTables.push(newTable);
        } else {
          nextTables[existingIndex] = newTable;
        }
      } else {
        nextTables.push(newTable);
      }

      const nextRelations = [
        ...baseDraft.relations.filter((relation) => relation.sourceTable !== relationSourceName),
        ...newRelations,
      ];

      await startReview({
        mode: 'save',
        previousDraft,
        nextDraft: {
        ...baseDraft,
        tables: nextTables,
        relations: nextRelations,
        },
      });
    } catch (error) {
      showNotice({
        title: 'Failed to save schema',
        description: getErrorMessage(error, 'The schema change could not be applied.'),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!schemaData || !tableName) {
      return;
    }
    if (!canDeleteTable) {
      showNotice({
        title: 'Table cannot be deleted',
        description: 'Only generated tables can be deleted.',
        variant: 'destructive',
      });
      return;
    }

    const confirmed = await confirm({
      title: `Delete ${tableName}?`,
      description:
        'This drops the table and related joins. Undo restores the previous schema only; dropped row data is not reloaded from the client.',
      confirmLabel: 'Delete table',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) {
      return;
    }

    try {
      const previousDraft = schemaData;
      const baseDraft: SchemaDraft = schemaData;

      await startReview({
        mode: 'delete',
        previousDraft,
        nextDraft: {
        ...baseDraft,
        tables: baseDraft.tables.filter((table) => table.name !== tableName),
        relations: baseDraft.relations.filter(
          (relation) => relation.sourceTable !== tableName && relation.targetTable !== tableName,
        ),
        },
      });
    } catch {}
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing
          ? SYSTEM_TABLES.includes(tableName!)
            ? `Edit System Table - ${tableName}`
            : `Edit Table - ${tableName}`
          : 'New Table'
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {isEditing && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={isDeleting || isSchemaLoading || !canDeleteTable}
                title={canDeleteTable ? 'Delete table' : 'Only generated tables can be deleted'}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Table
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>
              Cancel
            </Button>
            {reviewState ? (
              <>
                <Button variant="outline" onClick={resetReview} disabled={isSaving || isDeleting}>
                  Back to edit
                </Button>
                <Button
                  onClick={() => void applyReviewedDraft(reviewState)}
                  disabled={
                    isSaving ||
                    isDeleting ||
                    !sqlReviewed ||
                    (reviewState.summary.destructive && !destructiveAcknowledged)
                  }
                >
                  {reviewState.mode === 'delete'
                    ? isDeleting
                      ? 'Deleting...'
                      : 'Confirm delete'
                    : isSaving
                      ? 'Applying...'
                      : 'Apply reviewed changes'}
                </Button>
              </>
            ) : (
              <Button onClick={handleSubmit} disabled={isSaving || isDeleting || isSchemaLoading || isCatalogLoading}>
                {isSaving ? 'Previewing...' : isEditing ? 'Review changes' : 'Review creation'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8 pb-10">
        {reviewState ? (
          <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Review before apply</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  SQL preview, before/after summary, and destructive-change acknowledgements are required before schema apply.
                </p>
              </div>
              <Badge variant={reviewState.summary.level === 'destructive' ? 'destructive' : 'secondary'}>
                {reviewState.summary.level}
              </Badge>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Change summary</div>
                  <div className="mt-3 space-y-2">
                    {reviewState.summary.changes.length > 0 ? (
                      reviewState.summary.changes.map((change, index) => (
                        <div key={`${change.title}-${index}`} className="rounded-lg border border-border/60 bg-background px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-foreground">{change.title}</div>
                            <Badge variant={change.severity === 'destructive' ? 'destructive' : 'secondary'}>
                              {change.severity}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{change.detail}</div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-border/60 bg-background px-3 py-3 text-sm text-muted-foreground">
                        No structural diff detected beyond metadata normalization.
                      </div>
                    )}
                  </div>
                </div>

                {reviewState.warnings.length > 0 ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-700">Server warnings</div>
                    <div className="mt-3 space-y-2">
                      {reviewState.warnings.map((warning, index) => (
                        <div key={`${warning}-${index}`} className="text-sm text-foreground">
                          {warning}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-xl border border-border/60 bg-background p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Required before apply</div>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-start gap-3 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={sqlReviewed}
                        onChange={(event) => setSqlReviewed(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                      />
                      <span>I reviewed the generated SQL and understand what will run.</span>
                    </label>
                    {reviewState.summary.destructive ? (
                      <label className="flex items-start gap-3 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={destructiveAcknowledged}
                          onChange={(event) => setDestructiveAcknowledged(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                        />
                        <span>I understand this can remove or invalidate data. Recovery means backups and rollback work, not undo from the browser.</span>
                      </label>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20">
                <div className="border-b border-border/60 px-3 py-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SQL preview</div>
                </div>
                <CodeBlock code={reviewState.sql.join('\n\n') || '-- No SQL changes --'} language="sql" className="max-h-[520px] overflow-auto p-3 text-xs" />
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. posts"
              value={name}
              onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="font-mono text-sm"
              disabled={isEditing}
            />
            <span className="text-[11px] text-muted-foreground">Unique lowercase identifier for the table.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-foreground">Display Name</label>
            <Input
              placeholder="e.g. Blog Posts"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="text-sm"
            />
          </div>

          {!isEditing ? (
            <div className="grid gap-3 border-t border-border/60 pt-4">
              <div className="flex flex-col gap-1">
                <label className="text-[13px] font-bold text-foreground">Guided start</label>
                <p className="text-[11px] text-muted-foreground">Use a starter template, then adjust fields, relations, and API rules visually.</p>
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {tablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyTablePreset(preset)}
                    className="rounded-xl border border-border/70 px-3 py-3 text-left transition hover:border-foreground/20 hover:bg-muted/20"
                  >
                    <div className="text-sm font-semibold text-foreground">{preset.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{preset.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background p-2">
          {tableEditorTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'fields' && (
          <>
            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Fields / Columns
                </h3>
                <div className="flex items-center gap-3">
                  {fields.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllFieldsCollapsed(false)}>
                        Expand all
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllFieldsCollapsed(true)}>
                        Collapse all
                      </Button>
                    </div>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{fields.length} active</span>
                </div>
              </div>

              <div className="grid gap-3">
                {fields.map((field, index) => (
                  <div key={fieldRowIds[index] ?? index} className="rounded-xl border border-border/60 bg-muted/20">
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFieldCollapsed(index)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {collapsedFields[index] ? (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate font-mono text-xs font-semibold">{field.name || `field_${index + 1}`}</span>
                        <span className="rounded-md border border-border/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {field.type}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {[
                            field.nullable ? 'optional' : 'required',
                            field.unique ? 'unique' : null,
                            field.indexed ? 'indexed' : null,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      </button>
                      <Tooltip content="Remove field">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleRemoveField(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    </div>

                    {!collapsedFields[index] && (
                      <div className="grid gap-3 border-t border-border/60 px-3 py-3">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px]">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Field Name
                            </label>
                            <Input
                              value={field.name}
                              onChange={(event) => handleFieldChange(index, 'name', event.target.value)}
                              placeholder="column_name"
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</label>
                            <select
                              className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              value={field.type}
                              onChange={(event) => handleFieldChange(index, 'type', event.target.value)}
                            >
                              <option value="text">Text</option>
                              <option value="varchar">Varchar</option>
                              <option value="integer">Integer</option>
                              <option value="bigint">BigInt</option>
                              <option value="numeric">Numeric</option>
                              <option value="boolean">Boolean</option>
                              <option value="jsonb">JSON</option>
                              <option value="uuid">UUID</option>
                              <option value="date">Date</option>
                              <option value="timestamp">Timestamp</option>
                              <option value="enum">Enum</option>
                            </select>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Default
                            </label>
                            <Input
                              value={field.default ?? ''}
                              onChange={(event) => handleFieldChange(index, 'default', event.target.value)}
                              placeholder="optional"
                              className="h-9 font-mono text-xs"
                            />
                            {defaultSuggestions(field).length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {defaultSuggestions(field).map((suggestion) => (
                                  <button
                                    key={`${field.name || index}-${suggestion}`}
                                    type="button"
                                    onClick={() => handleFieldChange(index, 'default', suggestion)}
                                    className="rounded-md border border-border/70 px-2 py-1 font-mono text-[10px] text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-5">
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!field.nullable}
                              onChange={(event) => handleFieldChange(index, 'nullable', !event.target.checked)}
                              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                            />
                            Required
                          </label>
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!!field.unique}
                              onChange={(event) => handleFieldChange(index, 'unique', event.target.checked)}
                              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                            />
                            Unique
                          </label>
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!!field.indexed}
                              onChange={(event) => handleFieldChange(index, 'indexed', event.target.checked)}
                              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                            />
                            Index
                          </label>
                        </div>

                        {field.type === 'varchar' && (
                          <div className="grid gap-1.5 md:w-[180px]">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Max Length
                            </label>
                            <Input
                              type="number"
                              min={1}
                              value={field.size ?? 255}
                              onChange={(event) =>
                                handleFieldChange(index, 'size', event.target.value ? Number(event.target.value) : 255)
                              }
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                        )}

                        {field.type === 'enum' && (
                          <div className="grid gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Enum Values
                            </label>
                            <Input
                              value={(field.enumValues ?? []).join(', ')}
                              onChange={(event) =>
                                handleFieldChange(
                                  index,
                                  'enumValues',
                                  event.target.value
                                    .split(',')
                                    .map((value) => value.trim())
                                    .filter(Boolean),
                                )
                              }
                              placeholder="draft, published, archived"
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleAddField} className="border-dashed">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Field
                </Button>
                {fieldTemplates.map((template) => (
                  <Button key={template.id} variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => handleAddFieldTemplate(template)}>
                    {template.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  Relations / SQL Joins
                </h3>
                <div className="flex items-center gap-3">
                  {relations.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setAllRelationsCollapsed(false)}
                      >
                        Expand all
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setAllRelationsCollapsed(true)}
                      >
                        Collapse all
                      </Button>
                    </div>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{relations.length} defined</span>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                Define named joins from this table to any existing table. Aliases become the stable relation names for include
                rules and client-side query composition.
              </div>

              <div className="flex flex-wrap gap-2">
                {availableTableNames
                  .filter((entry) => entry !== currentSourceTable)
                  .slice(0, 4)
                  .map((entry) => (
                    <Button
                      key={`quick-relation-${entry}`}
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => handleAddQuickRelation(entry, entry === 'user' ? 'owner' : undefined)}
                    >
                      Link to {entry}
                    </Button>
                  ))}
              </div>

              <div className="grid gap-3">
                {relations.map((relation, index) => {
                  const targetFields =
                    relation.targetTable === currentSourceTable
                      ? sourceFieldOptions.map((field) => ({ name: field }))
                      : (tableCatalog?.[relation.targetTable]?.fields ?? []);
                  const sourceField = relation.sourceFieldMode === 'auto' ? relation.generatedSourceField : relation.sourceField;
                  const relationSummary = [
                    relation.joinType.toUpperCase(),
                    relation.targetTable || 'target',
                    relation.targetField ? `on ${relation.targetField}` : null,
                    sourceField ? `via ${sourceField}` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ');

                  return (
                    <div key={relationRowIds[index] ?? index} className="rounded-xl border border-border/60 bg-muted/20">
                      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleRelationCollapsed(index)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          {collapsedRelations[index] ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate font-mono text-xs font-semibold">{relationLabel(relation)}</span>
                          <span className="text-[11px] text-muted-foreground">{relationSummary}</span>
                        </button>
                        <Tooltip content="Remove relation">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleRemoveRelation(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                      </div>

                      {!collapsedRelations[index] && (
                        <div className="grid gap-4 border-t border-border/60 px-3 py-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Alias
                              </label>
                              <Input
                                value={relation.alias ?? ''}
                                onChange={(event) => handleRelationChange(index, 'alias', event.target.value)}
                                placeholder="author"
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Join Type
                              </label>
                              <select
                                value={relation.joinType}
                                onChange={(event) => handleRelationChange(index, 'joinType', event.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              >
                                <option value="left">LEFT JOIN</option>
                                <option value="inner">INNER JOIN</option>
                                <option value="right">RIGHT JOIN</option>
                                <option value="full">FULL JOIN</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Source Binding
                              </label>
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  <input
                                    type="radio"
                                    checked={relation.sourceFieldMode === 'existing'}
                                    onChange={() => handleRelationChange(index, 'sourceFieldMode', 'existing')}
                                    className="h-4 w-4 accent-primary"
                                  />
                                  Existing Field
                                </label>
                                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  <input
                                    type="radio"
                                    checked={relation.sourceFieldMode === 'auto'}
                                    onChange={() => handleRelationChange(index, 'sourceFieldMode', 'auto')}
                                    className="h-4 w-4 accent-primary"
                                  />
                                  Auto-create FK
                                </label>
                              </div>
                            </div>
                            {relation.sourceFieldMode === 'auto' && (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Generated Source Field
                                </label>
                                <Input
                                  value={relation.generatedSourceField}
                                  onChange={(event) =>
                                    handleRelationChange(index, 'generatedSourceField', normaliseIdentifier(event.target.value))
                                  }
                                  placeholder="author_id"
                                  className="h-9 font-mono text-xs"
                                />
                              </div>
                            )}
                          </div>

                          <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-4">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Source Field
                              </label>
                              {relation.sourceFieldMode === 'existing' ? (
                                <select
                                  value={relation.sourceField}
                                  onChange={(event) => handleRelationChange(index, 'sourceField', event.target.value)}
                                  className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                                >
                                  <option value="">Select field</option>
                                  {sourceFieldOptions.map((field) => (
                                    <option key={field} value={field}>
                                      {field}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <div className="flex h-9 items-center rounded-md border border-border bg-background px-3 font-mono text-xs text-muted-foreground">
                                  {relation.generatedSourceField || 'generated field'}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Target Table
                              </label>
                              <select
                                value={relation.targetTable}
                                onChange={(event) => handleRelationChange(index, 'targetTable', event.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              >
                                {availableTableNames.map((entry) => (
                                  <option key={entry} value={entry}>
                                    {entry}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Target Field
                              </label>
                              <select
                                value={relation.targetField}
                                onChange={(event) => handleRelationChange(index, 'targetField', event.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              >
                                <option value="">Select field</option>
                                {targetFields.map((field) => (
                                  <option key={field.name} value={field.name}>
                                    {field.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Description
                              </label>
                              <Input
                                value={relation.description ?? ''}
                                onChange={(event) => handleRelationChange(index, 'description', event.target.value)}
                                placeholder="Optional"
                                className="h-9 text-xs"
                              />
                            </div>
                          </div>

                          {relation.sourceFieldMode === 'auto' && (
                            <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                              New field preview:{' '}
                              <span className="font-mono text-foreground">
                                {relation.generatedSourceField || 'generated_field'}
                              </span>
                              {' · '}
                              {inferAutoField(relation, tableCatalog)?.type ?? 'unknown'} {' · '}
                              {relation.joinType === 'inner' ? 'required' : 'nullable'} {' · indexed'}
                            </div>
                          )}

                          <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Source Alias
                              </label>
                              <Input
                                value={relation.sourceAlias ?? ''}
                                onChange={(event) => handleRelationChange(index, 'sourceAlias', event.target.value)}
                                placeholder="posts"
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Target Alias
                              </label>
                              <Input
                                value={relation.targetAlias ?? ''}
                                onChange={(event) => handleRelationChange(index, 'targetAlias', event.target.value)}
                                placeholder="users"
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                On Delete
                              </label>
                              <select
                                value={relation.onDelete}
                                onChange={(event) => handleRelationChange(index, 'onDelete', event.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              >
                                <option value="no action">NO ACTION</option>
                                <option value="restrict">RESTRICT</option>
                                <option value="cascade">CASCADE</option>
                                <option value="set null">SET NULL</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                On Update
                              </label>
                              <select
                                value={relation.onUpdate}
                                onChange={(event) => handleRelationChange(index, 'onUpdate', event.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              >
                                <option value="no action">NO ACTION</option>
                                <option value="restrict">RESTRICT</option>
                                <option value="cascade">CASCADE</option>
                                <option value="set null">SET NULL</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button variant="outline" size="sm" onClick={handleAddRelation} className="border-dashed">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Relation
              </Button>
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Compound Indexes
                </h3>
                <span className="font-mono text-xs text-muted-foreground">{indexes.length} defined</span>
              </div>

              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                Use compound indexes for common filter and sort paths. Single-field unique and indexed flags still live on each field.
              </div>

              <div className="grid gap-3">
                {indexes.map((columns, index) => (
                  <div key={indexRowIds[index] ?? index} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">
                        {columns.length > 0 ? columns.join(', ') : `Index ${index + 1}`}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemoveIndex(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {['id', ...availableFieldNames]
                        .filter((field, fieldIndex, collection) => collection.indexOf(field) === fieldIndex)
                        .map((field) => (
                          <label
                            key={`index-${index}-${field}`}
                            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                              columns.includes(field) ? 'border-foreground/30 bg-background' : 'border-border/70 bg-background'
                            }`}
                          >
                            <span className="font-mono">{field}</span>
                            <input
                              type="checkbox"
                              checked={columns.includes(field)}
                              onChange={() => toggleIndexField(index, field)}
                              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                            />
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
                {indexes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                    No compound indexes yet. Add one for multi-column lookup or sorting paths.
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleAddIndex} className="border-dashed">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Index
                </Button>
                {availableFieldNames.includes('slug') ? (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setIndexes((current) => [...current, ['slug']])}>
                    Add slug index
                  </Button>
                ) : null}
                {availableFieldNames.includes('status') && availableFieldNames.includes('published_at') ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setIndexes((current) => [...current, ['status', 'published_at']])}
                  >
                    Add status + published_at
                  </Button>
                ) : null}
              </div>
            </section>
          </>
        )}

        {activeTab === 'api' && (
          <>
            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Route className="h-4 w-4 text-muted-foreground" />
                Endpoint Design
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Route Segment</label>
                  <Input
                    value={apiConfig.routeSegment ?? ''}
                    onChange={(event) =>
                      setApiConfig((current) => ({
                        ...current,
                        routeSegment: normaliseIdentifier(event.target.value),
                      }))
                    }
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    SDK Resource Name
                  </label>
                  <Input
                    value={apiConfig.sdkName ?? ''}
                    onChange={(event) =>
                      setApiConfig((current) => ({
                        ...current,
                        sdkName: normaliseIdentifier(event.target.value),
                      }))
                    }
                    className="h-9 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tag</label>
                  <Input
                    value={apiConfig.tag ?? ''}
                    onChange={(event) =>
                      setApiConfig((current) => ({
                        ...current,
                        tag: event.target.value,
                      }))
                    }
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Route Base</label>
                  <div className="flex h-9 items-center rounded-md border border-border bg-background px-3 font-mono text-xs text-muted-foreground">
                    /api/data/{routeSegment || name || 'table_name'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                <Input
                  value={apiConfig.description ?? ''}
                  onChange={(event) =>
                    setApiConfig((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="h-9 text-xs"
                />
              </div>
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Access Policy
              </div>
              <div className="grid gap-2 lg:grid-cols-2">
                {tableApiPolicyPresets.map((preset) => {
                  const active = selectedPolicyPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPolicyPreset(preset.id)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        active
                          ? 'border-foreground/30 bg-muted/30'
                          : 'border-border/70 hover:border-foreground/20 hover:bg-muted/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-foreground">{preset.label}</div>
                        {active ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {accessSummary}
              </div>
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                App-facing actors are configured here. Superadmin sessions always bypass these rules on admin routes and data
                requests.
              </div>
              {policyWarnings.length > 0 ? (
                <div className="grid gap-2">
                  {policyWarnings.map((warning) => (
                    <div key={warning.id} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Policy warning</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{warning.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{warning.description}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {hasOwnScopedOperation && (
                <div className="grid gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Ownership Field
                    </label>
                    <select
                      value={apiConfig.access.ownershipField ?? ''}
                      onChange={(event) =>
                        setApiConfig((current) => ({
                          ...current,
                          access: {
                            ...current.access,
                            ownershipField: event.target.value || null,
                          },
                        }))
                      }
                      className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                    >
                      <option value="">Select field</option>
                      <option value="id">id</option>
                      {availableFieldNames.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Owner-scoped operations compare the current subject id against this field.
                    {suggestedOwnershipField ? ` Suggested field: ${suggestedOwnershipField}.` : ''}
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                {operationKeys.map((operation) => (
                  <div key={operation} className="grid gap-2 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{operationLabel(operation)}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          resource:{routeSegment || name || 'table'}:{operation}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-4">
                      {accessActors
                        .filter((actor) => actor !== 'superadmin')
                        .map((actor) => {
                          const checked = apiConfig.access[operation].actors.includes(actor);
                          const isDisabled = apiConfig.access[operation].scope === 'own' && actor === 'public';
                          return (
                            <label
                              key={`${operation}-${actor}`}
                              title={actorDescription(actor)}
                              className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                                checked ? 'bg-muted/30' : ''
                              } ${isDisabled ? 'opacity-60' : 'cursor-pointer hover:bg-muted/20'}`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold leading-tight text-foreground">{actorLabel(actor)}</div>
                                <div className="truncate text-[10px] leading-tight text-muted-foreground">
                                  {actorDescription(actor)}
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => updateAccessActors(operation, actor, event.target.checked)}
                                disabled={isDisabled}
                                className="h-4 w-4 shrink-0 rounded-sm border-muted-foreground/40 accent-primary"
                              />
                            </label>
                          );
                        })}
                      <label
                        title="Only the record owner can do this"
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                          apiConfig.access[operation].scope === 'own' ? 'bg-muted/30' : 'hover:bg-muted/20'
                        } ${!availableFieldNames.length ? 'opacity-60' : 'cursor-pointer'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold leading-tight text-foreground">Owner Only</div>
                          <div className="truncate text-[10px] leading-tight text-muted-foreground">
                            Only the record owner can do this
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={apiConfig.access[operation].scope === 'own'}
                          onChange={(event) => {
                            if (event.target.checked && !apiConfig.access.ownershipField) {
                              const preferredOwnerField = [
                                'owner_id',
                                'user_id',
                                'author_id',
                                'created_by',
                                'created_by_id',
                              ].find((field) => availableFieldNames.includes(field));

                              if (!preferredOwnerField) {
                                showNotice({
                                  title: 'Owner field required',
                                  description: 'Add a field like owner_id or user_id first, then enable owner-only access.',
                                  variant: 'destructive',
                                });
                                return;
                              }

                              setApiConfig((current) => ({
                                ...current,
                                access: {
                                  ...current.access,
                                  ownershipField: preferredOwnerField,
                                },
                              }));
                            }

                            updateAccessScope(operation, event.target.checked ? 'own' : 'all');
                          }}
                          disabled={!availableFieldNames.length}
                          className="h-4 w-4 shrink-0 rounded-sm border-muted-foreground/40 accent-primary"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-4">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Field Visibility
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        visibleFieldOptions.forEach((f) => (all[f] = false));
                        setCollapsedFieldVisibility(all);
                      }}
                    >
                      Expand all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const all: Record<string, boolean> = {};
                        visibleFieldOptions.forEach((f) => (all[f] = true));
                        setCollapsedFieldVisibility(all);
                      }}
                    >
                      Collapse all
                    </Button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Unchecked means admin-only</span>
                </div>
              </div>

              <div className="grid gap-2">
                {visibleFieldOptions.map((field) => {
                  const isCollapsed = collapsedFieldVisibility[field] !== undefined ? collapsedFieldVisibility[field] : true;
                  return (
                    <div key={field} className="rounded-xl border border-border/60 bg-muted/20">
                      <button
                        type="button"
                        onClick={() => toggleFieldVisibilityCollapsed(field)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-xs font-semibold text-foreground">{field}</div>
                          {apiConfig.hiddenFields.includes(field) && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Hidden
                            </span>
                          )}
                        </div>
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                      {!isCollapsed && (
                        <div className="grid gap-3 border-t border-border/60 px-3 py-3 md:grid-cols-3">
                          {(['read', 'create', 'update'] as const).map((operation) => (
                            <div
                              key={`${field}-${operation}`}
                              className="grid gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                            >
                              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {operation}
                              </div>
                              <div className="grid gap-1">
                                {appFacingFieldActors.map((actor) => {
                                  const checked = fieldVisibilityActors(field, operation).includes(actor);
                                  const disabled = field === 'id' && operation !== 'read';
                                  return (
                                    <label
                                      key={`${field}-${operation}-${actor}`}
                                      className={`flex items-center justify-between gap-2 text-xs ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                                    >
                                      <span>{actorLabel(actor)}</span>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={disabled}
                                        onChange={() => toggleFieldVisibilityActor(field, operation, actor)}
                                        className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {visibleFieldOptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
                    Add fields first to configure field-level visibility.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-4">
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  Query Capabilities
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setAllQuerySectionsCollapsed(false)}
                    >
                      Expand all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setAllQuerySectionsCollapsed(true)}
                    >
                      Collapse all
                    </Button>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{queryCapabilityKeys.length} sections</span>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-xl border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => toggleQuerySectionCollapsed('hiddenFields')}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Hidden Response Fields</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.hiddenFields.length} field{apiConfig.hiddenFields.length === 1 ? '' : 's'} hidden from
                        responses
                      </div>
                    </div>
                    {collapsedQuerySections.hiddenFields ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {!collapsedQuerySections.hiddenFields && (
                    <div className="grid gap-2 border-t border-border/60 px-3 py-3">
                      <div className="text-[11px] text-muted-foreground">
                        Selected fields are stripped from API responses, metadata, SDK record shapes, and included relations.
                      </div>
                      <FieldToggleList
                        fields={['id', ...availableFieldNames].filter(
                          (field, index, collection) => collection.indexOf(field) === index,
                        )}
                        selected={apiConfig.hiddenFields}
                        disabled={false}
                        emptyLabel="Add fields first to hide them from responses."
                        onToggle={toggleHiddenField}
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => toggleQuerySectionCollapsed('pagination')}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Pagination</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.pagination.enabled
                          ? `${apiConfig.pagination.defaultPageSize} default / ${apiConfig.pagination.maxPageSize} max`
                          : 'Disabled'}
                      </div>
                    </div>
                    {collapsedQuerySections.pagination ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {!collapsedQuerySections.pagination && (
                    <div className="grid gap-3 border-t border-border/60 px-3 py-3 md:grid-cols-3">
                      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={apiConfig.pagination.enabled}
                          onChange={(event) =>
                            setApiConfig((current) => ({
                              ...current,
                              pagination: {
                                ...current.pagination,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                          className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                        />
                        Pagination
                      </label>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Default Page Size
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={String(apiConfig.pagination.defaultPageSize)}
                          onChange={(event) =>
                            setApiConfig((current) => ({
                              ...current,
                              pagination: {
                                ...current.pagination,
                                defaultPageSize: Number(event.target.value || '20'),
                              },
                            }))
                          }
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Max Page Size
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={250}
                          value={String(apiConfig.pagination.maxPageSize)}
                          onChange={(event) =>
                            setApiConfig((current) => ({
                              ...current,
                              pagination: {
                                ...current.pagination,
                                maxPageSize: Number(event.target.value || '100'),
                              },
                            }))
                          }
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => toggleQuerySectionCollapsed('filtering')}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Filtering</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.filtering.enabled
                          ? `${apiConfig.filtering.fields.length} field${apiConfig.filtering.fields.length === 1 ? '' : 's'} enabled`
                          : 'Disabled'}
                      </div>
                    </div>
                    {collapsedQuerySections.filtering ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {!collapsedQuerySections.filtering && (
                    <div className="grid gap-2 border-t border-border/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">Filtering</div>
                        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={apiConfig.filtering.enabled}
                            onChange={(event) =>
                              setApiConfig((current) => ({
                                ...current,
                                filtering: {
                                  ...current.filtering,
                                  enabled: event.target.checked,
                                },
                              }))
                            }
                            className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                          />
                          Enabled
                        </label>
                      </div>
                      <FieldToggleList
                        fields={filterableFieldNames}
                        selected={apiConfig.filtering.fields}
                        disabled={!apiConfig.filtering.enabled}
                        emptyLabel="Add fields first to configure filtering."
                        onToggle={toggleFilterField}
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => toggleQuerySectionCollapsed('sorting')}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Sorting</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.sorting.enabled
                          ? `${apiConfig.sorting.fields.length} field${apiConfig.sorting.fields.length === 1 ? '' : 's'} enabled`
                          : 'Disabled'}
                      </div>
                    </div>
                    {collapsedQuerySections.sorting ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {!collapsedQuerySections.sorting && (
                    <div className="grid gap-2 border-t border-border/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">Sorting</div>
                        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={apiConfig.sorting.enabled}
                            onChange={(event) =>
                              setApiConfig((current) => ({
                                ...current,
                                sorting: {
                                  ...current.sorting,
                                  enabled: event.target.checked,
                                },
                              }))
                            }
                            className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                          />
                          Enabled
                        </label>
                      </div>
                      <FieldToggleList
                        fields={filterableFieldNames}
                        selected={apiConfig.sorting.fields}
                        disabled={!apiConfig.sorting.enabled}
                        emptyLabel="Add fields first to configure sorting."
                        onToggle={toggleSortField}
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Default Sort Field
                          </label>
                          <select
                            value={apiConfig.sorting.defaultField ?? ''}
                            onChange={(event) =>
                              setApiConfig((current) => ({
                                ...current,
                                sorting: {
                                  ...current.sorting,
                                  defaultField: event.target.value,
                                },
                              }))
                            }
                            disabled={!apiConfig.sorting.enabled || availableSortFields.length === 0}
                            className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                          >
                            <option value="">Select field</option>
                            {availableSortFields.map((field) => (
                              <option key={field} value={field}>
                                {field}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Default Order
                          </label>
                          <select
                            value={apiConfig.sorting.defaultOrder}
                            onChange={(event) =>
                              setApiConfig((current) => ({
                                ...current,
                                sorting: {
                                  ...current.sorting,
                                  defaultOrder: event.target.value as 'asc' | 'desc',
                                },
                              }))
                            }
                            disabled={!apiConfig.sorting.enabled}
                            className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                          >
                            <option value="desc">Descending</option>
                            <option value="asc">Ascending</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/20">
                  <button
                    type="button"
                    onClick={() => toggleQuerySectionCollapsed('includes')}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Relation Includes</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.includes.enabled
                          ? `${apiConfig.includes.fields.length} relation${apiConfig.includes.fields.length === 1 ? '' : 's'} enabled`
                          : 'Disabled'}
                      </div>
                    </div>
                    {collapsedQuerySections.includes ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {!collapsedQuerySections.includes && (
                    <div className="grid gap-2 border-t border-border/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">Relation Includes</div>
                        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={apiConfig.includes.enabled}
                            onChange={(event) =>
                              setApiConfig((current) => ({
                                ...current,
                                includes: {
                                  ...current.includes,
                                  enabled: event.target.checked,
                                },
                              }))
                            }
                            className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                          />
                          Enabled
                        </label>
                      </div>
                      <FieldToggleList
                        fields={relations
                          .map(
                            (relation) =>
                              relation.alias ||
                              (relation.sourceFieldMode === 'auto' ? relation.generatedSourceField : relation.sourceField),
                          )
                          .filter(Boolean)}
                        selected={apiConfig.includes.fields}
                        disabled={!apiConfig.includes.enabled}
                        emptyLabel="Add relations under Fields to configure includes."
                        onToggle={toggleIncludeField}
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-3 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                Operation Matrix
              </div>
              {operationKeys.map((operation) => (
                <div
                  key={operation}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">{operationLabel(operation)}</div>
                    <div className="font-mono text-xs text-muted-foreground">/api/data/{routeSegment || name || 'table'}</div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={apiConfig.operations[operation]}
                      onChange={(event) => updateApiOperationEnabled(operation, event.target.checked)}
                      className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                    />
                    Enabled
                  </label>
                </div>
              ))}
            </section>
          </>
        )}

        {activeTab === 'hooks' && (
          <section className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Record Triggers & Automations
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Configure actions to run when records are created, updated, or deleted.
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11px]" onClick={handleAddHook}>
                <Plus className="w-3.5 h-3.5" />
                Add Hook
              </Button>
            </div>

            <div className="grid gap-3">
              {hooks.map((hook, index) => (
                <div key={hook.id} className="rounded-2xl border border-border/60 bg-background overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-muted/10">
                    <div
                      className={`p-1.5 rounded-lg ${hook.enabled ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'}`}
                    >
                      {hook.type === 'webhook' ? (
                        <Globe className="w-4 h-4" />
                      ) : hook.recipeId === 'slack_notification' ? (
                        <Slack className="w-4 h-4" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono uppercase tracking-tight">
                          {hook.eventType.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                        {!hook.enabled && (
                          <span className="text-[9px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded uppercase">
                            Disabled
                          </span>
                        )}
                        {hook.blocking && (
                          <span className="text-[9px] font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded uppercase">
                            Blocking
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {hook.type === 'webhook' ? hook.url : `${hook.recipeId} recipe`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveHook(index)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Event</label>
                        <select
                          value={hook.eventType}
                          onChange={(e) => handleHookChange(index, 'eventType', e.target.value)}
                          className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                        >
                          {['beforeCreate', 'afterCreate', 'beforeUpdate', 'afterUpdate', 'beforeDelete', 'afterDelete'].map(
                            (ev) => (
                              <option key={ev} value={ev}>
                                {ev}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Action Type
                        </label>
                        <select
                          value={hook.type}
                          onChange={(e) => handleHookChange(index, 'type', e.target.value)}
                          className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                        >
                          <option value="webhook">Webhook (External URL)</option>
                          <option value="recipe">Internal Recipe (Automation)</option>
                        </select>
                      </div>
                    </div>

                    {hook.type === 'webhook' ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Webhook URL
                        </label>
                        <Input
                          placeholder="https://api.example.com/hooks/..."
                          value={hook.url || ''}
                          onChange={(e) => handleHookChange(index, 'url', e.target.value)}
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Automation Recipe
                        </label>
                        <select
                          value={hook.recipeId || ''}
                          onChange={(e) => handleHookChange(index, 'recipeId', e.target.value)}
                          className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                        >
                          <option value="send_email">Send Email Notification</option>
                          <option value="slack_notification">Send Slack Message</option>
                        </select>
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-2 border-t border-border/40">
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hook.enabled}
                          onChange={(e) => handleHookChange(index, 'enabled', e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-muted-foreground/30 accent-primary"
                        />
                        Enabled
                      </label>
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hook.blocking}
                          onChange={(e) => handleHookChange(index, 'blocking', e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-muted-foreground/30 accent-primary"
                        />
                        Blocking
                      </label>
                      <div className="flex-1 text-[10px] text-muted-foreground italic text-right">
                        {hook.blocking ? 'Stops transaction on failure' : 'Runs in background'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {hooks.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center bg-muted/5">
                  <Zap className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <div className="text-sm font-semibold text-muted-foreground">No hooks configured</div>
                  <p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px] mx-auto">
                    Automate your data lifecycle with triggers and recipes.
                  </p>
                  <Button variant="outline" size="sm" className="mt-4 h-8 gap-1.5" onClick={handleAddHook}>
                    <Plus className="w-3.5 h-3.5" />
                    Get Started
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </SidePanel>
  );
}

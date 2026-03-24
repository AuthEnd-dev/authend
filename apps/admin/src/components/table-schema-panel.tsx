import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  analyseTableApiPolicyWarnings,
  buildTableApiAccessPreset,
  detectTableApiAccessPreset,
  suggestOwnershipField,
  tableApiPolicyPresets,
} from "@authend/shared";
import type {
  ApiAccessActor,
  ApiPreviewOperation,
  DataRecord,
  FieldBlueprint,
  RelationBlueprint,
  SchemaDraft,
  TableApiAccess,
  TableApiConfig,
  TableApiPolicyPreset,
  TableBlueprint,
  TableDescriptor,
} from "@authend/shared";
import { client } from "../lib/client";
import { SidePanel } from "./ui/side-panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { getErrorMessage, useFeedback } from "./ui/feedback";
import { ChevronDown, ChevronRight, Code2, Link2, Lock, Plus, Route, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";

type EditableField = FieldBlueprint;
type EditableRelation = RelationBlueprint & {
  sourceFieldMode: "existing" | "auto",
  generatedSourceField: string,
};

const tableEditorTabs = [
  { key: "fields", label: "Fields" },
  { key: "api", label: "API Rules" },
  { key: "options", label: "Options" },
] as const;

const accessActors: ApiAccessActor[] = ["public", "session", "apiKey", "superadmin"];
const operationKeys: ApiPreviewOperation["key"][] = ["list", "get", "create", "update", "delete"];
const queryCapabilityKeys = ["hiddenFields", "pagination", "filtering", "sorting", "includes"] as const;

type QueryCapabilityKey = (typeof queryCapabilityKeys)[number];

async function invalidateSchemaQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["schema"] }),
    queryClient.invalidateQueries({ queryKey: ["tables"] }),
    queryClient.invalidateQueries({ queryKey: ["table-meta"] }),
    queryClient.invalidateQueries({ queryKey: ["records"] }),
    queryClient.invalidateQueries({ queryKey: ["table-catalog"] }),
  ]);
}

async function listAllRecords(table: string) {
  const items: DataRecord[] = [];
  let page = 1;
  let total = 0;

  do {
    const searchParams = new URLSearchParams({
      page: String(page),
      pageSize: "100",
    });
    const response = await client.data.list(table, searchParams);
    items.push(...(response.items as DataRecord[]));
    total = response.total;
    page += 1;
  } while (items.length < total);

  return items;
}

function emptyField(): EditableField {
  return {
    name: "",
    type: "text",
    nullable: true,
    default: "",
    unique: false,
    indexed: false,
    size: 255,
    enumValues: [],
  };
}

function defaultTableApiConfig(): TableApiConfig {
  return {
    authMode: "superadmin",
    access: buildTableApiAccessPreset("adminOnly"),
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
      defaultField: "id",
      defaultOrder: "desc",
    },
    includes: {
      enabled: true,
      fields: [],
    },
    hiddenFields: [],
    routeSegment: null,
    sdkName: null,
    tag: null,
    description: null,
  };
}

function actorLabel(actor: ApiAccessActor) {
  switch (actor) {
    case "public":
      return "Public";
    case "session":
      return "Session";
    case "apiKey":
      return "API Key";
    default:
      return "Superadmin";
  }
}

function actorDescription(actor: ApiAccessActor) {
  switch (actor) {
    case "public":
      return "No auth required";
    case "session":
      return "Signed-in users";
    case "apiKey":
      return "Keys with route permission";
    default:
      return "Full admin access";
  }
}

function operationLabel(operation: ApiPreviewOperation["key"]) {
  switch (operation) {
    case "list":
      return "List";
    case "get":
      return "Get";
    case "create":
      return "Create";
    case "update":
      return "Update";
    default:
      return "Delete";
  }
}

function joinLabels(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function describeAccess(access: TableApiAccess) {
  const byActor = new Map<ApiAccessActor, string[]>();

  for (const operation of operationKeys) {
    const rule = access[operation];
    for (const actor of rule.actors) {
      const label = rule.scope === "own" && actor !== "superadmin" ? `${operationLabel(operation).toLowerCase()} own` : operationLabel(operation).toLowerCase();
      const current = byActor.get(actor) ?? [];
      current.push(label);
      byActor.set(actor, current);
    }
  }

  const parts = accessActors
    .filter((actor) => byActor.has(actor))
    .map((actor) => `${actorLabel(actor)} can ${joinLabels(byActor.get(actor) ?? [])}`);

  const ownOperations = operationKeys.filter((operation) => access[operation].scope === "own");
  if (access.ownershipField && ownOperations.length > 0) {
    parts.push(`Owner checks use ${access.ownershipField} for ${joinLabels(ownOperations.map((operation) => operationLabel(operation).toLowerCase()))}`);
  }

  return parts.join(". ");
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function FieldToggleList({
  fields,
  selected,
  disabled,
  emptyLabel,
  onToggle,
}: {
  fields: string[],
  selected: string[],
  disabled: boolean,
  emptyLabel: string,
  onToggle: (field: string) => void,
}) {
  if (fields.length === 0) {
    return <div className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {fields.map((field) => {
        const checked = selected.includes(field);
        return (
          <label
            key={field}
            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${checked ? "border-foreground/30 bg-muted/30" : "border-border/70"} ${
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
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
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function buildGeneratedSourceFieldName(targetTable: string, targetField: string, alias?: string | null) {
  const base = normaliseIdentifier(alias || targetTable || "relation");
  const suffix = normaliseIdentifier(targetField || "id");
  return suffix === "id" ? `${base}_id` : `${base}_${suffix}`;
}

function emptyRelation(sourceTable: string, targetTable: string): EditableRelation {
  return {
    sourceTable,
    sourceField: "",
    targetTable,
    targetField: "id",
    alias: "",
    sourceAlias: "",
    targetAlias: "",
    joinType: "left",
    onDelete: "no action",
    onUpdate: "no action",
    description: "",
    sourceFieldMode: "auto",
    generatedSourceField: buildGeneratedSourceFieldName(targetTable, "id"),
  };
}

function relationLabel(relation: EditableRelation) {
  const sourceField =
    relation.sourceFieldMode === "auto" ? relation.generatedSourceField : relation.sourceField;
  return relation.alias || `${sourceField || "source"} -> ${relation.targetTable || "target"}`;
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
    nullable: relation.joinType !== "inner",
    unique: false,
    indexed: true,
    default: undefined,
    size: targetField.type === "varchar" ? targetField.size : undefined,
    enumValues: targetField.type === "enum" ? targetField.enumValues : undefined,
  };
}

export function TableSchemaPanel({
  tableName,
  isOpen,
  onClose,
  onSuccess,
}: {
  tableName?: string | null,
  isOpen: boolean,
  onClose: () => void,
  onSuccess?: () => void,
}) {
  const isEditing = !!tableName;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showNotice, confirm } = useFeedback();

  const { data: schemaData, isLoading: isSchemaLoading } = useQuery({
    queryKey: ["schema"],
    queryFn: () => client.system.schema.get(),
    enabled: isOpen,
  });

  const { data: tableCatalog, isLoading: isCatalogLoading } = useQuery({
    queryKey: ["table-catalog"],
    queryFn: async () => {
      const response = await client.data.tables();
      const entries = await Promise.all(
        response.tables.map(async (table) => [table, await client.data.meta(table)] as const),
      );
      return Object.fromEntries(entries) as Record<string, TableDescriptor>;
    },
    enabled: isOpen,
  });

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fields, setFields] = useState<EditableField[]>([]);
  const [collapsedFields, setCollapsedFields] = useState<boolean[]>([]);
  const [relations, setRelations] = useState<EditableRelation[]>([]);
  const [collapsedRelations, setCollapsedRelations] = useState<boolean[]>([]);
  const [apiConfig, setApiConfig] = useState<TableApiConfig>(defaultTableApiConfig());
  const [activeTab, setActiveTab] = useState<(typeof tableEditorTabs)[number]["key"]>("fields");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [collapsedQuerySections, setCollapsedQuerySections] = useState<Record<QueryCapabilityKey, boolean>>({
    hiddenFields: true,
    pagination: true,
    filtering: true,
    sorting: true,
    includes: true,
  });

  const availableTableNames = useMemo(() => {
    const names = Object.keys(tableCatalog ?? {});
    if (!isEditing && name && !names.includes(name)) {
      return [name, ...names];
    }
    return names;
  }, [isEditing, name, tableCatalog]);

  const currentSourceTable = name || tableName || "";
  const sourceFieldOptions = useMemo(
    () => [
      "id",
      ...fields
        .map((field) => field.name.trim())
        .filter(Boolean)
        .filter((field, index, collection) => collection.indexOf(field) === index),
    ],
    [fields],
  );

  useEffect(() => {
    if (!isOpen || !schemaData) {
      return;
    }

    if (isEditing) {
      const table = schemaData.tables.find((entry) => entry.name === tableName);
      if (!table) {
        return;
      }

      setName(table.name);
      setDisplayName(table.displayName || table.name);
      setFields(
        table.fields
          .filter((field) => field.name !== "id")
          .map((field) => ({
            ...field,
            default: field.default ?? "",
            unique: !!field.unique,
            indexed: !!field.indexed,
            nullable: !!field.nullable,
            size: field.size ?? 255,
            enumValues: field.enumValues ?? [],
          })),
      );
      setCollapsedFields(table.fields.filter((field) => field.name !== "id").map(() => true));
      setRelations(
        schemaData.relations
          .filter((relation) => relation.sourceTable === table.name)
          .map((relation) => ({
            ...relation,
            alias: relation.alias ?? "",
            sourceAlias: relation.sourceAlias ?? "",
            targetAlias: relation.targetAlias ?? "",
            joinType: relation.joinType ?? "left",
            description: relation.description ?? "",
            sourceFieldMode: "existing",
            generatedSourceField: relation.sourceField,
          })),
      );
      setCollapsedRelations(
        schemaData.relations
          .filter((relation) => relation.sourceTable === table.name)
          .map(() => true),
      );
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
      return;
    }

    setName("");
    setDisplayName("");
    setFields([]);
    setCollapsedFields([]);
    setRelations([]);
    setCollapsedRelations([]);
    setApiConfig(defaultTableApiConfig());
  }, [isEditing, isOpen, schemaData, tableName]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("fields");
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
          [key]: key === "name" ? String(value).toLowerCase().replace(/[^a-z0-9_]/g, "") : value,
        } as EditableField;

        if (key === "type" && value !== "varchar") {
          next.size = undefined;
        }

        if (key === "type" && value === "varchar" && !next.size) {
          next.size = 255;
        }

        if (key === "type" && value !== "enum") {
          next.enumValues = [];
        }

        return next;
      }),
    );
  };

  const handleRemoveField = (index: number) => {
    setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
    setCollapsedFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  };

  const toggleFieldCollapsed = (index: number) => {
    setCollapsedFields((current) => current.map((collapsed, fieldIndex) => (fieldIndex === index ? !collapsed : collapsed)));
  };

  const setAllFieldsCollapsed = (collapsed: boolean) => {
    setCollapsedFields(fields.map(() => collapsed));
  };

  const handleAddRelation = () => {
    const initialTarget = availableTableNames.find((entry) => entry !== currentSourceTable) ?? "user";
    setRelations((current) => [...current, emptyRelation(currentSourceTable, initialTarget)]);
    setCollapsedRelations((current) => [...current, false]);
  };

  const handleRelationChange = (index: number, key: keyof EditableRelation, value: string) => {
    setRelations((current) =>
      current.map((relation, relationIndex) => {
        if (relationIndex !== index) {
          return relation;
        }

        const nextValue =
          key === "alias" || key === "sourceAlias" || key === "targetAlias"
            ? normaliseIdentifier(value)
            : value;
        const next = { ...relation, [key]: nextValue } as EditableRelation;

        if (key === "targetTable") {
          const targetFields = tableCatalog?.[value]?.fields ?? [];
          next.targetField = targetFields.some((field) => field.name === next.targetField)
            ? next.targetField
            : (targetFields[0]?.name ?? "id");
          if (next.sourceFieldMode === "auto" && !relation.alias) {
            next.generatedSourceField = buildGeneratedSourceFieldName(value, next.targetField, relation.alias);
          }
        }

        if (key === "targetField" && next.sourceFieldMode === "auto" && !relation.alias) {
          next.generatedSourceField = buildGeneratedSourceFieldName(next.targetTable, value, relation.alias);
        }

        if (key === "alias" && next.sourceFieldMode === "auto") {
          next.generatedSourceField = buildGeneratedSourceFieldName(next.targetTable, next.targetField, nextValue);
        }

        if (key === "sourceFieldMode" && value === "auto" && !next.generatedSourceField) {
          next.generatedSourceField = buildGeneratedSourceFieldName(next.targetTable, next.targetField, next.alias);
        }

        return next;
      }),
    );
  };

  const handleRemoveRelation = (index: number) => {
    setRelations((current) => current.filter((_, relationIndex) => relationIndex !== index));
    setCollapsedRelations((current) => current.filter((_, relationIndex) => relationIndex !== index));
  };

  const toggleRelationCollapsed = (index: number) => {
    setCollapsedRelations((current) => current.map((collapsed, relationIndex) => (relationIndex === index ? !collapsed : collapsed)));
  };

  const setAllRelationsCollapsed = (collapsed: boolean) => {
    setCollapsedRelations(relations.map(() => collapsed));
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

  const buildTableDraft = (): TableBlueprint => {
    const manualFields = fields
      .filter((field) => String(field.name ?? "").trim().length > 0)
      .map((field) => ({
        ...field,
        default: field.default ? String(field.default) : undefined,
        size: field.type === "varchar" ? Number(field.size || 255) : undefined,
        enumValues:
          field.type === "enum"
            ? (field.enumValues ?? []).map((value) => value.trim()).filter(Boolean)
            : undefined,
      }));

    const autoFields = relations
      .filter((relation) => relation.sourceFieldMode === "auto")
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

    return {
      name,
      displayName: displayName || name,
      primaryKey: "id",
      indexes: [],
      fields: [
        {
          name: "id",
          type: "uuid",
          nullable: false,
          unique: true,
          indexed: true,
          default: "gen_random_uuid()",
        },
        ...manualFields,
        ...autoFields,
      ],
      api: {
        ...apiConfig,
        routeSegment: apiConfig.routeSegment || undefined,
        sdkName: apiConfig.sdkName || undefined,
        tag: apiConfig.tag || undefined,
        description: apiConfig.description || undefined,
      },
    };
  };

  const buildRelationDraft = () =>
    relations
      .map((relation) => ({
        ...relation,
        sourceField: relation.sourceFieldMode === "auto" ? relation.generatedSourceField.trim() : relation.sourceField,
      }))
      .filter((relation) => relation.sourceField && relation.targetTable && relation.targetField)
      .map((relation) => {
        const {
          sourceFieldMode: _sourceFieldMode,
          generatedSourceField: _generatedSourceField,
          ...persistedRelation
        } = relation;

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
      .filter((relation) => relation.sourceFieldMode === "auto")
      .map((relation) => inferAutoField(relation, tableCatalog)?.name ?? "")
      .filter(Boolean);
    return Array.from(new Set([...manual, ...inferred]));
  }, [fields, relations, tableCatalog]);
  const filterableFieldNames = useMemo(
    () => ["id", ...availableFieldNames].filter((field, index, collection) => collection.indexOf(field) === index).filter((field) => !apiConfig.hiddenFields.includes(field)),
    [availableFieldNames, apiConfig.hiddenFields],
  );

  const availableSortFields = apiConfig.sorting.fields;
  const hasOwnScopedOperation = operationKeys.some((operation) => apiConfig.access[operation].scope === "own");
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

  const updateApiOperationEnabled = (operation: keyof TableApiConfig["operations"], enabled: boolean) => {
    setApiConfig((current) => ({
      ...current,
      operations: {
        ...current.operations,
        [operation]: enabled,
      },
    }));
  };

  const updateAccessActors = (operation: ApiPreviewOperation["key"], actor: ApiAccessActor, checked: boolean) => {
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
            scope: actor === "public" && checked && current.access[operation].scope === "own" ? "all" : current.access[operation].scope,
          },
        },
      };
    });
  };

  const updateAccessScope = (operation: ApiPreviewOperation["key"], scope: "all" | "own") => {
    setApiConfig((current) => ({
      ...current,
      access: {
        ...current.access,
        [operation]: {
          ...current.access[operation],
          actors: scope === "own" ? current.access[operation].actors.filter((actor) => actor !== "public") : current.access[operation].actors,
          scope,
        },
      },
    }));
  };

  const applyPolicyPreset = (preset: TableApiPolicyPreset) => {
    const presetDefinition = tableApiPolicyPresets.find((entry) => entry.id === preset);
    const ownershipField = presetDefinition?.ownershipRequired ? apiConfig.access.ownershipField ?? suggestedOwnershipField : null;

    if (presetDefinition?.ownershipRequired && !ownershipField) {
      showNotice({
        title: "Owner field required",
        description: "Add a field like owner_id or user_id first, then apply an owner-scoped policy preset.",
        variant: "destructive",
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
          defaultField: nextFields.includes(current.sorting.defaultField ?? "") ? current.sorting.defaultField : nextFields[0] ?? "",
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
      const visibleFields = ["id", ...availableFieldNames].filter((entry, index, collection) => collection.indexOf(entry) === index).filter((entry) => !hiddenFields.includes(entry));
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
          defaultField: nextSortFields.includes(current.sorting.defaultField ?? "") ? current.sorting.defaultField : nextSortFields[0] ?? "",
        },
      };
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showNotice({
        title: "Table name is required",
        description: "Enter a lowercase identifier before saving the table.",
        variant: "destructive",
      });
      return;
    }

    if (!schemaData) {
      showNotice({
        title: "Schema metadata is still loading",
        description: "Wait a moment for the live draft to load, then try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      const previousDraft = schemaData;
      const previousRows = isEditing && tableName ? await listAllRecords(tableName) : [];
      const newTable = buildTableDraft();
      const newRelations = buildRelationDraft();
      const baseDraft: SchemaDraft = schemaData;
      const relationSourceName = tableName ?? name;

      const nextTables = [...baseDraft.tables];
      if (isEditing) {
        const existingIndex = nextTables.findIndex((table) => table.name === tableName);
        if (existingIndex === -1) {
          throw new Error(`Table ${tableName} no longer exists in the current draft.`);
        }
        nextTables[existingIndex] = newTable;
      } else {
        nextTables.push(newTable);
      }

      const nextRelations = [
        ...baseDraft.relations.filter((relation) => relation.sourceTable !== relationSourceName),
        ...newRelations,
      ];

      await client.system.schema.apply({
        ...baseDraft,
        tables: nextTables,
        relations: nextRelations,
      });
      await invalidateSchemaQueries(queryClient);

      onSuccess?.();
      onClose();
      void navigate({ to: "/data", search: { table: name, page: undefined, pageSize: undefined } });

      showNotice({
        title: isEditing ? `Saved ${name}` : `Created ${name}`,
        description: "Undo is available for the next 30 seconds.",
        variant: "success",
        durationMs: 30000,
        actionLabel: "Undo",
        onAction: async () => {
          await client.system.schema.apply(previousDraft);
          for (const row of previousRows) {
            const rowId = typeof row.id === "string" ? row.id : null;
            if (!rowId) {
              continue;
            }
            await client.data.update(name, rowId, row);
          }
          await invalidateSchemaQueries(queryClient);
          onSuccess?.();
          void navigate({ to: "/data", search: { table: tableName ?? "user", page: undefined, pageSize: undefined } });
        },
      });
    } catch (error) {
      showNotice({
        title: "Failed to save schema",
        description: getErrorMessage(error, "The schema change could not be applied."),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!schemaData || !tableName) {
      return;
    }

    const confirmed = await confirm({
      title: `Delete ${tableName}?`,
      description: "This removes the table and its outgoing or incoming joins immediately. You will be able to undo it for 30 seconds.",
      confirmLabel: "Delete table",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      const previousDraft = schemaData;
      const deletedRows = await listAllRecords(tableName);
      const baseDraft: SchemaDraft = schemaData;

      await client.system.schema.apply({
        ...baseDraft,
        tables: baseDraft.tables.filter((table) => table.name !== tableName),
        relations: baseDraft.relations.filter(
          (relation) => relation.sourceTable !== tableName && relation.targetTable !== tableName,
        ),
      });
      await invalidateSchemaQueries(queryClient);

      onSuccess?.();
      onClose();
      void navigate({ to: "/data", search: { table: "user", page: undefined, pageSize: undefined } });

      showNotice({
        title: `Deleted ${tableName}`,
        description: "Undo is available for the next 30 seconds.",
        variant: "success",
        durationMs: 30000,
        actionLabel: "Undo",
        onAction: async () => {
          await client.system.schema.apply(previousDraft);
          for (const row of deletedRows) {
            await client.data.create(tableName, row);
          }
          await invalidateSchemaQueries(queryClient);
          onSuccess?.();
          void navigate({ to: "/data", search: { table: tableName, page: undefined, pageSize: undefined } });
        },
      });
    } catch (error) {
      showNotice({
        title: "Failed to delete table",
        description: getErrorMessage(error, "The table could not be deleted."),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Table - ${tableName}` : "New Table"}
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {isEditing && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={isDeleting || isSchemaLoading}
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
            <Button onClick={handleSubmit} disabled={isSaving || isDeleting || isSchemaLoading || isCatalogLoading}>
              {isSaving ? "Saving..." : isEditing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8 pb-10">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background p-2">
          {tableEditorTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "fields" && (
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
                  <div key={`${field.name || "field"}-${index}`} className="rounded-xl border border-border/60 bg-muted/20">
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
                            field.nullable ? "optional" : "required",
                            field.unique ? "unique" : null,
                            field.indexed ? "indexed" : null,
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemoveField(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {!collapsedFields[index] && (
                      <div className="grid gap-3 border-t border-border/60 px-3 py-3">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px]">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Field Name</label>
                            <Input
                              value={field.name}
                              onChange={(event) => handleFieldChange(index, "name", event.target.value)}
                              placeholder="column_name"
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</label>
                            <select
                              className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              value={field.type}
                              onChange={(event) => handleFieldChange(index, "type", event.target.value)}
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
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Default</label>
                            <Input
                              value={field.default ?? ""}
                              onChange={(event) => handleFieldChange(index, "default", event.target.value)}
                              placeholder="optional"
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-5">
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!field.nullable}
                              onChange={(event) => handleFieldChange(index, "nullable", !event.target.checked)}
                              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                            />
                            Required
                          </label>
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!!field.unique}
                              onChange={(event) => handleFieldChange(index, "unique", event.target.checked)}
                              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                            />
                            Unique
                          </label>
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={!!field.indexed}
                              onChange={(event) => handleFieldChange(index, "indexed", event.target.checked)}
                              className="h-4 w-4 rounded-sm border-muted-foreground/40 accent-primary"
                            />
                            Index
                          </label>
                        </div>

                        {field.type === "varchar" && (
                          <div className="grid gap-1.5 md:w-[180px]">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Max Length</label>
                            <Input
                              type="number"
                              min={1}
                              value={field.size ?? 255}
                              onChange={(event) => handleFieldChange(index, "size", event.target.value ? Number(event.target.value) : 255)}
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                        )}

                        {field.type === "enum" && (
                          <div className="grid gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Enum Values</label>
                            <Input
                              value={(field.enumValues ?? []).join(", ")}
                              onChange={(event) =>
                                handleFieldChange(
                                  index,
                                  "enumValues",
                                  event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
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

              <Button variant="outline" size="sm" onClick={handleAddField} className="border-dashed">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Field
              </Button>
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
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllRelationsCollapsed(false)}>
                        Expand all
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllRelationsCollapsed(true)}>
                        Collapse all
                      </Button>
                    </div>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{relations.length} defined</span>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                Define named joins from this table to any existing table. Aliases become the stable relation names for include rules and client-side query composition.
              </div>

              <div className="grid gap-3">
                {relations.map((relation, index) => {
                  const targetFields =
                    relation.targetTable === currentSourceTable
                      ? sourceFieldOptions.map((field) => ({ name: field }))
                      : (tableCatalog?.[relation.targetTable]?.fields ?? []);
                  const sourceField = relation.sourceFieldMode === "auto" ? relation.generatedSourceField : relation.sourceField;
                  const relationSummary = [
                    relation.joinType.toUpperCase(),
                    relation.targetTable || "target",
                    relation.targetField ? `on ${relation.targetField}` : null,
                    sourceField ? `via ${sourceField}` : null,
                  ]
                    .filter(Boolean)
                    .join(" • ");

                  return (
                    <div key={`${relationLabel(relation)}-${index}`} className="rounded-xl border border-border/60 bg-muted/20">
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
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemoveRelation(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {!collapsedRelations[index] && (
                        <div className="grid gap-4 border-t border-border/60 px-3 py-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alias</label>
                              <Input
                                value={relation.alias ?? ""}
                                onChange={(event) => handleRelationChange(index, "alias", event.target.value)}
                                placeholder="author"
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Join Type</label>
                              <select
                                value={relation.joinType}
                                onChange={(event) => handleRelationChange(index, "joinType", event.target.value)}
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
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Source Binding</label>
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  <input
                                    type="radio"
                                    checked={relation.sourceFieldMode === "existing"}
                                    onChange={() => handleRelationChange(index, "sourceFieldMode", "existing")}
                                    className="h-4 w-4 accent-primary"
                                  />
                                  Existing Field
                                </label>
                                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  <input
                                    type="radio"
                                    checked={relation.sourceFieldMode === "auto"}
                                    onChange={() => handleRelationChange(index, "sourceFieldMode", "auto")}
                                    className="h-4 w-4 accent-primary"
                                  />
                                  Auto-create FK
                                </label>
                              </div>
                            </div>
                            {relation.sourceFieldMode === "auto" && (
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Generated Source Field</label>
                                <Input
                                  value={relation.generatedSourceField}
                                  onChange={(event) => handleRelationChange(index, "generatedSourceField", normaliseIdentifier(event.target.value))}
                                  placeholder="author_id"
                                  className="h-9 font-mono text-xs"
                                />
                              </div>
                            )}
                          </div>

                          <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-4">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Source Field</label>
                              {relation.sourceFieldMode === "existing" ? (
                                <select
                                  value={relation.sourceField}
                                  onChange={(event) => handleRelationChange(index, "sourceField", event.target.value)}
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
                                  {relation.generatedSourceField || "generated field"}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target Table</label>
                              <select
                                value={relation.targetTable}
                                onChange={(event) => handleRelationChange(index, "targetTable", event.target.value)}
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
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target Field</label>
                              <select
                                value={relation.targetField}
                                onChange={(event) => handleRelationChange(index, "targetField", event.target.value)}
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
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                              <Input
                                value={relation.description ?? ""}
                                onChange={(event) => handleRelationChange(index, "description", event.target.value)}
                                placeholder="Optional"
                                className="h-9 text-xs"
                              />
                            </div>
                          </div>

                          {relation.sourceFieldMode === "auto" && (
                            <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
                              New field preview:{" "}
                              <span className="font-mono text-foreground">{relation.generatedSourceField || "generated_field"}</span>
                              {" · "}
                              {inferAutoField(relation, tableCatalog)?.type ?? "unknown"}{" "}
                              {" · "}
                              {relation.joinType === "inner" ? "required" : "nullable"}{" "}
                              {" · indexed"}
                            </div>
                          )}

                          <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Source Alias</label>
                              <Input
                                value={relation.sourceAlias ?? ""}
                                onChange={(event) => handleRelationChange(index, "sourceAlias", event.target.value)}
                                placeholder="posts"
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target Alias</label>
                              <Input
                                value={relation.targetAlias ?? ""}
                                onChange={(event) => handleRelationChange(index, "targetAlias", event.target.value)}
                                placeholder="users"
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 border-t border-border/60 pt-3 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">On Delete</label>
                              <select
                                value={relation.onDelete}
                                onChange={(event) => handleRelationChange(index, "onDelete", event.target.value)}
                                className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                              >
                                <option value="no action">NO ACTION</option>
                                <option value="restrict">RESTRICT</option>
                                <option value="cascade">CASCADE</option>
                                <option value="set null">SET NULL</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">On Update</label>
                              <select
                                value={relation.onUpdate}
                                onChange={(event) => handleRelationChange(index, "onUpdate", event.target.value)}
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
          </>
        )}

        {activeTab === "api" && (
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
                    value={apiConfig.routeSegment ?? ""}
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SDK Resource Name</label>
                  <Input
                    value={apiConfig.sdkName ?? ""}
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
                    value={apiConfig.tag ?? ""}
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
                    /api/data/{routeSegment || name || "table_name"}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
                <Input
                  value={apiConfig.description ?? ""}
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
                        active ? "border-foreground/30 bg-muted/30" : "border-border/70 hover:border-foreground/20 hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-foreground">{preset.label}</div>
                        {active ? <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{accessSummary}</div>
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                App-facing actors are configured here. Superadmin sessions always bypass these rules on admin routes and data requests.
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
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ownership Field</label>
                    <select
                      value={apiConfig.access.ownershipField ?? ""}
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
                    {suggestedOwnershipField ? ` Suggested field: ${suggestedOwnershipField}.` : ""}
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                {operationKeys.map((operation) => (
                  <div key={operation} className="grid gap-2 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{operationLabel(operation)}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">resource:{routeSegment || name || "table"}:{operation}</div>
                      </div>
                    </div>

                    <div className="grid gap-1 md:grid-cols-2 xl:grid-cols-4">
                      {accessActors.filter((actor) => actor !== "superadmin").map((actor) => {
                        const checked = apiConfig.access[operation].actors.includes(actor);
                        const isDisabled = apiConfig.access[operation].scope === "own" && actor === "public";
                        return (
                          <label
                            key={`${operation}-${actor}`}
                            title={actorDescription(actor)}
                            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${
                              checked ? "bg-muted/30" : ""
                            } ${isDisabled ? "opacity-60" : "cursor-pointer hover:bg-muted/20"}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold leading-tight text-foreground">{actorLabel(actor)}</div>
                              <div className="truncate text-[10px] leading-tight text-muted-foreground">{actorDescription(actor)}</div>
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
                          apiConfig.access[operation].scope === "own" ? "bg-muted/30" : "hover:bg-muted/20"
                        } ${!availableFieldNames.length ? "opacity-60" : "cursor-pointer"}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold leading-tight text-foreground">Owner Only</div>
                          <div className="truncate text-[10px] leading-tight text-muted-foreground">Only the record owner can do this</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={apiConfig.access[operation].scope === "own"}
                          onChange={(event) => {
                            if (event.target.checked && !apiConfig.access.ownershipField) {
                              const preferredOwnerField = ["owner_id", "user_id", "author_id", "created_by", "created_by_id"].find((field) =>
                                availableFieldNames.includes(field),
                              );

                              if (!preferredOwnerField) {
                                showNotice({
                                  title: "Owner field required",
                                  description: "Add a field like owner_id or user_id first, then enable owner-only access.",
                                  variant: "destructive",
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

                            updateAccessScope(operation, event.target.checked ? "own" : "all");
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
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  Query Capabilities
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllQuerySectionsCollapsed(false)}>
                      Expand all
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllQuerySectionsCollapsed(true)}>
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
                    onClick={() => toggleQuerySectionCollapsed("hiddenFields")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Hidden Response Fields</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.hiddenFields.length} field{apiConfig.hiddenFields.length === 1 ? "" : "s"} hidden from responses
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
                        fields={["id", ...availableFieldNames].filter((field, index, collection) => collection.indexOf(field) === index)}
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
                    onClick={() => toggleQuerySectionCollapsed("pagination")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Pagination</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.pagination.enabled
                          ? `${apiConfig.pagination.defaultPageSize} default / ${apiConfig.pagination.maxPageSize} max`
                          : "Disabled"}
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
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Default Page Size</label>
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
                                defaultPageSize: Number(event.target.value || "20"),
                              },
                            }))
                          }
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Max Page Size</label>
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
                                maxPageSize: Number(event.target.value || "100"),
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
                    onClick={() => toggleQuerySectionCollapsed("filtering")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Filtering</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.filtering.enabled
                          ? `${apiConfig.filtering.fields.length} field${apiConfig.filtering.fields.length === 1 ? "" : "s"} enabled`
                          : "Disabled"}
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
                    onClick={() => toggleQuerySectionCollapsed("sorting")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Sorting</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.sorting.enabled
                          ? `${apiConfig.sorting.fields.length} field${apiConfig.sorting.fields.length === 1 ? "" : "s"} enabled`
                          : "Disabled"}
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
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Default Sort Field</label>
                          <select
                            value={apiConfig.sorting.defaultField ?? ""}
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
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Default Order</label>
                          <select
                            value={apiConfig.sorting.defaultOrder}
                            onChange={(event) =>
                              setApiConfig((current) => ({
                                ...current,
                                sorting: {
                                  ...current.sorting,
                                  defaultOrder: event.target.value as "asc" | "desc",
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
                    onClick={() => toggleQuerySectionCollapsed("includes")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Relation Includes</div>
                      <div className="text-[11px] text-muted-foreground">
                        {apiConfig.includes.enabled
                          ? `${apiConfig.includes.fields.length} relation${apiConfig.includes.fields.length === 1 ? "" : "s"} enabled`
                          : "Disabled"}
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
                        fields={relations.map((relation) => relation.alias || (relation.sourceFieldMode === "auto" ? relation.generatedSourceField : relation.sourceField)).filter(Boolean)}
                        selected={apiConfig.includes.fields}
                        disabled={!apiConfig.includes.enabled}
                        emptyLabel="Add relations in Options to configure includes."
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
                    <div className="font-mono text-xs text-muted-foreground">/api/data/{routeSegment || name || "table"}</div>
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

        {activeTab === "options" && (
          <>
            <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-bold text-foreground">
                  Name <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g. posts"
                  value={name}
                  onChange={(event) => setName(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
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
            </section>

          </>
        )}
      </div>
    </SidePanel>
  );
}

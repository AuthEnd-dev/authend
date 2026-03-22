import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { DataRecord, FieldBlueprint, RelationBlueprint, SchemaDraft, TableBlueprint, TableDescriptor } from "@authend/shared";
import { client } from "../lib/client";
import { SidePanel } from "./ui/side-panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { getErrorMessage, useFeedback } from "./ui/feedback";
import { Link2, Plus, Settings2, Trash2 } from "lucide-react";

type EditableField = FieldBlueprint;
type EditableRelation = RelationBlueprint & {
  sourceFieldMode: "existing" | "auto",
  generatedSourceField: string,
};

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
    items.push(...response.items);
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
  const [relations, setRelations] = useState<EditableRelation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      return;
    }

    setName("");
    setDisplayName("");
    setFields([]);
    setRelations([]);
  }, [isEditing, isOpen, schemaData, tableName]);

  const handleAddField = () => {
    setFields((current) => [...current, emptyField()]);
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
  };

  const handleAddRelation = () => {
    const initialTarget = availableTableNames.find((entry) => entry !== currentSourceTable) ?? "user";
    setRelations((current) => [...current, emptyRelation(currentSourceTable, initialTarget)]);
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
      void navigate({ to: "/data", search: { table: name } });

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
          void navigate({ to: "/data", search: { table: tableName ?? "user" } });
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
      void navigate({ to: "/data", search: { table: "user" } });

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
          void navigate({ to: "/data", search: { table: tableName } });
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

        <section className="grid gap-4 rounded-2xl border border-border/60 bg-background p-5">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Fields / Columns
            </h3>
            <span className="font-mono text-xs text-muted-foreground">{fields.length} active</span>
          </div>

          <div className="grid gap-3">
            {fields.map((field, index) => (
              <div
                key={`${field.name || "field"}-${index}`}
                className="grid gap-3 border-t border-border/60 py-4 first:border-t-0 first:pt-0 last:pb-0"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px_auto]">
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
                  <div className="flex items-end">
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemoveField(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
                  <div className="grid gap-1.5 border-t border-border/60 pt-3 md:w-[180px]">
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
                  <div className="grid gap-1.5 border-t border-border/60 pt-3">
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
            <span className="font-mono text-xs text-muted-foreground">{relations.length} defined</span>
          </div>

          <div className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
            Define named joins from this table to any existing table. Aliases become the stable relation names for future includes and client-side query composition.
          </div>

          <div className="grid gap-3">
            {relations.map((relation, index) => {
              const targetFields =
                relation.targetTable === currentSourceTable
                  ? sourceFieldOptions.map((field) => ({ name: field }))
                  : (tableCatalog?.[relation.targetTable]?.fields ?? []);

              return (
                <div
                  key={`${relationLabel(relation)}-${index}`}
                  className="grid gap-4 border-t border-border/60 py-4 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{relationLabel(relation)}</div>
                      <div className="text-xs text-muted-foreground">Join metadata for include aliases and future query builders.</div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleRemoveRelation(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

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
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={handleAddRelation} className="border-dashed">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Relation
          </Button>
        </section>
      </div>
    </SidePanel>
  );
}

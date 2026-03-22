import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { startTransition, useMemo, useState, useRef, useEffect } from 'react';
import type { DataRecord, TableDescriptor } from '@authend/shared';
import { createPortal } from 'react-dom';
import { client } from '../lib/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Database,
  Code,
  Plus,
  Settings,
  Search,
  ArrowRight,
  Key,
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Braces,
  RotateCw,
  Layers,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { SidePanel } from '../components/ui/side-panel';
import { ApiPreviewPanel } from '../components/api-preview-panel';
import { TableSchemaPanel } from '../components/table-schema-panel';
import { getErrorMessage, useFeedback } from '../components/ui/feedback';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  SortingState,
  VisibilityState,
  ColumnDef,
  type HeaderContext,
  type CellContext,
  type Table as ReactTableInstance,
} from '@tanstack/react-table';

function DataValue({ value, columnKey }: { value: unknown; columnKey: string }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/40 italic text-xs font-semibold">N/A</span>;
  }

  const str = String(value);

  if (columnKey === 'id' || columnKey.endsWith('Id') || columnKey.endsWith('_id')) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted/60 text-[11px] font-mono text-muted-foreground whitespace-nowrap border border-border/50">
        {(columnKey === 'id' || columnKey.endsWith('Id')) && <Key className="w-3 h-3 opacity-60" />}
        {str}
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
          value ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground opacity-80'
        }`}
      >
        {value ? 'True' : 'False'}
      </span>
    );
  }

  if (typeof value === 'object') {
    return (
      <span className="text-[11px] bg-muted/30 px-1.5 py-0.5 rounded text-muted-foreground font-mono truncate max-w-[200px] inline-block opacity-80">
        {JSON.stringify(value)}
      </span>
    );
  }

  if (str.length > 50) {
    return (
      <span className="text-[13px] truncate max-w-[250px] inline-block opacity-90" title={str}>
        {str}
      </span>
    );
  }

  return <span className="text-[13px] opacity-90">{str}</span>;
}

function toDateTimeLocalValue(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocalValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString();
}

function TypeIcon({ type, columnKey }: { type: string; columnKey: string }) {
  if (columnKey === 'id' || columnKey.endsWith('Id')) return <Key className="w-3 h-3 opacity-50 shrink-0" />;
  switch (type) {
    case 'boolean':
      return <ToggleLeft className="w-3 h-3 opacity-50 shrink-0" />;
    case 'integer':
    case 'bigint':
    case 'numeric':
    case 'number':
      return <Hash className="w-3 h-3 opacity-50 shrink-0" />;
    case 'timestamp':
    case 'date':
      return <Calendar className="w-3 h-3 opacity-50 shrink-0" />;
    case 'jsonb':
    case 'object':
      return <Braces className="w-3 h-3 opacity-50 shrink-0" />;
    default:
      return <Type className="w-3 h-3 opacity-50 shrink-0" />;
  }
}

function relationOptionLabel(record: DataRecord) {
  const labelKeys = ['name', 'title', 'email', 'username', 'display_name', 'displayName'];
  const labelKey = labelKeys.find((key) => typeof record[key] === 'string' && String(record[key]).trim().length > 0);
  if (labelKey) {
    return `${record[labelKey]} (${String(record.id ?? '')})`;
  }
  return String(record.id ?? 'Unknown record');
}

function RelationPickerModal({
  isOpen,
  relation,
  value,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  relation: {
    sourceField: string;
    targetTable: string;
    targetField: string;
    alias?: string | null;
  } | null;
  value: unknown;
  onSelect: (value: unknown) => void;
  onClose: () => void;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [appliedSearchValue, setAppliedSearchValue] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSearchValue('');
      setAppliedSearchValue('');
    }
  }, [isOpen]);

  const { data, isFetching } = useQuery({
    queryKey: ['relation-picker-records', relation?.targetTable, appliedSearchValue],
    enabled: isOpen && !!relation?.targetTable,
    queryFn: () =>
      client.data.resource(relation!.targetTable).list({
        page: 1,
        pageSize: 20,
        sort: relation!.targetField,
        order: 'asc',
        filterValue: appliedSearchValue || undefined,
      }),
  });

  if (!isOpen || !relation) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default border-none bg-background/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close picker"
      />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Pick Related Record</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {relation.alias || relation.sourceField} {'->'} {relation.targetTable}.{relation.targetField}
            </p>
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="border-b border-border/60 px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">SQL Search</label>
            <div className="flex items-center gap-2">
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    startTransition(() => setAppliedSearchValue(searchValue.trim()));
                  }
                }}
                placeholder={`Search all ${relation.targetTable} fields...`}
                className="h-10"
              />
              {searchValue.trim() !== '' && (
                <>
                  <Button type="button" variant="outline" onClick={() => startTransition(() => setAppliedSearchValue(searchValue.trim()))}>
                    Search
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSearchValue('');
                      startTransition(() => setAppliedSearchValue(''));
                    }}
                  >
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="grid gap-2">
            {data?.items.map((item) => {
              const itemId = item[relation.targetField];
              const selected = String(value ?? '') === String(itemId ?? '');
              if (typeof itemId !== 'string' && typeof itemId !== 'number') {
                return null;
              }

              return (
                <button
                  key={String(itemId)}
                  type="button"
                  onClick={() => {
                    onSelect(itemId);
                    onClose();
                  }}
                  className={`grid gap-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted/30'
                  }`}
                >
                  <div className="text-sm font-semibold text-foreground">{relationOptionLabel(item)}</div>
                  <div className="font-mono text-xs text-muted-foreground">{String(itemId)}</div>
                </button>
              );
            })}

            {!isFetching && (!data?.items || data.items.length === 0) && (
              <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                No related records found.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-6 py-4">
          <div className="text-xs text-muted-foreground">
            {isFetching ? 'Searching...' : `Showing up to ${data?.items.length ?? 0} records`}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => onSelect(null)}>
              Clear
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ViewOptionsToggle({ table }: { table: ReactTableInstance<DataRecord> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 shadow-sm text-xs border-muted-foreground/20"
        onClick={() => setOpen(!open)}
      >
        <Layers className="w-3.5 h-3.5 mr-1.5 opacity-70" />
        View
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border shadow-lg rounded-xl z-50 p-2 flex flex-col gap-1 max-h-80 overflow-auto">
          <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
            Toggle Columns
          </div>
          {table
            .getAllLeafColumns()
            .filter((column) => column.id !== 'select' && column.id !== 'actions')
            .map((column) => {
              return (
                <label
                  key={column.id}
                  className="cursor-pointer flex items-center gap-3 px-2 py-1.5 hover:bg-muted/60 rounded-md text-sm transition-colors"
                >
                  <input
                    type="checkbox"
                    className="rounded-sm border-muted-foreground/40 accent-primary w-3.5 h-3.5"
                    checked={column.getIsVisible()}
                    onChange={column.getToggleVisibilityHandler()}
                  />
                  <span className="truncate flex-1">{column.id}</span>
                </label>
              );
            })}
        </div>
      )}
    </div>
  );
}

function DataRecordPanel({
  tableName,
  tableSchema,
  record,
  isOpen,
  onClose,
  onSuccess,
  canMutate,
}: {
  tableName: string;
  tableSchema: TableDescriptor | undefined;
  record: DataRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  canMutate: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pickerField, setPickerField] = useState<string | null>(null);
  const isEditing = !!record;
  const recordId = typeof record?.id === 'string' ? record.id : null;
  const { showNotice, confirm } = useFeedback();
  const { data: schemaDraft } = useQuery({
    queryKey: ['schema'],
    queryFn: () => client.system.schema.get(),
    enabled: isOpen,
  });

  const relationFields = useMemo(() => {
    if (!schemaDraft) {
      return [];
    }

    return schemaDraft.relations.filter((relation) => relation.sourceTable === tableName);
  }, [schemaDraft, tableName]);

  const relationBySourceField = useMemo(
    () =>
      new Map(
        relationFields.map((relation) => [
          relation.sourceField,
          relation,
        ]),
      ),
    [relationFields],
  );
  const activePickerRelation = pickerField ? relationBySourceField.get(pickerField) ?? null : null;

  useEffect(() => {
    if (isOpen) {
      if (record) setFormData({ ...record });
      else setFormData({});
    }
  }, [isOpen, record]);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!canMutate) return;
    try {
      setIsSaving(true);
      const previousRecord = record ? { ...record } : null;
      // Clean empty strings for specific types
      const payload = { ...formData };
      tableSchema?.fields.forEach((field) => {
        if (payload[field.name] === '') {
          payload[field.name] = null;
        }
      });

      if (isEditing) {
        if (!recordId) {
          throw new Error('Missing record id');
        }
        await client.data.update(tableName, recordId, payload);
        showNotice({
          title: 'Record updated',
          description: 'Undo is available for the next 30 seconds.',
          variant: 'success',
          durationMs: 30000,
          actionLabel: 'Undo',
          onAction: async () => {
            if (!previousRecord) {
              return;
            }
            await client.data.update(tableName, recordId, previousRecord);
            onSuccess();
          },
        });
      } else {
        const createdRecord = await client.data.create(tableName, payload);
        const createdRecordId = typeof createdRecord.id === 'string' ? createdRecord.id : null;
        showNotice({
          title: 'Record created',
          description: 'Undo is available for the next 30 seconds.',
          variant: 'success',
          durationMs: 30000,
          actionLabel: 'Undo',
          onAction: async () => {
            if (!createdRecordId) {
              return;
            }
            await client.data.remove(tableName, createdRecordId);
            onSuccess();
          },
        });
      }

      onSuccess();
      onClose();
    } catch (error) {
      showNotice({
        title: 'Failed to save record',
        description: getErrorMessage(error, 'The record could not be saved.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canMutate) return;
    const confirmed = await confirm({
      title: 'Delete this record?',
      description: 'This removes the row immediately. You will be able to undo it for 30 seconds.',
      confirmLabel: 'Delete record',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      if (!recordId) {
        throw new Error('Missing record id');
      }
      setIsDeleting(true);
      const deletedRecord = record ? { ...record } : null;
      await client.data.remove(tableName, recordId);
      showNotice({
        title: 'Record deleted',
        description: 'Undo is available for the next 30 seconds.',
        variant: 'success',
        durationMs: 30000,
        actionLabel: 'Undo',
        onAction: async () => {
          if (!deletedRecord) {
            return;
          }
          await client.data.create(tableName, deletedRecord);
          onSuccess();
        },
      });
      onSuccess();
      onClose();
    } catch (error) {
      showNotice({
        title: 'Failed to delete record',
        description: getErrorMessage(error, 'The record could not be deleted.'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Record - ${tableName}` : `New Record - ${tableName}`}
      footer={
        <div className="flex justify-between items-center w-full">
          <div>
            {isEditing && canMutate && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 relative">
            <Button variant="outline" onClick={onClose} disabled={isSaving || isDeleting} className="shadow-sm">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canMutate || isSaving || isDeleting} className="shadow-sm min-w-24 px-4">
              {isSaving ? 'Saving...' : canMutate ? (isEditing ? 'Save Changes' : 'Create') : 'Read only'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-6">
        {recordId && (
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 text-xs text-muted-foreground font-mono">
            <Key className="w-4 h-4 opacity-50" />
            <span className="font-semibold text-foreground/70">{recordId}</span>
          </div>
        )}

        {tableSchema?.fields
          ?.filter((field) => field.name !== 'id')
          .map((field) => {
            let inputContent = null;
            const val = formData[field.name];
            const relation = relationBySourceField.get(field.name);

            if (relation) {
              inputContent = (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-3 font-mono text-sm text-muted-foreground">
                      {val == null || val === '' ? 'No related record selected' : String(val)}
                    </div>
                    <Button type="button" variant="outline" onClick={() => setPickerField(field.name)}>
                      Open Picker
                    </Button>
                    {field.nullable && val != null && val !== '' && (
                      <Button type="button" variant="ghost" onClick={() => handleChange(field.name, null)}>
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Relation: {relation.alias || field.name} {"->"} {relation.targetTable}.{relation.targetField}
                  </div>
                </div>
              );
            } else if (field.type === 'boolean') {
              inputContent = (
                <label className="flex items-center gap-3 p-3 border border-border/50 rounded-lg bg-card hover:bg-muted/20 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded-sm border-muted-foreground/40 accent-primary"
                    checked={!!val}
                    onChange={(e) => handleChange(field.name, e.target.checked)}
                  />
                  <span className="text-sm font-medium">{val ? 'True' : 'False'}</span>
                </label>
              );
            } else if (field.type === 'jsonb') {
              inputContent = (
                <Textarea
                  className="font-mono text-xs min-h-[120px]"
                  value={typeof val === 'object' ? JSON.stringify(val, null, 2) : val || ''}
                  onChange={(e) => {
                    let parsed = e.target.value;
                    try {
                      parsed = JSON.parse(e.target.value);
                    } catch {}
                    handleChange(field.name, parsed);
                  }}
                  placeholder="{}"
                />
              );
            } else if (field.type === 'integer' || field.type === 'bigint' || field.type === 'numeric') {
              inputContent = (
                <Input
                  type="number"
                  value={val ?? ''}
                  onChange={(e) => handleChange(field.name, e.target.value ? Number(e.target.value) : null)}
                />
              );
            } else if (field.type === 'date') {
              inputContent = (
                <Input
                  type="date"
                  value={typeof val === 'string' ? val.slice(0, 10) : ''}
                  onChange={(e) => handleChange(field.name, e.target.value || null)}
                />
              );
            } else if (field.type === 'timestamp') {
              inputContent = (
                <Input
                  type="datetime-local"
                  value={toDateTimeLocalValue(val)}
                  onChange={(e) => handleChange(field.name, fromDateTimeLocalValue(e.target.value))}
                />
              );
            } else {
              inputContent = <Input type="text" value={val ?? ''} onChange={(e) => handleChange(field.name, e.target.value)} />;
            }

            return (
              <div key={field.name} className="flex flex-col gap-1.5 group">
                <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {field.name}
                    {!field.nullable &&
                      field.name !== 'createdAt' &&
                      field.name !== 'updatedAt' &&
                      field.name !== 'created_at' &&
                      field.name !== 'updated_at' && <span className="text-destructive text-xs">*</span>}
                  </div>
                  <TypeIcon type={field.type} columnKey={field.name} />
                </label>
                {inputContent}
              </div>
            );
          })}

        {(!tableSchema?.fields || tableSchema.fields.length === 0) && (
          <div className="text-sm text-muted-foreground p-4 bg-muted/20 rounded-lg text-center border border-dashed border-border">
            Schema fields could not be loaded. Please ensure the table has a defined schema.
          </div>
        )}

        {!canMutate && (
          <div className="text-sm text-muted-foreground p-4 bg-muted/20 rounded-lg text-center border border-dashed border-border">
            Built-in tables are currently read-only from the admin UI. Use generated app tables for row create, edit, and delete
            flows.
          </div>
        )}
      </div>
      <RelationPickerModal
        isOpen={!!activePickerRelation}
        relation={activePickerRelation}
        value={pickerField ? formData[pickerField] : null}
        onSelect={(value) => {
          if (!pickerField) {
            return;
          }
          handleChange(pickerField, value);
        }}
        onClose={() => setPickerField(null)}
      />
    </SidePanel>
  );
}

export function DataPage() {
  const search = useSearch({ from: '/database/data' });
  const tableName = search.table ?? 'user';
  const { data: tableMeta, refetch: refetchMeta } = useQuery({
    queryKey: ['table-meta', tableName],
    queryFn: () => client.data.meta(tableName),
  });
  const [searchValue, setSearchValue] = useState('');
  const [appliedSearchValue, setAppliedSearchValue] = useState('');

  useEffect(() => {
    setSearchValue('');
    setAppliedSearchValue('');
  }, [tableName]);

  const queryKey = useMemo(() => ['records', tableName, appliedSearchValue], [appliedSearchValue, tableName]);

  const { data, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      client.data.resource(tableName).list({
        filterValue: appliedSearchValue || undefined,
      }),
  });

  const items = useMemo(() => data?.items || [], [data?.items]);
  const tableSchema = tableMeta;
  const canMutateRows = tableMeta?.source === 'generated';

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [apiPreviewOpen, setApiPreviewOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);

  const handleEditRecord = (record: DataRecord) => {
    if (!canMutateRows) return;
    setEditingRecord(record);
    setFormOpen(true);
  };

  const handleNewRecord = () => {
    if (!canMutateRows) return;
    setEditingRecord(null);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    refetch();
    refetchMeta();
  };

  const dynamicColumns = useMemo<ColumnDef<DataRecord>[]>(() => {
    const fields = tableSchema?.fields || [];
    const keys = fields.length > 0 ? fields.map((field) => field.name) : Array.from(new Set(items.flatMap(Object.keys)));

    // Sort logic
    const sorted = [...keys].sort((a, b) => {
      if (a === 'id') return -1;
      if (b === 'id') return 1;
      const aIsDate = a === 'createdAt' || a === 'updatedAt' || a === 'created_at' || a === 'updated_at';
      const bIsDate = b === 'createdAt' || b === 'updatedAt' || b === 'created_at' || b === 'updated_at';
      if (aIsDate && !bIsDate) return 1;
      if (!aIsDate && bIsDate) return -1;
      return a.localeCompare(b);
    });

    const getFieldType = (col: string) => {
      const field = fields.find((entry) => entry.name === col);
      return field?.type || 'string';
    };

    const cols: ColumnDef<DataRecord>[] = [
      {
        id: 'select',
        header: ({ table }) => (
          <div className="px-1 flex items-center">
            <input
              type="checkbox"
              className="rounded-sm border-muted-foreground/40 accent-primary w-4 h-4 cursor-pointer"
              checked={table.getIsAllPageRowsSelected()}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="px-1 flex items-center">
            <input
              type="checkbox"
              className="rounded-sm border-muted-foreground/40 accent-primary w-4 h-4 cursor-pointer"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...sorted.map((col) => ({
        id: col,
        accessorKey: col,
        header: ({ column }: HeaderContext<DataRecord, unknown>) => {
          return (
            <button
              className="flex items-center gap-2 hover:text-foreground transition-colors group cursor-pointer font-semibold w-full text-left"
              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            >
              <TypeIcon type={getFieldType(col)} columnKey={col} />
              <span className="truncate">{col}</span>
              {column.getIsSorted() === 'asc' ? (
                <ChevronUp className="w-3.5 h-3.5 ml-1 text-primary" />
              ) : column.getIsSorted() === 'desc' ? (
                <ChevronDown className="w-3.5 h-3.5 ml-1 text-primary" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5 ml-1 opacity-0 group-hover:opacity-40 transition-opacity" />
              )}
            </button>
          );
        },
        cell: ({ getValue }: CellContext<DataRecord, unknown>) => <DataValue value={getValue()} columnKey={col} />,
      })),
      {
        id: 'actions',
        header: '',
        cell: () => (
          <div className="flex justify-end pr-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ];

    return cols.length > 2
      ? cols
      : [cols[0], { id: 'id', header: 'id', cell: () => 'N/A' } satisfies ColumnDef<DataRecord>, cols[1]];
  }, [items, tableSchema]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data: items,
    columns: dynamicColumns,
    state: { sorting, columnVisibility, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between gap-4 pt-6 px-6 mb-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground/90 flex items-center gap-2">
            <span className="text-muted-foreground/60 font-medium tracking-normal text-lg">Tables</span>
            <span className="text-muted-foreground/40 font-light translate-y-[1px]">/</span>
            {tableName}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground max-w-fit px-1.5 ml-2 hover:bg-muted/60 disabled:opacity-40"
            onClick={() => setSchemaOpen(true)}
            disabled={!tableMeta?.mutableSchema}
            title={tableMeta?.mutableSchema ? 'Edit table schema' : 'Built-in tables are not editable from the schema UI'}
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground max-w-fit px-1.5 hover:bg-muted/60"
            onClick={() => refetch()}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin opacity-50' : ''}`} />
          </Button>
        </div>
        <div className="flex gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 shadow-sm text-xs font-medium border-muted-foreground/20 hover:bg-muted/40"
            onClick={() => setApiPreviewOpen(true)}
          >
            <Code className="w-3.5 h-3.5 mr-1.5 opacity-70" />
            API Preview
          </Button>
          <Button
            size="sm"
            onClick={handleNewRecord}
            disabled={!canMutateRows}
            title={canMutateRows ? 'Create a new record' : 'Built-in tables are read-only from the admin UI'}
            className="h-8 shadow-sm bg-zinc-900 border border-transparent dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-xs font-semibold px-4 transition-all disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" strokeWidth={2.5} />
            New record
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden max-h-full">
        <div className="px-4 py-2 bg-muted/20 flex justify-between items-center shrink-0 border-b border-border/50">
          <div className="flex flex-1 items-center max-w-2xl bg-background/50 rounded-md border border-border/40 px-3 overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-primary/20 focus-within:border-primary/30 transition-shadow">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  startTransition(() => setAppliedSearchValue(searchValue.trim()));
                }
              }}
              placeholder={`SQL search all ${tableName} fields...`}
              className="h-8 bg-transparent border-0 shadow-none focus-visible:ring-0 px-2.5 text-[13px] text-muted-foreground w-full placeholder:opacity-50"
            />
            {searchValue.trim() !== '' && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => startTransition(() => setAppliedSearchValue(searchValue.trim()))}
                >
                  Search
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setSearchValue('');
                    startTransition(() => setAppliedSearchValue(''));
                  }}
                >
                  Clear
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <ViewOptionsToggle table={table} />
          </div>
        </div>

        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <Table className="w-full relative min-w-[600px]">
            <TableHeader className="bg-background sticky top-0 z-20 border-border group">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="hover:bg-transparent border-b border-border/50"
                >
                  {headerGroup.headers.map((header) => {
                    const isSelect = header.column.id === 'select';
                    const isActions = header.column.id === 'actions';
                    return (
                      <TableHead
                        key={header.id}
                        className={`font-semibold text-muted-foreground h-11 px-4 text-[11px] uppercase tracking-wider whitespace-nowrap align-middle select-none bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 ${isSelect ? 'sticky left-0 z-30 w-12 border-r border-border/30 shadow-[1px_0_0_0_hsl(var(--border)_/_0.3)] bg-background' : isActions ? 'sticky right-0 z-30 w-12 bg-background border-l border-border/30' : ''}`}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={() => handleEditRecord(row.original)}
                    className={`group border-b border-border/40 transition-colors ${
                      canMutateRows ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default hover:bg-card'
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isSelect = cell.column.id === 'select';
                      const isActions = cell.column.id === 'actions';
                      return (
                        <TableCell
                          key={cell.id}
                          className={`py-2 px-4 whitespace-nowrap text-sm h-12 max-w-[300px] truncate ${isSelect ? 'sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-border/30 shadow-[1px_0_0_0_hsl(var(--border)_/_0.3)] transition-colors' : isActions ? 'sticky right-0 z-10 bg-card group-hover:bg-muted/50 border-l border-border/30 transition-colors' : ''}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={dynamicColumns.length} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2 opacity-60">
                      <Database className="w-8 h-8 mb-2" strokeWidth={1.5} />
                      <p className="text-sm">
                        No records found in tables / <span className="font-mono">{tableName}</span>.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {table.getRowModel().rows.length > 0 && (
          <div className="p-2.5 bg-background border-t border-border/50 px-6 text-[11px] text-muted-foreground font-medium shrink-0 flex items-center justify-between shadow-[0_-1px_3px_auto_rgba(0,0,0,0.02)] z-20 sticky bottom-0">
            <div className="flex items-center gap-4">
              <span>{table.getSelectedRowModel().rows.length} selected row(s)</span>
              <div className="w-px h-3 bg-border" />
              <span>{data?.total ?? table.getRowModel().rows.length} records total</span>
            </div>
            <span className="opacity-50 hidden sm:inline-block tracking-widest font-mono uppercase">Authend</span>
          </div>
        )}
      </div>

      <DataRecordPanel
        tableName={tableName}
        tableSchema={tableSchema}
        record={editingRecord}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
        canMutate={canMutateRows}
      />
      <TableSchemaPanel
        tableName={tableName}
        isOpen={schemaOpen}
        onClose={() => setSchemaOpen(false)}
        onSuccess={handleFormSuccess}
      />
      <ApiPreviewPanel
        tableName={tableName}
        isOpen={apiPreviewOpen}
        onClose={() => setApiPreviewOpen(false)}
      />
    </div>
  );
}

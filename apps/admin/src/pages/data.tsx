import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { startTransition, useMemo, useState, useRef, useEffect } from 'react';
import type { DataRecord, TableDescriptor } from '@authend/shared';
import { createPortal } from 'react-dom';
import { client } from '../lib/client';
import { SYSTEM_TABLES } from '../lib/tables';

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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { TooltipComponent as Tooltip } from '../components/ui/tooltip';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { SidePanel } from '../components/ui/side-panel';
import { ApiPreviewPanel } from '../components/api-preview-panel';
import { TableSchemaPanel } from '../components/table-schema-panel';
import { getErrorMessage, useFeedback } from '../components/ui/feedback';
import {
  useReactTable,
  getCoreRowModel,
  functionalUpdate,
  flexRender,
  SortingState,
  VisibilityState,
  ColumnDef,
  type HeaderContext,
  type CellContext,
  type Table as ReactTableInstance,
} from '@tanstack/react-table';

function asInputValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? value : '';
}

function recordIdOf(record: DataRecord) {
  return typeof record.id === 'string' ? record.id : null;
}

function primitiveText(value: unknown, fallback = '') {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

function DataValue({ value, columnKey }: { value: unknown; columnKey: string }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/40 italic text-xs font-semibold">N/A</span>;
  }

  if (columnKey === 'id' || columnKey.endsWith('Id') || columnKey.endsWith('_id')) {
    const str = primitiveText(value, 'N/A');
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

  const str = primitiveText(value, '');

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
  const recordId = primitiveText(record.id);
  if (labelKey) {
    return `${primitiveText(record[labelKey])} (${recordId})`;
  }
  return recordId || 'Unknown record';
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
      client.data.resource<DataRecord>(relation!.targetTable).list({
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
    <div className="fixed inset-0 z-160 flex items-center justify-center px-4">
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
              const record = item as DataRecord;
              const itemId = record[relation.targetField];
              const selected = primitiveText(value) === primitiveText(itemId);
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
                  <div className="text-sm font-semibold text-foreground">{relationOptionLabel(record)}</div>
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
        const createdRecord = (await client.data.create(tableName, payload)) as DataRecord;
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
      title={isEditing 
        ? (SYSTEM_TABLES.includes(tableName) ? `Edit System Record - ${tableName}` : `Edit Record - ${tableName}`)
        : (SYSTEM_TABLES.includes(tableName) ? `New System Record - ${tableName}` : `New Record - ${tableName}`)
      }
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
                      {val == null || val === '' ? 'No related record selected' : primitiveText(val, 'N/A')}
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
                  value={typeof val === 'object' ? JSON.stringify(val, null, 2) : asInputValue(val)}
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
                  value={typeof val === 'number' ? val : typeof val === 'string' ? val : ''}
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
              inputContent = <Input type="text" value={asInputValue(val)} onChange={(e) => handleChange(field.name, e.target.value)} />;
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
  const navigate = useNavigate({ from: '/data' });
  const search = useSearch({ from: '/database/data' });
  const tableName = search.table ?? 'user';
  const { data: tableMeta, refetch: refetchMeta } = useQuery({
    queryKey: ['table-meta', tableName],
    queryFn: () => client.data.meta(tableName),
  });
  const pageSizeOptions = useMemo(() => {
    const maxPageSize = Math.max(1, Math.floor(tableMeta?.pagination?.maxPageSize ?? 100));
    const defaultPageSize = Math.min(
      maxPageSize,
      Math.max(1, Math.floor(tableMeta?.pagination?.defaultPageSize ?? Math.min(20, maxPageSize))),
    );

    return Array.from(new Set([
      defaultPageSize,
      maxPageSize,
      ...[25, 50, 100, 250].filter((size) => size <= maxPageSize),
    ])).sort((left, right) => left - right);
  }, [tableMeta?.pagination?.defaultPageSize, tableMeta?.pagination?.maxPageSize]);
  const currentPage = typeof search.page === 'number' && search.page > 0 ? Math.floor(search.page) : 1;
  const fallbackPageSize = pageSizeOptions[0] ?? 25;
  const currentPageSize = typeof search.pageSize === 'number' && pageSizeOptions.includes(search.pageSize)
    ? search.pageSize
    : fallbackPageSize;
  const [searchValue, setSearchValue] = useState('');
  const [appliedSearchValue, setAppliedSearchValue] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    setSearchValue('');
    setAppliedSearchValue('');
    setSorting([]);
  }, [tableName]);

  const updateDataSearch = (patch: { page?: number; pageSize?: number; table?: string }) => {
    void navigate({
      to: '/data',
      search: (current) => ({
        table: patch.table ?? current.table,
        page: patch.page ?? current.page,
        pageSize: patch.pageSize ?? current.pageSize,
      }),
      replace: true,
    });
  };

  const queryKey = useMemo(
    () => ['records', tableName, appliedSearchValue, currentPage, currentPageSize, sorting[0]?.id ?? null, sorting[0]?.desc ?? null],
    [appliedSearchValue, currentPage, currentPageSize, sorting, tableName],
  );

  const { data, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey,
    placeholderData: (previousData, previousQuery) => {
      // Only keep previous data when the previous query was for the same table.
      // This prevents stale rows from a different table bleeding through during the fetch.
      const prevTable = previousQuery?.queryKey?.[1];
      return prevTable === tableName ? keepPreviousData(previousData) : undefined;
    },
    queryFn: () =>
      client.data.resource<DataRecord>(tableName).list({
        page: currentPage,
        pageSize: currentPageSize,
        sort: sorting[0]?.id,
        order: sorting[0]?.desc ? 'desc' : 'asc',
        filterValue: appliedSearchValue || undefined,
      }),
  });

  const items = useMemo<DataRecord[]>(
    () => (data?.items ?? []).map((item) => item as DataRecord),
    [data],
  );
  const tableSchema = tableMeta as TableDescriptor | undefined;
  const canMutateRows = Boolean(tableMeta);
  const totalRecords = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / currentPageSize));
  const visibleStart = totalRecords === 0 ? 0 : (currentPage - 1) * currentPageSize + 1;
  const visibleEnd = totalRecords === 0 ? 0 : Math.min(currentPage * currentPageSize, totalRecords);
  const pageRecordIds = useMemo(() => items.map(recordIdOf).filter((value): value is string => Boolean(value)), [items]);

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [apiPreviewOpen, setApiPreviewOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());

  const handleEditRecord = (record: DataRecord) => {
    setEditingRecord(record);
    setFormOpen(true);
  };

  const handleNewRecord = () => {
    setEditingRecord(null);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    void refetch();
    void refetchMeta();
  };

  useEffect(() => {
    if (currentPage > totalPages) {
      updateDataSearch({ page: totalPages });
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!pageSizeOptions.includes(currentPageSize)) {
      updateDataSearch({ page: 1, pageSize: fallbackPageSize });
    }
  }, [currentPageSize, fallbackPageSize, pageSizeOptions]);

  useEffect(() => {
    setSelectedRecordIds(new Set());
  }, [appliedSearchValue, tableName]);

  const allPageRowsSelected = pageRecordIds.length > 0 && pageRecordIds.every((id) => selectedRecordIds.has(id));
  const somePageRowsSelected = pageRecordIds.some((id) => selectedRecordIds.has(id));

  const togglePageSelection = (checked: boolean) => {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (checked) {
        for (const id of pageRecordIds) {
          next.add(id);
        }
      } else {
        for (const id of pageRecordIds) {
          next.delete(id);
        }
      }
      return next;
    });
  };

  const toggleRecordSelection = (record: DataRecord, checked: boolean) => {
    const recordId = recordIdOf(record);
    if (!recordId) {
      return;
    }

    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(recordId);
      } else {
        next.delete(recordId);
      }
      return next;
    });
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
        header: () => (
          <div className="px-1 flex items-center">
            <input
              type="checkbox"
              className="rounded-sm border-muted-foreground/40 accent-primary w-4 h-4 cursor-pointer"
              checked={allPageRowsSelected}
              ref={(node) => {
                if (node) {
                  node.indeterminate = somePageRowsSelected && !allPageRowsSelected;
                }
              }}
              onChange={(event) => togglePageSelection(event.target.checked)}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="px-1 flex items-center">
            <input
              type="checkbox"
              className="rounded-sm border-muted-foreground/40 accent-primary w-4 h-4 cursor-pointer"
              checked={(() => {
                const recordId = recordIdOf(row.original);
                return recordId ? selectedRecordIds.has(recordId) : false;
              })()}
              onChange={(event) => toggleRecordSelection(row.original, event.target.checked)}
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
            <Tooltip content="View record details">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </Button>
            </Tooltip>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ];

    return cols.length > 2
      ? cols
      : [cols[0], { id: 'id', header: 'id', cell: () => 'N/A' } satisfies ColumnDef<DataRecord>, cols[1]];
  }, [allPageRowsSelected, selectedRecordIds, somePageRowsSelected, tableSchema]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable<DataRecord>({
    data: items,
    columns: dynamicColumns,
    state: { sorting, columnVisibility },
    manualSorting: true,
    onSortingChange: (updater) => {
      setSorting((current) => {
        const next = functionalUpdate(updater, current).slice(0, 1);
        if ((next[0]?.id ?? null) !== (current[0]?.id ?? null) || (next[0]?.desc ?? null) !== (current[0]?.desc ?? null)) {
          updateDataSearch({ page: 1 });
        }
        return next;
      });
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between gap-4 pt-6 px-6 mb-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground/90 flex items-center gap-2">
            <span className="text-muted-foreground/60 font-medium tracking-normal text-lg">Tables</span>
            {SYSTEM_TABLES.includes(tableName) && (
              <>
                <span className="text-muted-foreground/40 font-light translate-y-px">/</span>
                <span className="text-muted-foreground/60 font-medium tracking-normal text-lg">System</span>
              </>
            )}
            <span className="text-muted-foreground/40 font-light translate-y-px">/</span>
            {tableName}
          </h2>
          <Tooltip content={tableMeta ? 'Edit table schema' : 'Loading table metadata...'}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground max-w-fit px-1.5 ml-2 hover:bg-muted/60 disabled:opacity-40"
              onClick={() => setSchemaOpen(true)}
              disabled={!tableMeta}
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Refresh data">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground max-w-fit px-1.5 hover:bg-muted/60"
              onClick={() => refetch()}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isFetching && !isPlaceholderData ? 'animate-spin opacity-50' : isFetching ? 'opacity-50' : ''}`} />
            </Button>
          </Tooltip>
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
            title={canMutateRows ? 'Create a new record' : 'Loading table metadata...'}
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
                  startTransition(() => {
                    setAppliedSearchValue(searchValue.trim());
                    updateDataSearch({ page: 1 });
                  });
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
                  onClick={() => startTransition(() => {
                    setAppliedSearchValue(searchValue.trim());
                    updateDataSearch({ page: 1 });
                  })}
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
                    startTransition(() => {
                      setAppliedSearchValue('');
                      updateDataSearch({ page: 1 });
                    });
                  }}
                >
                  Clear
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4">
            {isFetching ? (
              <span className="text-[11px] font-medium text-muted-foreground">
                Updating…
              </span>
            ) : null}
            <ViewOptionsToggle table={table} />
          </div>
        </div>

        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <Table containerClassName="overflow-visible" className="w-full relative min-w-[600px]">
            <TableHeader className="bg-background border-border group">
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
                        className={`sticky top-0 font-semibold text-muted-foreground h-11 px-4 text-[11px] uppercase tracking-wider whitespace-nowrap align-middle select-none border-b border-border/70 bg-background/95 shadow-[0_1px_0_0_hsl(var(--border)/0.75),0_10px_18px_-16px_rgba(15,23,42,0.45)] backdrop-blur supports-backdrop-filter:bg-background/80 ${isSelect ? 'left-0 z-30 w-12 border-r border-border/30 bg-background shadow-[1px_0_0_0_hsl(var(--border)/0.3),0_1px_0_0_hsl(var(--border)/0.75),0_10px_18px_-16px_rgba(15,23,42,0.45)]' : isActions ? 'right-0 z-30 w-12 bg-background border-l border-border/30 shadow-[0_1px_0_0_hsl(var(--border)/0.75),0_10px_18px_-16px_rgba(15,23,42,0.45)]' : 'z-20'} ${isSelect || isActions ? 'sticky' : ''}`}
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
                    data-state={(() => {
                      const recordId = recordIdOf(row.original);
                      return recordId && selectedRecordIds.has(recordId) ? 'selected' : undefined;
                    })()}
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
                          className={`py-2 px-4 whitespace-nowrap text-sm h-12 max-w-[300px] truncate ${isSelect ? 'sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-border/30 shadow-[1px_0_0_0_hsl(var(--border)/0.3)] transition-colors' : isActions ? 'sticky right-0 z-10 bg-card group-hover:bg-muted/50 border-l border-border/30 transition-colors' : ''}`}
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
              <span>{selectedRecordIds.size} selected row(s)</span>
              <div className="w-px h-3 bg-border" />
              <span>{totalRecords} records total</span>
              <div className="w-px h-3 bg-border" />
              <span>
                Showing {visibleStart}-{visibleEnd}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={String(currentPageSize)}
                onChange={(event) => updateDataSearch({ page: 1, pageSize: Number(event.target.value) })}
                className="h-8 rounded-md border border-border bg-background px-2 text-[11px]"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => updateDataSearch({ page: 1 })}
                disabled={currentPage <= 1}
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => updateDataSearch({ page: currentPage - 1 })}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[90px] text-center text-[11px] font-semibold text-foreground">
                Page {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => updateDataSearch({ page: currentPage + 1 })}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => updateDataSearch({ page: totalPages })}
                disabled={currentPage >= totalPages}
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
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

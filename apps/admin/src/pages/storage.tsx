import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { getErrorMessage, useFeedback } from '../components/ui/feedback';
import { client } from '../lib/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ChevronRight, FolderPlus, HardDrive, RefreshCw, Search, Upload, X } from 'lucide-react';

type StorageFileRecord = {
  key?: string;
  driver?: string;
  sizeBytes?: number | null;
  visibility?: string | null;
  attachmentTable?: string | null;
  attachmentRecordId?: string | null;
  attachmentField?: string | null;
  createdAt?: string;
};

function splitPath(path: string) {
  return path
    .split('/')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalisePath(path: string) {
  return splitPath(path).join('/');
}

function startsWithPath(value: string, prefix: string) {
  if (!prefix) return true;
  return value === prefix || value.startsWith(`${prefix}/`);
}

function immediateRelative(value: string, prefix: string) {
  if (!prefix) return value;
  if (value === prefix) return '';
  if (!value.startsWith(`${prefix}/`)) return '';
  return value.slice(prefix.length + 1);
}

export function StorageFilesPage() {
  const queryClient = useQueryClient();
  const { showNotice } = useFeedback();
  const [currentPath, setCurrentPath] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [directoryDialogOpen, setDirectoryDialogOpen] = useState(false);
  const [newDirectoryName, setNewDirectoryName] = useState('');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const filesQuery = useQuery({
    queryKey: ['storage-files'],
    queryFn: () =>
      client.system.storage.listFiles({
        limit: 200,
      }),
  });

  const records = (filesQuery.data as StorageFileRecord[] | undefined) ?? [];
  const totalFiles = records.length;
  const totalBytes = records.reduce((sum, record) => sum + (typeof record.sizeBytes === 'number' ? record.sizeBytes : 0), 0);
  const privateCount = records.filter((record) => record.visibility === 'private').length;
  const publicCount = records.filter((record) => record.visibility === 'public').length;

  const pathSegments = splitPath(currentPath);
  const breadcrumbItems = useMemo(
    () =>
      pathSegments.map((segment, index) => ({
        label: segment,
        path: pathSegments.slice(0, index + 1).join('/'),
      })),
    [pathSegments],
  );

  const filteredRecords = useMemo(() => {
    const search = searchValue.trim().toLowerCase();
    return records.filter((record) => {
      const key = String(record.key ?? '');
      if (!startsWithPath(key, currentPath)) {
        return false;
      }
      if (!search) {
        return true;
      }
      return key.toLowerCase().includes(search);
    });
  }, [records, currentPath, searchValue]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const record of filteredRecords) {
      const key = String(record.key ?? '');
      const relative = immediateRelative(key, currentPath);
      if (!relative) continue;
      const [first] = relative.split('/');
      if (relative.includes('/') && first) {
        set.add(first);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [filteredRecords, currentPath]);

  const filesInCurrentPath = useMemo(() => {
    return filteredRecords
      .filter((record) => {
        const key = String(record.key ?? '');
        const relative = immediateRelative(key, currentPath);
        return relative.length > 0 && !relative.includes('/');
      })
      .sort((left, right) => String(left.key ?? '').localeCompare(String(right.key ?? '')));
  }, [filteredRecords, currentPath]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) {
        throw new Error('Choose a file first.');
      }
      const formData = new FormData();
      formData.set('file', uploadFile);
      if (currentPath.trim()) formData.set('prefix', normalisePath(currentPath));
      return client.system.storage.upload(formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storage-files'] });
      setUploadFile(null);
      showNotice({
        title: 'File uploaded',
        description: 'The file was uploaded and indexed in storage metadata.',
        variant: 'success',
        durationMs: 4000,
      });
    },
    onError: (error) =>
      showNotice({
        title: 'Upload failed',
        description: getErrorMessage(error, 'Could not upload the file.'),
        variant: 'destructive',
        durationMs: 6000,
      }),
  });

  const createDirectoryMutation = useMutation({
    mutationFn: async () => {
      const folder = normalisePath(newDirectoryName);
      if (!folder) {
        throw new Error('Provide a directory name.');
      }
      const path = normalisePath([currentPath, folder].filter(Boolean).join('/'));
      return client.system.storage.createFolder(path);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storage-files'] });
      setNewDirectoryName('');
      setDirectoryDialogOpen(false);
      showNotice({
        title: 'Directory created',
        description: 'Folder marker uploaded successfully.',
        variant: 'success',
        durationMs: 3500,
      });
    },
    onError: (error) =>
      showNotice({
        title: 'Directory creation failed',
        description: getErrorMessage(error, 'Could not create directory marker.'),
        variant: 'destructive',
        durationMs: 6000,
      }),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (key: string) => client.system.storage.remove(key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storage-files'] });
      showNotice({
        title: 'File deleted',
        description: 'The storage object and metadata record were removed.',
        variant: 'success',
        durationMs: 4000,
      });
    },
    onError: (error) =>
      showNotice({
        title: 'Delete failed',
        description: getErrorMessage(error, 'Could not delete the file.'),
        variant: 'destructive',
        durationMs: 6000,
      }),
  });

  const openSignedDownloadMutation = useMutation({
    mutationFn: (key: string) => client.system.storage.createSignedDownloadUrl(key, 900),
    onSuccess: (result) => {
      window.open(result.url, '_blank', 'noopener,noreferrer');
      showNotice({
        title: 'Signed URL ready',
        description: 'Opened a temporary download URL in a new tab.',
        variant: 'success',
        durationMs: 3500,
      });
    },
    onError: (error) =>
      showNotice({
        title: 'Could not create signed URL',
        description: getErrorMessage(error, 'Failed to generate download URL.'),
        variant: 'destructive',
        durationMs: 6000,
      }),
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="w-full max-w-[1200px] px-4 py-4 md:px-6 md:py-5 space-y-4">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Storage</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Object-browser style storage manager with folder navigation and metadata records.
            </p>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total files</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalFiles}</p>
          </div>
          <div className="rounded-xl bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Stored bytes</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalBytes.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Private objects</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{privateCount}</p>
          </div>
          <div className="rounded-xl bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Public objects</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{publicCount}</p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2">
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCurrentPath('')}>
              /
            </button>
            {breadcrumbItems.map((item) => (
              <div key={item.path} className="flex items-center gap-2">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCurrentPath(item.path)}>
                  {item.label}
                </button>
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="relative md:max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search keys in current folder"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <input
                type="file"
                id="storage-upload-input"
                className="hidden"
                ref={uploadInputRef}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setUploadFile(selected);
                  if (selected) {
                    setTimeout(() => uploadMutation.mutate(), 0);
                  }
                }}
              />
              <Button onClick={() => uploadInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              <Button variant="outline" onClick={() => setDirectoryDialogOpen(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Add directory
              </Button>
              <Button variant="outline" onClick={() => filesQuery.refetch()} disabled={filesQuery.isFetching}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {folders.length > 0 ? (
            <div className="rounded-lg bg-muted/10 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Folders</p>
              <div className="flex flex-wrap gap-2">
                {folders.map((folder) => (
                  <Button
                    key={folder}
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPath(normalisePath([currentPath, folder].filter(Boolean).join('/')))}
                  >
                    <HardDrive className="mr-2 h-3.5 w-3.5" />
                    {folder}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <div className="overflow-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Attachment</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filesInCurrentPath.map((file, index) => {
                  const key = String(file.key ?? '');
                  const attachmentTable = file.attachmentTable ? String(file.attachmentTable) : '—';
                  const attachmentRecordId = file.attachmentRecordId ? String(file.attachmentRecordId) : '—';
                  const attachmentField = file.attachmentField ? String(file.attachmentField) : '—';
                  return (
                    <TableRow key={`${key}-${index}`}>
                      <TableCell className="font-mono text-xs">{key}</TableCell>
                      <TableCell>{String(file.driver ?? '—')}</TableCell>
                      <TableCell>{typeof file.sizeBytes === 'number' ? `${file.sizeBytes} B` : '—'}</TableCell>
                      <TableCell className="text-xs">
                        {attachmentTable}/{attachmentRecordId}/{attachmentField}
                      </TableCell>
                      <TableCell className="text-xs">{String(file.createdAt ?? '—')}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openSignedDownloadMutation.mutate(key)}>
                            Open
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(key)}>
                            Copy key
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deleteFileMutation.mutate(key)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filesInCurrentPath.length === 0 ? (
                  <TableRow>
                    <TableCell className="px-3 py-5 text-muted-foreground" colSpan={6}>
                      No uploaded file records found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </section>

        {directoryDialogOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">Add directory</h4>
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-muted/30"
                  onClick={() => setDirectoryDialogOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Create folder under: <span className="font-mono">{currentPath || 'root'}</span>
              </p>
              <div className="mt-4 space-y-1">
                <Label className="text-sm font-medium">Folder name</Label>
                <Input
                  value={newDirectoryName}
                  onChange={(event) => setNewDirectoryName(event.target.value)}
                  placeholder="images"
                />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDirectoryDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => createDirectoryMutation.mutate()} disabled={createDirectoryMutation.isPending}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

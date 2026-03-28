import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Code2, Database, GitBranchPlus, PencilLine, Table2 } from 'lucide-react';
import { client } from '../lib/client';
import { TableSchemaPanel } from '../components/table-schema-panel';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { CodeBlock } from '../components/ui/code-block';

export function SchemaPage() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data: liveDraft, refetch, isFetching } = useQuery({
    queryKey: ['schema'],
    queryFn: () => client.system.schema.get(),
  });

  const relationCountByTable = useMemo(() => {
    const counts = new Map<string, number>();
    for (const relation of liveDraft?.relations ?? []) {
      counts.set(relation.sourceTable, (counts.get(relation.sourceTable) ?? 0) + 1);
    }
    return counts;
  }, [liveDraft]);

  const generatedTables = liveDraft?.tables ?? [];

  return (
    <>
      <div className="flex flex-col gap-6">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Schema Builder</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Create and edit generated tables visually. Raw schema JSON is still available for debugging, but it is no longer the primary authoring surface.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setAdvancedOpen((current) => !current)}>
              <Code2 className="mr-2 h-4 w-4" />
              {advancedOpen ? 'Hide JSON debug' : 'Show JSON debug'}
            </Button>
            <Button
              onClick={() => {
                setSelectedTable(null);
                setPanelOpen(true);
              }}
            >
              <GitBranchPlus className="mr-2 h-4 w-4" />
              New table
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Generated tables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">{generatedTables.length}</div>
              <p className="mt-1 text-sm text-muted-foreground">Tables currently managed by the schema draft.</p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Relations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">{liveDraft?.relations.length ?? 0}</div>
              <p className="mt-1 text-sm text-muted-foreground">Joins defined in the generated schema draft.</p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Refresh state</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">{isFetching ? 'Updating' : 'Ready'}</div>
              <p className="mt-1 text-sm text-muted-foreground">Schema metadata reloads after each successful visual change.</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/60">
            <CardHeader className="border-b border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">Generated tables</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use the visual editor for table fields, relations, API rules, and hooks.
                  </p>
                </div>
                <Badge variant="secondary">Visual-first</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 p-4">
              {generatedTables.length > 0 ? (
                generatedTables.map((table) => (
                  <div key={table.name} className="rounded-2xl border border-border/60 bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Table2 className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-semibold text-foreground">{table.displayName || table.name}</p>
                          <Badge variant="outline">{table.name}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {table.fields.length} fields, {relationCountByTable.get(table.name) ?? 0} relations, auth mode {table.api.authMode}.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{table.api.operations.list ? 'list' : 'no list'}</Badge>
                          <Badge variant="secondary">{table.api.operations.create ? 'create' : 'read only'}</Badge>
                          <Badge variant="secondary">{table.hooks.length} hooks</Badge>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedTable(table.name);
                          setPanelOpen(true);
                        }}
                      >
                        <PencilLine className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
                  <Database className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">No generated tables yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start with a visual table definition instead of writing the draft by hand.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => {
                      setSelectedTable(null);
                      setPanelOpen(true);
                    }}
                  >
                    Create first table
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="text-sm font-semibold text-foreground">How to use this page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                Create or edit tables from the list. The panel already covers fields, relations, API rules, and hooks.
              </div>
              <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                Use the JSON view only when you need to inspect the raw draft or compare it with another environment.
              </div>
              <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
                Destructive schema work still belongs behind backups. The visual editor applies the real schema, not a sandbox copy.
              </div>
            </CardContent>
          </Card>
        </section>

        {advancedOpen ? (
          <Card className="border-border/60">
            <CardHeader className="border-b border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">Advanced JSON debug</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Inspect the live schema draft directly. Keep visual editing as the default workflow.
                  </p>
                </div>
                <Badge variant="outline">Advanced</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <CodeBlock code={JSON.stringify(liveDraft ?? { tables: [], relations: [] }, null, 2)} language="json" className="max-h-[480px] overflow-auto p-4 text-xs" />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <TableSchemaPanel
        tableName={selectedTable}
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSuccess={() => {
          void refetch();
        }}
      />
    </>
  );
}

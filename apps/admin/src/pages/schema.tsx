import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SchemaDraft } from '@authend/shared';
import { client } from '../lib/client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';

const initialDraft: SchemaDraft = {
  tables: [
    {
      name: 'profiles',
      displayName: 'Profiles',
      primaryKey: 'id',
      fields: [
        {
          name: 'id',
          type: 'uuid',
          nullable: false,
          unique: true,
          indexed: true,
          default: 'gen_random_uuid()',
        },
        {
          name: 'bio',
          type: 'text',
          nullable: true,
          indexed: false,
          unique: false,
        },
      ],
      indexes: [],
      api: {
        authMode: 'superadmin',
        access: {
          ownershipField: null,
          list: { actors: ['superadmin'], scope: 'all' },
          get: { actors: ['superadmin'], scope: 'all' },
          create: { actors: ['superadmin'], scope: 'all' },
          update: { actors: ['superadmin'], scope: 'all' },
          delete: { actors: ['superadmin'], scope: 'all' },
        },
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
          defaultOrder: 'desc',
        },
        includes: {
          enabled: true,
          fields: [],
        },
        hiddenFields: [],
        fieldVisibility: {},
      },
      hooks: [],
    },
  ],
  relations: [],
};

export function SchemaPage() {
  const [draft, setDraft] = useState<SchemaDraft>(initialDraft);

  const { data: liveDraft } = useQuery({
    queryKey: ['schema'],
    queryFn: () => client.system.schema.get(),
  });

  const previewMutation = useMutation({
    mutationFn: (payload: SchemaDraft) => client.system.schema.preview(payload),
  });

  const applyMutation = useMutation({
    mutationFn: (payload: SchemaDraft) => client.system.schema.apply(payload),
  });

  return (
    <div className="grid lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_500px] gap-6 h-full">
      <div className="flex flex-col h-[calc(100vh-10rem)] rounded-xl border border-border bg-card shadow-sm overflow-hidden min-h-[500px]">
        <div className="flex items-center justify-between p-3 px-4 border-b border-border bg-muted/20 shrink-0">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Draft Spec JSON</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 shadow-sm" onClick={() => previewMutation.mutate(draft)}>
              Preview SQL
            </Button>
            <Button size="sm" className="h-8 shadow-sm" onClick={() => applyMutation.mutate(draft)}>
              Apply Draft
            </Button>
          </div>
        </div>
        <div className="flex-1 p-0 m-0 relative">
          <Textarea
            id="schema-draft"
            className="absolute inset-0 h-full w-full font-mono text-sm resize-none border-0 rounded-none bg-transparent p-4 focus-visible:ring-0 focus-visible:ring-offset-0 ring-0 selection:bg-primary/20"
            value={JSON.stringify(draft, null, 2)}
            onChange={(event) => {
              try {
                setDraft(JSON.parse(event.target.value) as SchemaDraft);
              } catch {
                // Ignore invalid JSON while typing
              }
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto h-[calc(100vh-10rem)] pr-1 pb-4">
        <Card className="shadow-sm border-border shrink-0">
          <CardHeader className="py-2.5 px-4 bg-muted/20 border-b border-border">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live Draft</CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[400px] overflow-auto">
            <pre className="p-4 bg-transparent text-muted-foreground font-mono text-xs">{JSON.stringify(liveDraft, null, 2)}</pre>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border shrink-0">
          <CardHeader className="py-2.5 px-4 bg-muted/20 border-b border-border">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview Result</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-4 bg-transparent text-muted-foreground font-mono text-xs overflow-x-auto">
              {JSON.stringify(previewMutation.data, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border shrink-0">
          <CardHeader className="py-2.5 px-4 bg-muted/20 border-b border-border">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Apply Result</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-4 bg-transparent text-muted-foreground font-mono text-xs overflow-x-auto">
              {JSON.stringify(applyMutation.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

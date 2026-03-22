import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/client";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

export function MigrationsPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["migrations"],
    queryFn: () => client.system.migrations(),
  });

  const previewMutation = useMutation({
    mutationFn: () => client.system.previewMigrations(),
  });

  const applyMutation = useMutation({
    mutationFn: () => client.system.applyMigrations(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["migrations"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Migrations</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">Review migration history, preview pending changes, and apply them from the same main table surface.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => previewMutation.mutate()}>
            Preview pending
          </Button>
          <Button onClick={() => applyMutation.mutate()}>
            Apply pending
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/60 bg-background">
        <div className="overflow-auto">
          <Table>
            <TableHeader className="bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 w-[50%] font-semibold text-muted-foreground">Migration</TableHead>
                <TableHead className="h-11 font-semibold text-muted-foreground">Status</TableHead>
                <TableHead className="h-11 text-right font-semibold text-muted-foreground">Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((migration) => (
                <TableRow key={migration.id} className="border-b border-border/50 last:border-b-0">
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">{migration.title}</div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">{migration.key}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={migration.status === "applied" ? "default" : migration.status === "rolled_back" ? "destructive" : "secondary"}>
                      {migration.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{migration.appliedAt ?? "pending"}</TableCell>
                </TableRow>
              ))}
              {(!data || data.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No migrations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/60 bg-background">
        <div className="border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          <p className="mt-1 text-xs text-muted-foreground">Pending migration payload from the server.</p>
        </div>
        <pre className="max-h-[260px] overflow-auto px-4 py-3 font-mono text-xs text-muted-foreground">
          {JSON.stringify(previewMutation.data, null, 2)}
        </pre>
      </section>
    </div>
  );
}

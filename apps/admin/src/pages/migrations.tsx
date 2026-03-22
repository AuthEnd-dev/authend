import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/client";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

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

  const statusClassName = (status: string) => {
    if (status === "applied") {
      return "bg-primary/10 text-primary";
    }
    if (status === "rolled_back") {
      return "bg-destructive/10 text-destructive";
    }
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex justify-end gap-3 shrink-0">
        <Button variant="outline" onClick={() => previewMutation.mutate()}>
          Preview pending
        </Button>
        <Button onClick={() => applyMutation.mutate()}>
          Apply pending
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex-1 flex flex-col min-h-[300px]">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/30 sticky top-0 shadow-sm z-10">
              <TableRow className="hover:bg-transparent border-b border-border/50">
                <TableHead className="font-semibold text-muted-foreground h-12 w-1/3">Key</TableHead>
                <TableHead className="font-semibold text-muted-foreground h-12">Status</TableHead>
                <TableHead className="font-semibold text-muted-foreground h-12 text-right px-6">Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((migration) => (
                <TableRow key={migration.id} className="group border-b border-border/50">
                  <TableCell className="font-mono text-xs text-primary py-3">{migration.key}</TableCell>
                  <TableCell className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusClassName(migration.status)}`}>
                      {migration.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3 text-right px-6 text-sm">{migration.appliedAt ?? "pending"}</TableCell>
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
      </div>

      <Card className="shrink-0 shadow-sm border-border">
        <CardHeader className="py-3 px-4 border-b border-border bg-muted/20">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-transparent">Preview Console</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <pre className="p-4 text-muted-foreground font-mono text-xs overflow-x-auto max-h-[300px]">
            {JSON.stringify(previewMutation.data, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

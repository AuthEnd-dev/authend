import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

export function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => client.system.setupStatus(),
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 items-start pb-2">
        <Badge variant="secondary" className="px-3 py-1 rounded-full text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary transition-colors border-0">Single-project Bun BaaS</Badge>
        <h2 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Own the auth layer, keep the backend malleable.</h2>
        <p className="text-xl text-muted-foreground max-w-3xl leading-relaxed">
          Authend wraps Better Auth, Drizzle, and Postgres behind an admin surface that can
          evolve your schema and plugin set without rebuilding your app backend from scratch.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.healthy ? "Ready" : "Needs attention"}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Enabled plugins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.enabledPlugins.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Pending migrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.migrationsPending ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Superadmin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.superAdminExists ? "Seeded" : "Missing"}</div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

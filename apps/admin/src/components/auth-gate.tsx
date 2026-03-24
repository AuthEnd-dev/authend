import type { ReactNode } from "react";
import { useState } from "react";
import { client } from "../lib/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Eye, EyeOff, Database, ArrowRight, Loader2 } from "lucide-react";

export function AuthGate(props: { children: ReactNode }) {
  const session = client.auth.useSession();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Initialising Nexus</h2>
            <p className="text-xs text-muted-foreground transition-opacity animate-pulse">Verifying secure session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session.data) {
    return (
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 lg:flex-row lg:gap-24 lg:px-12">
        {/* Technical Background Layer */}
        <div className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.07]" 
          style={{ 
            backgroundImage: `radial-gradient(var(--primary) 1px, transparent 1px)`,
            backgroundSize: '32px 32px' 
          }} 
        />
        
        {/* Visual Brand Side (Only on Large Screens) */}
        <div className="relative z-10 hidden max-w-sm flex-col gap-6 lg:flex">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm border border-primary/20">
            <Database className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tighter text-foreground">AuthEnd BaaS</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Professional Backend as a Service. Scale your applications with instant database, auth, and storage.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="space-y-1 rounded-xl border border-border/50 bg-muted/30 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</div>
              <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Operational
              </div>
            </div>
            <div className="space-y-1 rounded-xl border border-border/50 bg-muted/30 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Version</div>
              <div className="text-sm font-semibold text-foreground">v0.1.0-alpha</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-[440px] animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Card className="border-border/50 bg-card/50 shadow-[0_0_50px_-12px_rgba(0,0,0,0.1)] backdrop-blur-xl dark:shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">
            <CardHeader className="space-y-1 pt-8 lg:pb-8">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary lg:hidden">
                <Database className="h-5 w-5" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Sign in</CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your credentials to access the BaaS console.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setPending(true);
                  setError(null);
                  try {
                    const result = await client.auth.signIn.email({
                      email,
                      password,
                    });
                    if (result.error) {
                      setError(result.error.message ?? 'Authentication failed');
                    }
                  } catch (err) {
                    setError('An unexpected connection error occurred.');
                  } finally {
                    setPending(false);
                  }
                }}
              >
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                      Email Address
                    </Label>
                    <Input 
                      id="email" 
                      type="email"
                      placeholder="admin@authend.com"
                      value={email} 
                      onChange={(event) => setEmail(event.target.value)} 
                      className="h-10 bg-background/50 border-border/60 focus-visible:ring-primary/30"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                        Access Key
                      </Label>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-10 bg-background/50 border-border/60 pr-10 focus-visible:ring-primary/30"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  
                  {error && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs font-medium text-destructive animate-in fade-in slide-in-from-top-1">
                      {error}
                    </div>
                  )}

                  <Button 
                    className="mt-2 h-10 w-full font-bold shadow-sm transition-all active:scale-[0.98] bg-primary text-primary-foreground hover:bg-primary/90" 
                    disabled={pending}
                    type="submit"
                  >
                    {pending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Secure Access <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col border-t border-border/40 bg-muted/10 p-6">
              <div className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                <span>Backend as a Service</span>
                <span>&copy; {new Date().getFullYear()} AuthEnd</span>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return <>{props.children}</>;
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ExternalLink, Search, Settings2 } from 'lucide-react';
import type { DataRecord, PluginCategory, PluginConfig, PluginConfigUpdate, PluginManifest } from '@authend/shared';
import { parseSocialProviderList, socialProviderCatalog, socialProviderEnvKeys } from '@authend/shared';
import { client } from '../lib/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { SidePanel } from '../components/ui/side-panel';
import { CodeBlock } from '../components/ui/code-block';
import { getErrorMessage, useFeedback } from '../components/ui/feedback';

const PLUGINS_INDEX = 'https://www.better-auth.com/docs/plugins';

const CATEGORY_ORDER: PluginCategory[] = ['authentication', 'api', 'administration'];

const CATEGORY_LABELS: Record<PluginCategory, string> = {
  authentication: 'Authentication',
  api: 'API & tokens',
  administration: 'Administration',
};

function pluginStatus(plugin: PluginManifest): 'enabled' | 'disabled' | 'requires-env' {
  if (plugin.missingEnvKeys.length > 0) {
    return 'requires-env';
  }
  return plugin.installState.enabled ? 'enabled' : 'disabled';
}

function statusBadgeVariant(plugin: PluginManifest): 'default' | 'secondary' | 'destructive' {
  const status = pluginStatus(plugin);
  if (status === 'requires-env') {
    return 'destructive';
  }
  if (status === 'enabled') {
    return 'default';
  }
  return 'secondary';
}

function pluginStatusLabel(plugin: PluginManifest) {
  if (plugin.required) {
    return 'Required';
  }
  const status = pluginStatus(plugin);
  return status === 'requires-env' ? 'Needs env' : status;
}

function mergeDisplayDefaults(plugin: PluginManifest): PluginConfig {
  const merged: PluginConfig = { ...plugin.installState.config };
  for (const field of plugin.configSchema) {
    if (merged[field.key] === undefined && field.defaultValue !== undefined && field.defaultValue !== null) {
      merged[field.key] = field.defaultValue;
    }
  }
  return merged;
}

function pluginConfigSummary(plugin: PluginManifest) {
  if (plugin.configSchema.length === 0) {
    return 'No configurable fields';
  }

  const configuredFields = plugin.configSchema.filter((field) => {
    const value = plugin.installState.config[field.key];
    return value !== undefined && value !== null && value !== '';
  }).length;

  if (configuredFields === 0) {
    return `${plugin.configSchema.length} configurable field${plugin.configSchema.length === 1 ? '' : 's'}`;
  }

  return `${configuredFields}/${plugin.configSchema.length} field${plugin.configSchema.length === 1 ? '' : 's'} configured`;
}

function exampleAudienceLabel(audience: PluginManifest['examples'][number]['audience']) {
  switch (audience) {
    case 'client':
      return 'Client';
    case 'server':
      return 'Server';
    case 'api':
      return 'API';
    case 'admin':
      return 'Admin';
    default:
      return 'Example';
  }
}

function codeLanguageLabel(language: 'ts' | 'tsx' | 'js' | 'json' | 'bash' | 'http') {
  switch (language) {
    case 'ts':
      return 'TypeScript';
    case 'tsx':
      return 'TSX';
    case 'js':
      return 'JavaScript';
    case 'json':
      return 'JSON';
    case 'bash':
      return 'Shell';
    case 'http':
      return 'HTTP';
    default:
      return 'Code';
  }
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return '—';
  }
  return String(value);
}

function formatTimestamp(value: unknown) {
  if (typeof value !== 'string' || value.length === 0) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isTruthyRecordValue(value: unknown) {
  return value !== null && value !== undefined && value !== '' && value !== false;
}

function joinSocialProviderList(providerIds: string[]) {
  return providerIds.join(', ');
}

type ConfigFieldProps = {
  field: PluginManifest['configSchema'][number];
  value: unknown;
  onChange: (next: unknown) => void;
};

function ConfigField({ field, value, onChange }: ConfigFieldProps) {
  if (field.type === 'boolean') {
    return (
      <div className="space-y-0.5">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring/30"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>
            <span className="text-sm font-medium text-foreground">{field.label}</span>
            {field.helpText ? <p className="mt-0.5 text-xs font-normal text-muted-foreground">{field.helpText}</p> : null}
          </span>
        </label>
      </div>
    );
  }

  const inputType = field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text';

  return (
    <div className="space-y-1">
      <Label htmlFor={`${field.key}-input`} className="text-sm font-medium">
        {field.label}
        {field.required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
      <Input
        id={`${field.key}-input`}
        type={field.type === 'number' ? 'number' : inputType}
        placeholder={field.placeholder ?? undefined}
        value={
          field.type === 'number'
            ? value === undefined || value === null
              ? ''
              : String(value)
            : typeof value === 'string' || typeof value === 'number'
              ? String(value)
              : ''
        }
        onChange={(event) => {
          if (field.type === 'number') {
            const raw = event.target.value;
            if (raw === '') {
              onChange(undefined);
              return;
            }
            const nextNumber = Number(raw);
            onChange(Number.isFinite(nextNumber) ? nextNumber : raw);
            return;
          }
          onChange(event.target.value);
        }}
        className="h-9"
      />
    </div>
  );
}

export function PluginsPage() {
  const queryClient = useQueryClient();
  const { showNotice, confirm } = useFeedback();
  const [search, setSearch] = useState('');
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [configDrafts, setConfigDrafts] = useState<Record<string, PluginConfig>>({});
  const [capabilityDrafts, setCapabilityDrafts] = useState<Record<string, Record<string, boolean>>>({});
  const [bindingDrafts, setBindingDrafts] = useState<Record<string, Record<string, string>>>({});
  const [advancedJson, setAdvancedJson] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ['plugin-manifests'],
    queryFn: () => client.system.plugins.manifests(),
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    setConfigDrafts(Object.fromEntries(data.map((plugin) => [plugin.id, mergeDisplayDefaults(plugin)])));
    setCapabilityDrafts(Object.fromEntries(data.map((plugin) => [plugin.id, { ...plugin.installState.capabilityState }])));
    setBindingDrafts(
      Object.fromEntries(
        data.map((plugin) => [
          plugin.id,
          Object.fromEntries(
            plugin.extensionSlots.map((slot) => [slot.key, slot.selectedHandlerId ?? '']).filter((entry) => entry[1] !== ''),
          ),
        ]),
      ),
    );
    setAdvancedJson(Object.fromEntries(data.map((plugin) => [plugin.id, JSON.stringify(mergeDisplayDefaults(plugin), null, 2)])));
  }, [data]);

  const selectedPlugin = useMemo(() => data?.find((plugin) => plugin.id === selectedPluginId) ?? null, [data, selectedPluginId]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("authend:assistant-context", {
        detail: {
          selectedPluginId,
        },
      }),
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent("authend:assistant-context", {
          detail: {
            selectedPluginId: null,
          },
        }),
      );
    };
  }, [selectedPluginId]);

  const apiKeyRecordsQuery = useQuery({
    queryKey: ['plugin-ops', 'apiKey', 'records'],
    queryFn: () => client.data.resource<DataRecord>('apikey').list({ pageSize: 8, sort: 'created_at', order: 'desc' }),
    enabled: selectedPlugin?.id === 'apiKey' && selectedPlugin.installState.enabled,
  });

  const adminUsersQuery = useQuery({
    queryKey: ['plugin-ops', 'admin', 'users'],
    queryFn: () => client.data.resource<DataRecord>('user').list({ pageSize: 8, sort: 'created_at', order: 'desc' }),
    enabled: selectedPlugin?.id === 'admin' && selectedPlugin.installState.enabled,
  });

  const adminSessionsQuery = useQuery({
    queryKey: ['plugin-ops', 'admin', 'sessions'],
    queryFn: () => client.data.resource<DataRecord>('session').list({ pageSize: 12, sort: 'created_at', order: 'desc' }),
    enabled: selectedPlugin?.id === 'admin' && selectedPlugin.installState.enabled,
  });

  const onMutationError = (title: string) => (error: unknown) => {
    showNotice({
      title,
      description: getErrorMessage(error, 'Request failed'),
      variant: 'destructive',
      durationMs: 8000,
    });
  };

  const enableMutation = useMutation({
    mutationFn: (pluginId: string) => client.system.plugins.enable(pluginId),
    onSuccess: (manifest) => {
      void queryClient.invalidateQueries({ queryKey: ['plugin-manifests'] });
      void queryClient.invalidateQueries({ queryKey: ['plugin-ops'] });
      showNotice({
        title: 'Plugin enabled',
        description: `${manifest.label} is now active and provisioned.`,
        variant: 'success',
        durationMs: 4000,
      });
    },
    onError: onMutationError('Could not enable plugin'),
  });

  const disableMutation = useMutation({
    mutationFn: (pluginId: string) => client.system.plugins.disable(pluginId),
    onSuccess: (manifest) => {
      void queryClient.invalidateQueries({ queryKey: ['plugin-manifests'] });
      void queryClient.invalidateQueries({ queryKey: ['plugin-ops'] });
      showNotice({
        title: 'Plugin disabled',
        description: `${manifest.label} has been disabled and rolled back.`,
        variant: 'success',
        durationMs: 5000,
      });
      setSelectedPluginId((current) => (current === manifest.id ? null : current));
    },
    onError: onMutationError('Could not disable plugin'),
  });

  const saveConfigMutation = useMutation({
    mutationFn: async ({ pluginId, payload }: { pluginId: string; payload: PluginConfigUpdate }) =>
      client.system.plugins.saveConfig(pluginId, payload),
    onSuccess: (manifest) => {
      void queryClient.invalidateQueries({ queryKey: ['plugin-manifests'] });
      void queryClient.invalidateQueries({ queryKey: ['plugin-ops'] });
      showNotice({
        title: 'Configuration saved',
        description: `${manifest.label} settings were updated.`,
        variant: 'success',
        durationMs: 4000,
      });
    },
    onError: onMutationError('Could not save plugin config'),
  });

  const impersonatedSessions = useMemo(
    () => (adminSessionsQuery.data?.items ?? []).filter((record) => isTruthyRecordValue(record.impersonated_by)),
    [adminSessionsQuery.data?.items],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data) {
      return [];
    }
    if (!query) {
      return data;
    }
    return data.filter((plugin) => plugin.label.toLowerCase().includes(query) || plugin.id.toLowerCase().includes(query));
  }, [data, search]);

  const grouped = useMemo(() => {
    const map = new Map<PluginCategory, PluginManifest[]>();
    for (const plugin of filtered) {
      const list = map.get(plugin.category) ?? [];
      list.push(plugin);
      map.set(plugin.category, list);
    }
    return map;
  }, [filtered]);

  const requestDisable = async (plugin: PluginManifest) => {
    const confirmed = await confirm({
      title: `Disable ${plugin.label}?`,
      description:
        'This removes the plugin runtime and rolls back provisioned plugin data where supported. Re-enabling the plugin will provision it again, but deleted plugin records will not be restored.',
      confirmLabel: 'Disable plugin',
      cancelLabel: 'Keep enabled',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    disableMutation.mutate(plugin.id);
  };

  const persistConfig = () => {
    if (!selectedPlugin) {
      return;
    }

    let config = configDrafts[selectedPlugin.id] ?? mergeDisplayDefaults(selectedPlugin);
    const rawJson = advancedJson[selectedPlugin.id];

    if (rawJson) {
      try {
        config = JSON.parse(rawJson) as PluginConfig;
      } catch {
        showNotice({
          title: 'Invalid JSON',
          description: 'Fix the JSON configuration before saving this plugin.',
          variant: 'destructive',
          durationMs: 5000,
        });
        return;
      }
    }

    const payload: PluginConfigUpdate = {
      config,
      capabilityState: capabilityDrafts[selectedPlugin.id] ?? selectedPlugin.installState.capabilityState,
      extensionBindings: Object.fromEntries(
        Object.entries(bindingDrafts[selectedPlugin.id] ?? {}).filter((entry) => entry[1].trim().length > 0),
      ),
    };

    setConfigDrafts((current) => ({ ...current, [selectedPlugin.id]: config }));
    setAdvancedJson((current) => ({ ...current, [selectedPlugin.id]: JSON.stringify(config, null, 2) }));
    saveConfigMutation.mutate({ pluginId: selectedPlugin.id, payload });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <header className="shrink-0 space-y-4 border-b border-border/50  p-6 md:p-8 lg:p-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Plugins</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Enable curated{' '}
          <a
            href={PLUGINS_INDEX}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            Better Auth plugins
            <ExternalLink className="size-3.5 opacity-80" />
          </a>{' '}
          with registry-backed capabilities, extension handlers, provisioning state, and SDK/client discovery.
        </p>
        <div className="flex max-w-md items-center gap-2 rounded-lg border border-border/50 bg-muted/25 px-3 py-1 shadow-sm focus-within:border-primary/25 focus-within:ring-1 focus-within:ring-primary/15">
          <Search className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by name or id…"
            className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            aria-label="Filter plugins"
          />
        </div>
      </header>

      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-4  p-6 md:p-8 lg:p-10">
        {CATEGORY_ORDER.map((category) => {
          const plugins = grouped.get(category);
          if (!plugins?.length) {
            return null;
          }

          return (
            <section key={category} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </h3>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plugins.map((plugin) => {
                  const status = pluginStatus(plugin);
                  const canDisable = !plugin.required;
                  const enabledCapabilities = plugin.capabilities.filter((capability) => capability.enabled).length;
                  const provisionedModels = plugin.models.filter((model) => model.provisioned).length;

                  return (
                    <Card key={plugin.id} className="border-border shadow-sm">
                      <CardHeader className="gap-3 pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 space-y-1">
                            <CardTitle className="text-lg">{plugin.label}</CardTitle>
                            <CardDescription className="text-sm">{plugin.description}</CardDescription>
                          </div>
                          <Badge variant={statusBadgeVariant(plugin)} className="shrink-0 shadow-none">
                            {pluginStatusLabel(plugin)}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 pt-0">
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Version</span>
                            <span className="text-right text-foreground">{plugin.version}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Capabilities</span>
                            <span className="text-right text-foreground">
                              {enabledCapabilities}/{plugin.capabilities.length}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Provisioned models</span>
                            <span className="text-right text-foreground">
                              {provisionedModels}/{plugin.models.length}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Config</span>
                            <span className="text-right text-foreground">{pluginConfigSummary(plugin)}</span>
                          </div>
                        </div>

                        {plugin.missingEnvKeys.length > 0 ? (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                            <p className="font-semibold">Missing environment variables</p>
                            <p className="mt-1 font-mono leading-relaxed opacity-90">{plugin.missingEnvKeys.join(', ')}</p>
                          </div>
                        ) : null}

                        {plugin.installState.health.issues.length > 0 ? (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                            <p className="font-semibold">Health checks</p>
                            <p className="mt-1 leading-relaxed opacity-90">{plugin.installState.health.issues.join(' • ')}</p>
                          </div>
                        ) : null}

                        {plugin.required ? (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                            <p className="font-semibold">Required system plugin</p>
                            <p className="mt-1 leading-relaxed opacity-90">
                              This plugin is enabled by default and stays on because Authend bootstrap and admin access depend on
                              it.
                            </p>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setSelectedPluginId(plugin.id)}>
                            <Settings2 className="mr-2 size-3.5" />
                            Open config
                          </Button>

                          {plugin.installState.enabled ? (
                            canDisable ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => void requestDisable(plugin)}
                                disabled={disableMutation.isPending}
                              >
                                Disable
                              </Button>
                            ) : null
                          ) : (
                            <Button
                              size="sm"
                              className="h-8"
                              onClick={() => enableMutation.mutate(plugin.id)}
                              disabled={status === 'requires-env' || enableMutation.isPending}
                            >
                              Enable
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <SidePanel
        isOpen={Boolean(selectedPlugin)}
        onClose={() => setSelectedPluginId(null)}
        title={selectedPlugin ? selectedPlugin.label : 'Plugin'}
        footer={
          selectedPlugin ? (
            <div className="flex items-center justify-between gap-3">
              <a
                href={selectedPlugin.documentationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Better Auth docs
                <ExternalLink className="size-3.5" />
              </a>
              <Button onClick={persistConfig} disabled={saveConfigMutation.isPending}>
                Save configuration
              </Button>
            </div>
          ) : null
        }
      >
        {selectedPlugin ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm leading-relaxed text-muted-foreground">{selectedPlugin.description}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={statusBadgeVariant(selectedPlugin)} className="capitalize shadow-none">
                  {pluginStatusLabel(selectedPlugin)}
                </Badge>
                <span>Version: {selectedPlugin.version}</span>
                <span>Provisioning: {selectedPlugin.installState.provisioningState.status}</span>
                <span>Health: {selectedPlugin.installState.health.status}</span>
              </div>
            </div>

            <section className="space-y-3 border-t border-border/50 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Environment requirements</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  These env vars must be set before this plugin can be enabled.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm">
                {selectedPlugin.requiredEnv.length > 0 ? (
                  <p className="font-mono text-xs leading-relaxed text-foreground">{selectedPlugin.requiredEnv.join(', ')}</p>
                ) : (
                  <p className="text-muted-foreground">No additional environment variables required.</p>
                )}
              </div>
              {selectedPlugin.installState.health.issues.length > 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm text-amber-700">
                  <p className="font-semibold">Health issues</p>
                  <p className="mt-1 leading-relaxed">{selectedPlugin.installState.health.issues.join(' • ')}</p>
                </div>
              ) : null}
            </section>

            <section className="space-y-4 border-t border-border/50 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Capabilities</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Toggle capability groups that drive runtime features, models, and admin panels.
                </p>
              </div>
              <div className="space-y-3">
                {selectedPlugin.capabilities.map((capability) => {
                  const checked = capabilityDrafts[selectedPlugin.id]?.[capability.key] ?? capability.enabled;
                  return (
                    <label
                      key={capability.key}
                      className="flex items-start gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 rounded border-border"
                        checked={checked}
                        onChange={(event) =>
                          setCapabilityDrafts((current) => ({
                            ...current,
                            [selectedPlugin.id]: {
                              ...(current[selectedPlugin.id] ?? selectedPlugin.installState.capabilityState),
                              [capability.key]: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{capability.label}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {capability.description}
                        </span>
                        {capability.missingRequirements.length > 0 ? (
                          <span className="mt-1 block text-xs text-destructive">
                            Requires: {capability.missingRequirements.join(', ')}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            {selectedPlugin.id === 'socialAuth' ? (
              <section className="space-y-4 border-t border-border/50 pt-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Supported providers</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Toggle providers here, then use advanced JSON to add per-provider OAuth options like scopes, issuer, prompt, redirect URI, or disable flags.
                  </p>
                </div>
                <div className="space-y-3">
                  {socialProviderCatalog.map((provider) => {
                    const draft = configDrafts[selectedPlugin.id] ?? mergeDisplayDefaults(selectedPlugin);
                    const enabledProviders = parseSocialProviderList(draft.enabledProviders);
                    const checked = enabledProviders.includes(provider.id);
                    const envKeys = socialProviderEnvKeys(provider.id);

                    return (
                      <label
                        key={provider.id}
                        className="grid gap-2 border-b border-border/40 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[auto_1fr_auto]"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4 rounded border-border"
                          checked={checked}
                          onChange={(event) => {
                            const nextProviders = event.target.checked
                              ? [...enabledProviders, provider.id]
                              : enabledProviders.filter((entry) => entry !== provider.id);
                            const nextValue = joinSocialProviderList(Array.from(new Set(nextProviders)));
                            const previous = configDrafts[selectedPlugin.id] ?? mergeDisplayDefaults(selectedPlugin);
                            const updated = { ...previous, enabledProviders: nextValue };
                            setConfigDrafts((current) => ({ ...current, [selectedPlugin.id]: updated }));
                            setAdvancedJson((current) => ({ ...current, [selectedPlugin.id]: JSON.stringify(updated, null, 2) }));
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{provider.label}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            Default env: <span className="font-mono">{envKeys.join(', ')}</span>
                          </span>
                        </span>
                        <a
                          href={provider.documentationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-primary hover:underline md:text-right"
                        >
                          Docs
                        </a>
                      </label>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className="space-y-4 border-t border-border/50 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Extension bindings</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bind registry-provided code handlers to Better Auth lifecycle hooks and policies.
                </p>
              </div>
              <div className="space-y-4">
                {selectedPlugin.extensionSlots.map((slot) => (
                  <div key={slot.key} className="space-y-1 border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{slot.label}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{slot.description}</p>
                      </div>
                      <Badge variant="secondary" className="shadow-none">
                        {slot.enabled ? 'active' : 'inactive'}
                      </Badge>
                    </div>
                    {slot.availableHandlers.length > 0 ? (
                      <select
                        className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={bindingDrafts[selectedPlugin.id]?.[slot.key] ?? slot.selectedHandlerId ?? ''}
                        onChange={(event) =>
                          setBindingDrafts((current) => ({
                            ...current,
                            [selectedPlugin.id]: {
                              ...(current[selectedPlugin.id] ?? {}),
                              [slot.key]: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">No handler</option>
                        {slot.availableHandlers.map((handler) => (
                          <option key={handler.id} value={handler.id}>
                            {handler.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">No built-in handlers registered for this slot yet.</p>
                    )}
                    {slot.exampleCode ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-foreground">{slot.exampleTitle ?? 'Example handler'}</p>
                            {slot.exampleDescription ? (
                              <p className="text-xs leading-relaxed text-muted-foreground">{slot.exampleDescription}</p>
                            ) : null}
                          </div>
                          <Badge variant="secondary" className="shadow-none">
                            {codeLanguageLabel(slot.exampleLanguage)}
                          </Badge>
                        </div>
                        <CodeBlock code={slot.exampleCode} language={slot.exampleLanguage} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4 border-t border-border/50 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set runtime options for this plugin. These values are stored in `plugin_configs.config`.
                </p>
              </div>

              {selectedPlugin.configSchema.length > 0 ? (
                <div className="space-y-4">
                  {selectedPlugin.configSchema.map((field) => {
                    const draft = configDrafts[selectedPlugin.id] ?? mergeDisplayDefaults(selectedPlugin);
                    return (
                      <ConfigField
                        key={field.key}
                        field={field}
                        value={draft[field.key]}
                        onChange={(next) => {
                          const previous = configDrafts[selectedPlugin.id] ?? mergeDisplayDefaults(selectedPlugin);
                          const updated = { ...previous, [field.key]: next };
                          setConfigDrafts((current) => ({ ...current, [selectedPlugin.id]: updated }));
                          setAdvancedJson((current) => ({ ...current, [selectedPlugin.id]: JSON.stringify(updated, null, 2) }));
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                  This plugin does not expose structured config fields. Use the JSON editor below if you still need to store raw
                  config.
                </div>
              )}
            </section>

            <section className="space-y-3 border-t border-border/50 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Advanced JSON</h3>
                <p className="mt-1 text-sm text-muted-foreground">This writes directly to the stored runtime config object.</p>
              </div>
              <Textarea
                className="min-h-[180px] resize-y border-border bg-muted/10 font-mono text-xs"
                value={
                  advancedJson[selectedPlugin.id] ??
                  JSON.stringify(configDrafts[selectedPlugin.id] ?? mergeDisplayDefaults(selectedPlugin), null, 2)
                }
                onChange={(event) => {
                  const text = event.target.value;
                  setAdvancedJson((current) => ({ ...current, [selectedPlugin.id]: text }));
                  try {
                    const parsed = JSON.parse(text) as PluginConfig;
                    setConfigDrafts((current) => ({ ...current, [selectedPlugin.id]: parsed }));
                  } catch {
                    // Keep invalid JSON until the user fixes it.
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Invalid JSON will be rejected when you save.</p>
            </section>

            <section className="space-y-3 border-t border-border/50 pt-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Provisioned models & panels</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  These are the models and admin experiences currently exposed by this plugin.
                </p>
              </div>
              <div className="space-y-2">
                {selectedPlugin.models.map((model) => (
                  <div
                    key={model.key}
                    className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 text-sm last:border-b-0 last:pb-0"
                  >
                    <span className="text-foreground">{model.label}</span>
                    <Badge variant={model.provisioned ? 'default' : 'secondary'} className="shadow-none">
                      {model.provisioned ? model.tableName : 'not provisioned'}
                    </Badge>
                  </div>
                ))}
                {selectedPlugin.adminPanels.map((panel) => (
                  <div
                    key={panel.key}
                    className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 text-sm last:border-b-0 last:pb-0"
                  >
                    <span className="text-foreground">{panel.label}</span>
                    <Badge variant={panel.enabled ? 'default' : 'secondary'} className="shadow-none">
                      {panel.enabled ? 'available' : 'inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>

            {selectedPlugin.installState.enabled && selectedPlugin.id === 'apiKey' ? (
              <section className="space-y-4 border-t border-border/50 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Issued keys</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Operational view of recently issued API keys.</p>
                  </div>
                  <Link to="/data" search={{ table: 'apikey' }} className="text-xs font-medium text-primary hover:underline">
                    Open table
                  </Link>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-border/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total keys</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{apiKeyRecordsQuery.data?.total ?? '—'}</p>
                  </div>
                  <div className="rounded-md border border-border/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent active</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {(apiKeyRecordsQuery.data?.items ?? []).filter((record) => record.enabled === true).length}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rate limited</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {(apiKeyRecordsQuery.data?.items ?? []).filter((record) => record.rate_limit_enabled === true).length}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {apiKeyRecordsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading API key activity…</p>
                  ) : apiKeyRecordsQuery.error ? (
                    <p className="text-sm text-destructive">
                      {getErrorMessage(apiKeyRecordsQuery.error, 'Failed to load API keys')}
                    </p>
                  ) : (apiKeyRecordsQuery.data?.items ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No API keys found.</p>
                  ) : (
                    (apiKeyRecordsQuery.data?.items ?? []).map((record) => (
                      <div
                        key={String(record.id)}
                        className="grid gap-2 border-b border-border/40 pb-3 text-sm last:border-b-0 last:pb-0 md:grid-cols-[1.2fr_1fr_1fr_auto]"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {stringValue(record.name) !== '—' ? stringValue(record.name) : stringValue(record.start)}
                          </p>
                          <p className="text-xs text-muted-foreground">Reference: {stringValue(record.reference_id)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                          <p className="mt-1 text-foreground">{record.enabled === true ? 'Enabled' : 'Disabled'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expires</p>
                          <p className="mt-1 text-foreground">{formatTimestamp(record.expires_at)}</p>
                        </div>
                        <div className="md:text-right">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</p>
                          <p className="mt-1 text-foreground">{formatTimestamp(record.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            {selectedPlugin.installState.enabled && selectedPlugin.id === 'admin' ? (
              <section className="space-y-4 border-t border-border/50 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Managed users & sessions</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Operational view of recent users and impersonation-capable sessions.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <Link to="/data" search={{ table: 'user' }} className="text-primary hover:underline">
                      Users
                    </Link>
                    <Link to="/data" search={{ table: 'session' }} className="text-primary hover:underline">
                      Sessions
                    </Link>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-border/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Users</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{adminUsersQuery.data?.total ?? '—'}</p>
                  </div>
                  <div className="rounded-md border border-border/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Banned in sample</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">
                      {(adminUsersQuery.data?.items ?? []).filter((record) => record.banned === true).length}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Impersonation sessions
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{impersonatedSessions.length}</p>
                  </div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">Recent users</h4>
                      <p className="mt-1 text-xs text-muted-foreground">Latest users with current role and ban state.</p>
                    </div>
                    {adminUsersQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading users…</p>
                    ) : adminUsersQuery.error ? (
                      <p className="text-sm text-destructive">{getErrorMessage(adminUsersQuery.error, 'Failed to load users')}</p>
                    ) : (adminUsersQuery.data?.items ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users found.</p>
                    ) : (
                      (adminUsersQuery.data?.items ?? []).map((record: DataRecord) => (
                        <div
                          key={String(record.id)}
                          className="grid gap-2 border-b border-border/40 pb-3 text-sm last:border-b-0 last:pb-0 md:grid-cols-[1.2fr_auto_auto]"
                        >
                          <div>
                            <p className="font-medium text-foreground">{stringValue(record.name)}</p>
                            <p className="text-xs text-muted-foreground">{stringValue(record.email)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
                            <p className="mt-1 text-foreground">{stringValue(record.role)}</p>
                          </div>
                          <div className="md:text-right">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">State</p>
                            <p className="mt-1 text-foreground">{record.banned === true ? 'Banned' : 'Active'}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">Impersonation sessions</h4>
                      <p className="mt-1 text-xs text-muted-foreground">Recent sessions with impersonation metadata.</p>
                    </div>
                    {adminSessionsQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading sessions…</p>
                    ) : adminSessionsQuery.error ? (
                      <p className="text-sm text-destructive">
                        {getErrorMessage(adminSessionsQuery.error, 'Failed to load sessions')}
                      </p>
                    ) : impersonatedSessions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No impersonation sessions found in the recent sample.</p>
                    ) : (
                      impersonatedSessions.map((record) => (
                        <div
                          key={String(record.id)}
                          className="grid gap-2 border-b border-border/40 pb-3 text-sm last:border-b-0 last:pb-0 md:grid-cols-[1fr_1fr_auto]"
                        >
                          <div>
                            <p className="font-medium text-foreground">Session {stringValue(record.id)}</p>
                            <p className="text-xs text-muted-foreground">User: {stringValue(record.user_id)}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Impersonated by</p>
                            <p className="mt-1 text-foreground">{stringValue(record.impersonated_by)}</p>
                          </div>
                          <div className="md:text-right">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</p>
                            <p className="mt-1 text-foreground">{formatTimestamp(record.created_at)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            {selectedPlugin.installState.enabled && selectedPlugin.examples.length > 0 ? (
              <section className="space-y-3 border-t border-border/50 pt-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Examples</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use these examples after enabling the plugin. They are filtered to the capabilities currently turned on.
                  </p>
                </div>
                <div className="space-y-4">
                  {selectedPlugin.examples.map((example) => (
                    <div key={example.key} className="space-y-2 border-b border-border/40 pb-4 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{example.title}</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{example.description}</p>
                        </div>
                        <Badge variant="secondary" className="shadow-none">
                          {exampleAudienceLabel(example.audience)}
                        </Badge>
                      </div>
                      <CodeBlock code={example.code} language={example.language} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </SidePanel>
    </div>
  );
}

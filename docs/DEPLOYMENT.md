# AuthEnd Deployment Guide

This guide keeps deployment boring: one AuthEnd service, one Postgres database, one admin UI served by the API.

## Promotion Model

Use three environments:

1. local: daily development, schema drafting, plugin experimentation
2. staging: production-like config, migration rehearsal, SDK regeneration
3. production: only reviewed migrations and validated environment settings

Do not edit production first. Promote changes in this order:

1. make schema or settings changes locally
2. commit generated migrations if you rely on shared promotion history
3. apply and test on staging
4. regenerate the SDK from staging when the API surface changes
5. validate production env with `bun run --cwd apps/api validate-env`
6. apply the same migrations in production
7. regenerate and publish the production-facing SDK artifacts if needed

## Migration Promotion

Treat generated SQL as deployable artifacts.

1. Generate or review migrations locally.
2. Run `Preview pending` in the admin before apply.
3. Take a backup before destructive changes.
4. Apply migrations on staging first.
5. Run smoke checks against auth, CRUD, storage, and any enabled plugins.
6. Promote the same migration set to production. Do not edit the SQL differently per environment.

If a production migration fails:

1. stop and inspect the failing SQL
2. do not keep applying new migrations on top of the broken state
3. restore from backup if data integrity is at risk
4. fix the migration source in git
5. preview again before the next apply

## Predeploy Validation

Run these before every staging or production deploy:

```bash
bun run --cwd apps/api validate-env
bun test
bun run --cwd apps/admin build
```

The env validator catches missing required keys and warns when production values still look development-oriented, such as:

- `APP_URL` or `ADMIN_URL` using `http://`
- empty `CORS_ORIGIN`
- `DATABASE_URL` still pointing at localhost

## Docker Hosting

AuthEnd only needs Bun and Postgres. A practical Docker flow is:

1. build the admin bundle
2. install production dependencies
3. run `bun run bootstrap` once for first-time setup
4. run `bun run start`

Minimal container lifecycle:

```bash
bun install --frozen-lockfile
bun run --cwd apps/admin build
bun run --cwd apps/api validate-env
bun run --cwd apps/api bootstrap
bun run --cwd apps/api start
```

Recommended container setup:

- separate Postgres from the app container
- mount persistent storage if using the local file-storage driver
- pass secrets through the container platform, not committed files
- run backups against configured storage before destructive migrations

## VPS Hosting

For a simple VPS deploy:

1. install Bun and Postgres client tools (`pg_dump`, `pg_restore`)
2. clone the repo and install dependencies
3. set production env vars
4. run `bun run --cwd apps/api validate-env`
5. run `bun run bootstrap` once if the database is new
6. run the API under `systemd`, `supervisord`, or another process manager
7. place Nginx or Caddy in front for TLS and reverse proxying

Keep these on the host:

- the app directory
- persistent local storage path if you use the local storage driver
- backup staging directory if backups are enabled

## Reverse Proxy And TLS

### Nginx

```nginx
server {
  listen 80;
  server_name api.example.com admin.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name api.example.com admin.example.com;

  ssl_certificate /etc/letsencrypt/live/example/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host $host;
  }
}
```

### Caddy

```caddy
api.example.com, admin.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

## Operator Checklist

Before production:

- backups run successfully
- SMTP probe is healthy if auth emails are required
- S3 probe is healthy if the storage driver is `s3`
- migrations previewed and reviewed
- SDK regenerated if the schema or API config changed

After production:

- confirm setup overview is healthy
- confirm recent jobs and backups are succeeding
- keep the previous deploy available until the new release is confirmed

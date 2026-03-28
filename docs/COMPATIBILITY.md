# AuthEnd Compatibility Notes

## Server And SDK

Treat the server and generated SDK artifacts as a matched pair.

- `@authend/sdk` is the runtime package
- `GET /api/system/sdk-schema` is the schema contract for your deployed server
- generated client files must be regenerated whenever schema or API config changes

Practical rule:

1. deploy or promote the server changes
2. regenerate the SDK from that target environment
3. publish or ship the updated client artifacts together

Do not assume an SDK generated from local or staging still matches production after more schema edits.

## Release Notes Discipline

When you cut a release, record:

- AuthEnd server version or git commit
- generated SDK commit or package version
- migration keys included in the release
- enabled plugin changes

That gives operators a rollback target and gives client teams a clear compatibility boundary.

## Better Auth And Dependency Upgrades

AuthEnd depends on Better Auth runtime behavior. Upgrade it deliberately:

1. pin the dependency version
2. run auth integration tests
3. validate admin sign-in and app sign-in
4. only then promote the upgrade

The same rule applies to Postgres client tools, SMTP providers, and object-storage providers: treat each upgrade as a compatibility event, not a casual patch.

## Environment Promotions

Local, staging, and production should share:

- the same migration files
- the same plugin set unless a deliberate environment exception is documented
- the same SDK generation flow

They should differ only in deployment-specific values such as URLs, credentials, buckets, and database hosts.

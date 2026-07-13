# Security and privacy

## Supported version

The latest version on `main` is supported.

## Reporting

Report vulnerabilities privately through GitHub's security advisory feature
when the repository is hosted remotely. Do not include private game exports in
public issues.

## Data handling

- The application has no backend, account system, analytics, or advertising.
- Game data remains in local IndexedDB until a user exports or deletes it.
- Imported JSON is size-limited, schema-validated, integrity-checked, and
  imported under new identifiers.
- Player names and game history are excluded from copied diagnostics.
- No secrets are required for normal development or deployment.

# Publishing Runbook

## Canonical locations

- Repository: https://github.com/Moukt4r/catan-companion-v2
- Live site: https://moukt4r.github.io/catan-companion-v2/
- CI workflow: `.github/workflows/ci.yml`
- Pages workflow: `.github/workflows/deploy.yml`
- Release notes: `CHANGELOG.md`

## What gets published

GitHub Pages publishes the `dist/` directory produced inside GitHub Actions.
The directory is uploaded with `actions/upload-pages-artifact` and deployed
with `actions/deploy-pages`.

`dist/` is generated, ignored by Git, and must not be committed. There is no
`gh-pages` branch and no manual file copy into Pages.

The Pages build sets:

```text
VITE_BASE_PATH=/<repository-name>/
```

This makes JavaScript, CSS, PWA icons, the manifest, the service worker, its
navigation fallback, start URL, and scope work at
`/catan-companion-v2/` rather than the domain root.

## One-time repository setup

The existing repository is already configured. For a replacement repository:

1. Create the GitHub repository.
2. Push `main`, including `.github/workflows/`.
3. In **Settings > Pages**, set **Source** to **GitHub Actions**.
4. Ensure Actions are enabled and the deployment job can use the
   `github-pages` environment.
5. Keep the workflow permissions limited to:
   - `contents: read`
   - `pages: write`
   - `id-token: write`

No application secret is required.

When pushing new or changed files under `.github/workflows/` over HTTPS, the
GitHub credential must be authorized to update workflows. A classic PAT or
OAuth token typically needs `workflow` permission in addition to repository
write access.

## Routine release

1. Synchronize version metadata:
   - `package.json`
   - `APPLICATION_VERSION` in `src/application/persistence.ts`
2. Add user-visible changes to `CHANGELOG.md`.
3. Run:

   ```powershell
   pnpm format:check
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm test:coverage
   pnpm build
   pnpm test:e2e
   ```

4. Commit with a conventional commit subject.
5. Push `main`.
6. Confirm both workflows pass:
   - **CI**
   - **Deploy GitHub Pages**
7. Open the live URL and accept the in-app update prompt when it appears.

The deployment workflow can also be started manually with **Run workflow**.

## Exact Pages-path preview

Normal local development uses `/`:

```powershell
pnpm dev
```

To reproduce the GitHub Pages mount path on Windows PowerShell:

```powershell
$env:VITE_BASE_PATH = "/catan-companion-v2/"
pnpm build
pnpm preview --port 4173
```

Open:

```text
http://127.0.0.1:4173/catan-companion-v2/
```

Then clear the temporary environment value when finished:

```powershell
Remove-Item Env:VITE_BASE_PATH
```

For bash-compatible shells:

```bash
VITE_BASE_PATH=/catan-companion-v2/ pnpm build
VITE_BASE_PATH=/catan-companion-v2/ pnpm preview --port 4173
```

## Workflow behavior

### CI

Runs on pull requests and pushes to `main`:

- frozen pnpm install;
- formatting, lint, type checking;
- coverage-enforced Vitest suite;
- production build;
- desktop/mobile Chromium, desktop Firefox, and mobile WebKit Playwright flows.

Superseded runs on the same branch are cancelled.

### Deploy GitHub Pages

Runs on pushes to `main` and manual dispatch:

- full local quality gate and coverage;
- desktop/mobile Chromium, desktop Firefox, and mobile WebKit Playwright flows;
- repository-path production build;
- Pages artifact upload;
- deployment;
- retrying public HTML smoke check.

Only one Pages deployment runs at a time; a newer run cancels the older one.

## Live verification

At minimum verify:

1. The live URL returns HTTP 200.
2. The page title is `Catan Table Companion`.
3. The generated JavaScript bundle, `manifest.webmanifest`, and `sw.js` return
   HTTP 200.
4. `manifest.webmanifest` uses `/catan-companion-v2/` for `start_url`, `scope`,
   and icon paths.
5. The application can be reopened offline after the first successful load.

The workflow performs the first two checks automatically. The remaining checks
are useful after PWA or base-path changes.

## PWA update behavior

The service worker downloads a new release in the background. The application
shows an update prompt and does not force a reload during an unresolved roll,
save, import, or paused game.

If the live site was just deployed but an existing tab still shows an older
version:

1. Complete or pause the current game action safely.
2. Use the in-app update prompt.
3. If no prompt appears, close all application tabs and reopen the live URL.
4. Use a hard refresh only after confirming the game is durably saved.

IndexedDB game state is separate from the service-worker asset cache.

## Rollback

Prefer a non-destructive Git revert:

```powershell
git revert <bad-commit>
git push origin main
```

The new push runs the same tested Pages deployment path. Do not rewrite `main`
or manually edit the deployed artifact.

Before rolling back code that introduced a newer persisted document version,
confirm that the previous release can safely read it. If compatibility is
uncertain, fix forward instead and preserve/export affected game data.

## Troubleshooting

### Push rejected for workflow scope

GitHub may reject a push that creates or changes `.github/workflows/` when the
HTTPS credential cannot update Actions workflows. Reauthorize the credential
with workflow permission, then retry the same push.

### Pages workflow did not start

- Confirm the source is **GitHub Actions** under repository Pages settings.
- Confirm the commit reached `main`.
- Open **Actions > Deploy GitHub Pages** and inspect skipped or cancelled runs.

### Build succeeds locally but Pages assets return 404

- Rebuild with `VITE_BASE_PATH=/catan-companion-v2/`.
- Check the generated `dist/index.html` script and stylesheet URLs.
- Check manifest `start_url`, `scope`, and icons.
- Do not add root-absolute asset paths outside Vite's base handling.

### Deployment succeeds but the old UI remains

This is normally the installed service worker waiting for safe activation.
Follow the PWA update steps above rather than deleting IndexedDB.

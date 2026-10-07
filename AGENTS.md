# pi-extensions

When recording or editing an ADR, use `domain-modelling`'s format.

Monorepo of [pi-coding-agent](https://pi.dev) extensions. Each package in `packages/` is an independent pi extension published to npm under `@tifan/`.

Release publishing is handled manually. For release notes, use the `creating-changesets` project skill. Don't run `npm publish` or bump versions in `package.json`.

## Structure

```
packages/pi-*/
```

Each package has:

- `package.json` with `"pi": { "extensions": [...] }` declaring entry points and `keywords: ["pi-package", "pi-extension"]`.
- `src/index.ts` as the pi extension entry point.
- Supporting `.ts` files in `src/`.
- `tsconfig.json` extending `../../tsconfig.base.json`.
- `LICENSE` symlinked to the root `LICENSE`.
- `README.md` with an install snippet and usage or commands when applicable, plus a `Credits` section if the package is a fork.

Keep the root `README.md` package table in sync whenever a package is added, removed, renamed, or its package README or description changes.

## Writing extensions

Extensions are TypeScript loaded by pi via [jiti](https://github.com/unjs/jiti). No build step. The entry point exports a default function receiving `ExtensionAPI`.

Available runtime imports (provided by pi at load time):

- `@earendil-works/pi-coding-agent` — extension types, components, utilities
- `@earendil-works/pi-tui` — TUI components
- `@earendil-works/pi-ai` — AI client types
- `@earendil-works/pi-agent-core` — agent message types
- `typebox` — schema definitions for tool parameters

Pi extension docs: https://pi.dev/docs/latest/extensions

## Local development

Install dependencies once at the repo root:

```bash
bun install
```

To try a package without publishing:

```bash
pi install /absolute/path/to/pi-extensions/packages/pi-<name>
```

## Checks after code changes

From the repo root:

```bash
bun run typecheck
bun run lint
bun run format
```

Fix errors before moving on. Keep typecheck before final format because type errors may need code changes, and formatting should be the last cleanup step.

## Tests

Keep each `*.test.ts` beside the source it tests in `src/`, such as `src/foo.test.ts` beside `src/foo.ts`. Use Node's built-in `node:test` and `node:assert/strict`, and add `node --experimental-strip-types --test src/foo.test.ts` to the package's `test` script. Keep test files out of published `files` patterns.

## Adding a package

1. Create `packages/pi-<name>/`.
2. Copy the structure of an existing package: `package.json`, `tsconfig.json`, `README.md`, `LICENSE` (symlink → `../../LICENSE`).
3. Add the extension entry point at `src/index.ts`.
4. Set `"name": "@tifan/pi-<name>"` and `"pi": { "extensions": ["./src/index.ts"] }`.
5. Add `"publishConfig": { "access": "public", "provenance": true }`.
6. Stop there and tell Tifan. For the first manual publish, give Tifan these commands:
   ```bash
   cd packages/pi-<name>
   npm publish --provenance=false
   npm trust github @tifan/pi-<name> \
     --repository tifandotme/pi-extensions \
     --file release.yml \
     --allow-publish \
     --yes
   ```
   Publish before configuring trust because npm requires the package to exist. `--provenance=false` applies only to the local bootstrap publish; later releases use OIDC provenance in GitHub Actions.

## Conventions

- TypeScript, no build step.
- Conventional Commits (`feat`, `fix`, `chore`, `docs`, ...). Lowercase subject, no period, header under 72 chars.
- One npm package per extension. Prefer no cross-package imports. If a package reuses another extension's published functionality, declare the dependency and import its public export.
- Keep package TypeScript under `src/`.
- `master` is the default branch.
- Bun is the package manager; commit `bun.lock`.

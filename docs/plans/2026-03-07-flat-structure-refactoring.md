# Flat Structure Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate from a monorepo workspace structure to a flat single-package layout optimized for Cloudflare Pages Functions.

**Architecture:** All frontend (React/Vite) and backend (Hono/CF Pages Functions) source lives at the project root under a single `package.json` managed by Bun. The `functions/api/` directory retains only CF Pages route files and Hono app logic; all other config files move to root.

**Tech Stack:** Bun, React 19, Vite 7, Hono 4, Cloudflare Pages Functions, Drizzle ORM, Supabase

---

## Pre-conditions

- Working directory: `/Users/tuesdaymorning/Devguru/mr-cha-dashboard`
- Package manager: `bun` (not `npm`, not `pnpm`)
- Do NOT run `npm install` at any step

---

## Task 1: Commit & push the current state (snapshot)

**Purpose:** Create a clean restore point before any files are moved or deleted.

**Files:** none modified

**Step 1: Stage all current changes**

```bash
git add -A
```

**Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
snapshot: pre-refactoring monorepo state

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Step 3: Push**

```bash
git push
```

Expected: push succeeds, branch `main` is up to date on remote.

---

## Task 2: Move frontend files to project root

**Purpose:** Lift all Vite/React source from `apps/web/` to the project root.

**Files to move:**

| From | To |
|------|----|
| `apps/web/src/` | `src/` |
| `apps/web/public/` | `public/` |
| `apps/web/index.html` | `index.html` |
| `apps/web/vite.config.ts` | `vite.config.ts` |
| `apps/web/tsconfig.json` | `tsconfig.json` |
| `apps/web/tsconfig.app.json` | `tsconfig.app.json` |
| `apps/web/tsconfig.node.json` | `tsconfig.node.json` |
| `apps/web/eslint.config.js` | `eslint.config.js` |

**Step 1: Move source directories and config files**

```bash
mv apps/web/src .
mv apps/web/public .
mv apps/web/index.html .
mv apps/web/vite.config.ts .
mv apps/web/tsconfig.json .
mv apps/web/tsconfig.app.json .
mv apps/web/tsconfig.node.json .
mv apps/web/eslint.config.js .
```

**Step 2: Verify files landed correctly**

```bash
ls src/ public/ index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js
```

Expected: all listed without "No such file" errors.

---

## Task 3: Move API support files to project root

**Purpose:** Move Drizzle config/schema and dev secrets to root so they resolve correctly from `wrangler.toml`.

**Files to move:**

| From | To |
|------|----|
| `functions/api/drizzle/` | `drizzle/` |
| `functions/api/drizzle.config.ts` | `drizzle.config.ts` |
| `functions/api/.dev.vars` | `.dev.vars` |
| `functions/api/.dev.vars.example` | `.dev.vars.example` |

**Step 1: Move Drizzle files**

```bash
mv functions/api/drizzle .
mv functions/api/drizzle.config.ts .
```

**Step 2: Move dev secrets files (they are gitignored, safe to move)**

```bash
mv functions/api/.dev.vars . 2>/dev/null || echo "no .dev.vars to move"
mv functions/api/.dev.vars.example . 2>/dev/null || echo "no .dev.vars.example to move"
```

**Step 3: Verify**

```bash
ls drizzle/ drizzle.config.ts
```

Expected: `drizzle/` directory with `schema.ts` inside, `drizzle.config.ts` at root.

---

## Task 4: Fix `drizzle.config.ts` path

**Purpose:** The `out` path in `drizzle.config.ts` was relative to `functions/api/`. Now that the file is at root, the path must be corrected.

**File:** `drizzle.config.ts`

**Current content:**
```ts
out: '../../supabase/migrations',
```

**Required change:** `../../supabase/migrations` → `./supabase/migrations`

**Step 1: Open and edit `drizzle.config.ts`**

Replace `out: '../../supabase/migrations'` with `out: './supabase/migrations'`.

Final file should be:
```ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './drizzle/schema.ts',
  out: './supabase/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
```

**Step 2: Verify the file looks correct**

Read the file and confirm `out` path is `./supabase/migrations`.

---

## Task 5: Update `wrangler.toml`

**Purpose:** The build output directory changed from `apps/web/dist` to `dist`.

**File:** `wrangler.toml`

**Current content:**
```toml
name = "mr-cha-dashboard"
compatibility_date = "2026-03-07"
pages_build_output_dir = "apps/web/dist"
```

**Step 1: Edit `wrangler.toml`**

Replace `pages_build_output_dir = "apps/web/dist"` with `pages_build_output_dir = "dist"`.

Final file:
```toml
name = "mr-cha-dashboard"
compatibility_date = "2026-03-07"
pages_build_output_dir = "dist"
```

---

## Task 6: Create merged root `package.json`

**Purpose:** Replace the workspace root `package.json` with a single flat package that includes all deps from both `apps/web/` and `functions/api/`.

**File:** `package.json` (overwrite)

**Step 1: Write the new `package.json`**

```json
{
  "name": "mr-cha-dashboard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev":         "bun run dev:web & bun run dev:api",
    "dev:web":     "vite",
    "dev:api":     "bun run functions/api/dev-server.ts",
    "dev:pages":   "wrangler pages dev dist --compatibility-date=2026-03-07",
    "build":       "tsc -b && vite build",
    "deploy":      "bun run build && wrangler pages deploy dist --project-name=mr-cha-dashboard",
    "db:generate": "drizzle-kit generate --config=drizzle.config.ts",
    "db:push":     "drizzle-kit push --config=drizzle.config.ts",
    "db:studio":   "drizzle-kit studio --config=drizzle.config.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.19.11",
    "@supabase/supabase-js": "^2.98.0",
    "dotenv": "^17.3.1",
    "drizzle-orm": "^0.45.1",
    "hono": "^4.12.5",
    "postgres": "^3.4.8",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260307.1",
    "@eslint/js": "^9.39.1",
    "@types/node": "^25.3.5",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "drizzle-kit": "^0.31.9",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.48.0",
    "vite": "^7.3.1",
    "wrangler": "^4.71.0"
  }
}
```

> Note: `drizzle-kit` is moved to `devDependencies` (it's a CLI tool, not a runtime dependency). No `workspaces` field.

---

## Task 7: Delete workspace artifacts

**Purpose:** Remove the now-redundant sub-package configs, lock files, and `apps/` directory.

**Step 1: Remove workspace package files from `functions/api/`**

```bash
rm functions/api/package.json
rm functions/api/package-lock.json 2>/dev/null || true
```

> Keep `functions/api/tsconfig.json` — wrangler uses it for CF Workers type checking.

**Step 2: Remove `package-lock.json` files (switching to bun)**

```bash
rm package-lock.json 2>/dev/null || true
rm apps/web/package-lock.json 2>/dev/null || true
```

**Step 3: Remove the now-empty `apps/web/` and `apps/` directories**

```bash
rm -rf apps/
```

**Step 4: Verify `apps/` is gone and `functions/api/` still has its code**

```bash
ls apps/ 2>&1 || echo "apps/ removed OK"
ls functions/api/
```

Expected: `apps/` not found, `functions/api/` shows `[[path]].ts app.ts mock-data.ts dev-server.ts dev-server.mjs tsconfig.json`.

---

## Task 8: Install dependencies with Bun

**Purpose:** Regenerate a single `bun.lock` from the new merged `package.json`.

**Step 1: Remove old `node_modules`**

```bash
rm -rf node_modules
```

**Step 2: Install**

```bash
bun install
```

Expected: resolves all packages, creates/updates `bun.lock`, no errors.

**Step 3: Verify single `node_modules` at root**

```bash
ls node_modules | head -5
ls apps/ 2>&1 || echo "no apps/ - good"
ls functions/api/node_modules 2>&1 || echo "no functions/api/node_modules - good"
```

Expected: root `node_modules` exists, no `apps/`, no `functions/api/node_modules`.

---

## Task 9: Verify build passes

**Purpose:** Confirm `tsc` + Vite build succeeds with the new structure.

**Step 1: Run build**

```bash
bun run build
```

Expected: TypeScript compiles, Vite builds to `dist/`, no errors.

**Step 2: Confirm output directory**

```bash
ls dist/
```

Expected: `index.html`, `assets/` directory (Vite output).

---

## Task 10: Verify dev server starts

**Purpose:** Quick smoke test that both dev servers start without errors.

**Step 1: Start Vite dev server (frontend only)**

```bash
bun run dev:web &
sleep 3
curl -s http://localhost:5173 | head -5
kill %1
```

Expected: returns HTML with `<!doctype html>` or similar.

**Step 2: Check API dev server starts**

```bash
bun run dev:api &
sleep 3
curl -s http://localhost:8788/api/health
kill %1
```

Expected: `{"ok":true,"service":"mr-cha-dashboard-api",...}` (or similar JSON).

---

## Task 11: Commit the refactoring

**Purpose:** Record the completed refactoring as a single clean commit.

**Step 1: Stage all changes**

```bash
git add -A
```

**Step 2: Review what's staged**

```bash
git status
git diff --cached --stat
```

Expected: shows moved files (deleted from old paths, added at new paths), updated `package.json`, `wrangler.toml`, `drizzle.config.ts`.

**Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: migrate from monorepo to flat single-package structure

- Move apps/web/{src,public,index.html,vite.config.ts,tsconfig*,eslint.config.js} to root
- Move functions/api/{drizzle/,drizzle.config.ts,.dev.vars*} to root
- Merge all dependencies into single root package.json (Bun)
- Remove apps/ directory and workspace package configs
- Update wrangler.toml: pages_build_output_dir = "dist"
- Fix drizzle.config.ts: out path relative to new root location

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Step 4: Push**

```bash
git push
```

---

## Verification Checklist

After all tasks complete, confirm:

- [ ] `bun run build` succeeds → `dist/` created
- [ ] `bun run dev:web` starts Vite on port 5173
- [ ] `bun run dev:api` starts API on port 8788 (or configured port)
- [ ] `curl http://localhost:5173/api/health` returns JSON via Vite proxy
- [ ] No `apps/` directory
- [ ] No `functions/api/node_modules`
- [ ] Single `bun.lock` at root
- [ ] `git status` is clean after final commit

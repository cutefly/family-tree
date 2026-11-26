# Family Tree Web Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PostgreSQL-backed Korean family tree (가계도) web application with owner editing (`family-chart` `create-tree` pattern) and read-only shareable views (`1-basic-tree` pattern).

**Architecture:** A single Next.js App Router (TypeScript) application using Prisma ORM with PostgreSQL for normalized `User`, `FamilyTree`, `Person`, and `Marriage` storage. Pure domain modules (`lib/family-graph.ts`, `lib/validation.ts`) handle Korean name/bon-gwan formatting, child ordering (`BY_ORDER` / `BY_GENDER_THEN_ORDER`), cycle detection, and bidirectional conversion with `family-chart` v2.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, PostgreSQL, Prisma ORM, `family-chart`, Vitest

**Spec:** `docs/superpowers/specs/2026-11-26-family-tree-design.md`

---

## Global Constraints

- Use PostgreSQL via Prisma ORM (`prisma/schema.prisma`) with `User`, `FamilyTree`, `Person`, `Marriage` models.
- Use `bonKo` and `bonHanja` (not `bonGwan*`) for ancestral origin field names across schema, API, and UI.
- Support Korean + Hanja for both personal names (`nameKo`, `nameHanja`) and clan/surname (`bonKo`, `bonHanja`, `surnameKo`, `surnameHanja`).
- Allow spouses without a given name (`nameKo === null`) as long as `surnameKo` is present; reject `Person` if both `nameKo` and `surnameKo` are empty.
- Support `FamilyTree` global clan defaults (`bonKo`, `bonHanja`, `surnameKo`, `surnameHanja`) and `childOrderMode` (`BY_ORDER` | `BY_GENDER_THEN_ORDER`).
- Use `family-chart` built-in `setAncestryDepth` and `setProgenyDepth` for generation range display (no custom subgraph filter).
- All write endpoints require authenticated owner (`tree.ownerId === session.userId`); `/share/[token]` is read-only and requires `isShared === true`.

## Review Focus

1. **Spouse with only `bonKo` + `surnameKo` and no `nameKo`**: `formatPersonDisplayName` must render `"김해 김씨"` (or `"김씨"` if `bonKo` is null) without `"null"` or `"undefined"` strings — pinned in Task 2.
2. **Multi-generation circular parent reference**: Assigning a grandchild or descendant as a person's `fatherId`/`motherId` must be rejected with `400` — pinned in Task 3 & Task 5.
3. **Unordered or partially null `birthOrder` in `BY_GENDER_THEN_ORDER`**: Children with `null` `birthOrder` must sort after numbered siblings within each gender group without throwing `NaN` — pinned in Task 2.
4. **Disabled share link (`isShared: false`)**: Accessing `/api/share/[token]` with a valid token when `isShared === false` must return `404` — pinned in Task 5.
5. **Cross-owner mutation attempt**: Authenticated user B attempting `PUT /api/trees/[treeId]/graph` or `PATCH /api/trees/[treeId]` on user A's tree must receive `403` — pinned in Task 5.

---

### Task 1: Project Scaffolding, Prisma Schema & Vitest Setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`
- Create: `prisma/schema.prisma`, `lib/prisma.ts`, `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: `prisma` singleton (`export const prisma: PrismaClient` in `lib/prisma.ts`), Prisma generated types (`User`, `FamilyTree`, `Person`, `Marriage`, `Gender`, `ChildOrderMode`).

- [ ] **Step 1: Initialize Next.js TypeScript project and install dependencies**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --yes
npm install @prisma/client family-chart d3
npm install -D prisma vitest @vitejs/plugin-react tsx
```
Expected: `package.json` created with Next.js, `@prisma/client`, `family-chart`, and `vitest`.

- [ ] **Step 2: Write `prisma/schema.prisma` and `.env.example`**

Define `User`, `FamilyTree` (`bonKo`, `bonHanja`, `surnameKo`, `surnameHanja`, `childOrderMode`, `rootPersonId`, `shareToken`, `isShared`), `Person` (`nameKo`, `nameHanja`, `surnameKo`, `surnameHanja`, `bonKo`, `bonHanja`, `gender`, `birthDate`, `deathDate`, `birthOrder`, `memo`, `fatherId`, `motherId`), and `Marriage` (`@@unique([treeId, person1Id, person2Id])`) with `Gender` (`MALE`, `FEMALE`, `OTHER`) and `ChildOrderMode` (`BY_ORDER`, `BY_GENDER_THEN_ORDER`). Add `.env.example` with `DATABASE_URL` and `SESSION_SECRET`.

- [ ] **Step 3: Create `lib/prisma.ts` and `vitest.config.ts`**

Export global-cached `prisma` instance in `lib/prisma.ts`. Configure `vitest.config.ts` with `@/*` path alias resolution.

- [ ] **Step 4: Write and run smoke test & Prisma validation**

Create `lib/__tests__/smoke.test.ts` asserting `1 + 1 === 2`.
Run:
```bash
npx prisma validate && npx prisma generate && npx vitest run lib/__tests__/smoke.test.ts
```
Expected: Prisma schema valid, client generated, 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Prisma PostgreSQL schema and Vitest"
```

---

### Task 2: Domain Logic — Display Name, Child Ordering & `family-chart` Adapter

**Files:**
- Create: `lib/family-graph.ts`
- Test: `lib/__tests__/family-graph.test.ts`

**Interfaces:**
- Consumes: Prisma types (`Person`, `Marriage`, `ChildOrderMode`, `Gender`)
- Produces:
  - `export type FamilyChartDatum = { id: string; data: FamilyChartPersonData; rels: { parents: string[]; children: string[]; spouses: string[] } }`
  - `export function formatPersonDisplayName(person: Pick<Person, 'nameKo' | 'nameHanja' | 'surnameKo' | 'bonKo'>): { primary: string; secondary: string | null }`
  - `export function sortChildren<T extends Pick<Person, 'gender' | 'birthOrder' | 'createdAt'>>(children: T[], mode: ChildOrderMode): T[]`
  - `export function toFamilyChartData(persons: Person[], marriages: Marriage[], childOrderMode: ChildOrderMode): FamilyChartDatum[]`
  - `export function fromFamilyChartData(nodes: FamilyChartDatum[]): { persons: SyncPersonInput[]; marriages: Array<{ person1Id: string; person2Id: string }> }`

- [ ] **Step 1: Write failing unit tests in `lib/__tests__/family-graph.test.ts`**

Include tests for:
- `formatPersonDisplayName` with `nameKo` + `nameHanja` -> `{ primary: "홍길동", secondary: "洪吉童" }`
- `formatPersonDisplayName` for spouse with `nameKo: null, bonKo: "김해", surnameKo: "김"` -> `{ primary: "김해 김씨", secondary: null }` and `bonKo: null, surnameKo: "이"` -> `{ primary: "이씨", secondary: null }`
- `sortChildren` with `BY_ORDER` (1, 2, null) and `BY_GENDER_THEN_ORDER` (`MALE` sorted by `birthOrder` before `FEMALE`, nulls last)
- `toFamilyChartData` building bidirectional `parents`, sorted `children`, and `spouses`, mapping `OTHER` gender safely to `'M'` in `data.gender` while preserving `data.actualGender`
- `fromFamilyChartData` extracting `fatherId`/`motherId` from `rels.parents` (using gender lookup) and deduplicated normalized spouse pairs

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run lib/__tests__/family-graph.test.ts`
Expected: FAIL with module/function not found.

- [ ] **Step 3: Implement `lib/family-graph.ts`**

Implement `formatPersonDisplayName`, `sortChildren`, `toFamilyChartData`, and `fromFamilyChartData` matching the exact exported signatures.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run lib/__tests__/family-graph.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/family-graph.ts lib/__tests__/family-graph.test.ts
git commit -m "feat: add family-graph adapter, Korean name formatting, and child ordering"
```

---

### Task 3: Validation & Integrity Rules

**Files:**
- Create: `lib/validation.ts`
- Test: `lib/__tests__/validation.test.ts`

**Interfaces:**
- Produces:
  - `export class ValidationError extends Error`
  - `export function validatePersonName(input: { nameKo?: string | null; surnameKo?: string | null }): void`
  - `export function normalizeSpousePair(id1: string, id2: string): [string, string]`
  - `export function validateParentLinks(persons: Array<{ id: string; fatherId: string | null; motherId: string | null }>): void`

- [ ] **Step 1: Write failing unit tests in `lib/__tests__/validation.test.ts`**

Test:
- `validatePersonName` throws `ValidationError` when both `nameKo` and `surnameKo` are empty/whitespace; passes when either is non-empty.
- `normalizeSpousePair("b", "a")` returns `["a", "b"]`; `normalizeSpousePair("a", "a")` throws `ValidationError`.
- `validateParentLinks` throws `ValidationError` on self-parent (`id === fatherId`), identical `fatherId === motherId`, direct cycle (A -> B -> A), and multi-generation cycle (grandparent -> parent -> child -> grandparent).

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run lib/__tests__/validation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/validation.ts`**

Implement `ValidationError`, `validatePersonName`, `normalizeSpousePair`, and `validateParentLinks` (DFS/visited-set cycle detection).

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run lib/__tests__/validation.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validation.ts lib/__tests__/validation.test.ts
git commit -m "feat: add person name, spouse pair, and parent cycle validation"
```

---

### Task 4: Authentication & Session Utilities

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`
- Test: `lib/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma.ts`)
- Produces:
  - `export async function hashPassword(password: string): Promise<string>`
  - `export async function verifyPassword(password: string, stored: string): Promise<boolean>`
  - `export function signSessionToken(payload: { userId: string; email: string }): string`
  - `export function verifySessionToken(token: string): { userId: string; email: string } | null`
  - `export async function getSessionUser(): Promise<{ userId: string; email: string } | null>`

- [ ] **Step 1: Write failing unit tests in `lib/__tests__/auth.test.ts`**

Test `hashPassword`/`verifyPassword` (valid & invalid password) and `signSessionToken`/`verifySessionToken` (valid token, tampered token returns `null`).

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run lib/__tests__/auth.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/auth.ts` and `/api/auth/*` routes**

Use Node `crypto.scrypt` with random 16-byte salt and `timingSafeEqual` for passwords; HMAC-SHA256 signed payload for HTTP-only `ft_session` cookie. Implement `register` (409 on duplicate email), `login` (401 on invalid credentials), `logout` (clear cookie), `me`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run lib/__tests__/auth.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/__tests__/auth.test.ts app/api/auth
git commit -m "feat: add scrypt password auth, signed session cookies, and auth API routes"
```

---

### Task 5: Family Tree CRUD, Graph Sync & Read-Only Share API Routes

**Files:**
- Create: `app/api/trees/route.ts`, `app/api/trees/[treeId]/route.ts`, `app/api/trees/[treeId]/graph/route.ts`
- Create: `app/api/trees/[treeId]/persons/route.ts`, `app/api/trees/[treeId]/persons/[personId]/route.ts`
- Create: `app/api/trees/[treeId]/marriages/route.ts`, `app/api/trees/[treeId]/marriages/[marriageId]/route.ts`
- Create: `app/api/share/[token]/route.ts`
- Test: `app/api/__tests__/trees.test.ts`

**Interfaces:**
- Consumes: `prisma` (`lib/prisma.ts`), `getSessionUser` (`lib/auth.ts`), `fromFamilyChartData` (`lib/family-graph.ts`), `validatePersonName`, `validateParentLinks`, `normalizeSpousePair` (`lib/validation.ts`).

- [ ] **Step 1: Write failing integration tests in `app/api/__tests__/trees.test.ts`**

Mock `prisma` and `getSessionUser` to test:
- `PUT /api/trees/[treeId]/graph` returns `403` when `session.userId !== tree.ownerId`
- `PUT /api/trees/[treeId]/graph` returns `400` when circular parent reference is submitted
- `GET /api/share/[token]` returns `404` when `isShared === false`, and `200` (without `ownerId`/user email) when `isShared === true`

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run app/api/__tests__/trees.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement all `/api/trees/**` and `/api/share/[token]` route handlers**

Enforce `getSessionUser()` + `tree.ownerId === session.userId` on every `/api/trees/**` route. In `PUT /api/trees/[treeId]/graph`, run `fromFamilyChartData`, validate all persons & parent links, and sync `Person` & `Marriage` inside `prisma.$transaction`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run app/api/__tests__/trees.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/trees app/api/share app/api/__tests__/trees.test.ts
git commit -m "feat: add family tree CRUD, graph sync, and read-only share API routes"
```

---

### Task 6: `FamilyTreeCanvas` Component (`family-chart` v2 Integration)

**Files:**
- Create: `components/FamilyTreeCanvas.tsx`

**Interfaces:**
- Consumes: `toFamilyChartData`, `formatPersonDisplayName` (`lib/family-graph.ts`), `family-chart` (`f3.createChart`, `editTree`, `setCardHtml`, `setAncestryDepth`, `setProgenyDepth`)
- Props: `persons: Person[]`, `marriages: Marriage[]`, `tree: Pick<FamilyTree, 'bonKo' | 'bonHanja' | 'surnameKo' | 'surnameHanja' | 'childOrderMode' | 'rootPersonId'>`, `mode: 'view' | 'edit'`, `onGraphChange?: (nodes: FamilyChartDatum[]) => Promise<void>`

- [ ] **Step 1: Implement `components/FamilyTreeCanvas.tsx`**

- Mount `f3.createChart(containerRef.current, chartData)` with `family-chart/dist/styles/family-chart.css`.
- Configure `setCardHtml().setCardDisplay(...)` to show formatted Korean/Hanja display name (or `bonKo surnameKo씨` for name-less spouses) and birth/death years.
- Provide top toolbar controls:
  - Ancestry depth (`상위 세대`: 전체 / 1~5대) -> `f3Chart.setAncestryDepth(depth)`
  - Progeny depth (`하위 세대`: 전체 / 1~5대) -> `f3Chart.setProgenyDepth(depth)`
  - Child order toggle (`순번순` / `성별+순번순`) -> recompute `toFamilyChartData` and call `f3Chart.updateData(...)`
- When `mode === 'edit'`, attach `f3Chart.editTree().setFields([...]).setOnChange(onGraphChange)` following `family-chart` `create-tree` pattern; when `mode === 'view'`, follow `1-basic-tree` read-only pattern.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/FamilyTreeCanvas.tsx
git commit -m "feat: add FamilyTreeCanvas wrapping family-chart v2 view and edit modes"
```

---

### Task 7: App Pages, Settings Modal & Final Verification

**Files:**
- Create: `components/TreeSettingsModal.tsx`
- Create: `app/login/page.tsx`, `app/register/page.tsx`, `app/trees/page.tsx`, `app/trees/[treeId]/page.tsx`, `app/share/[token]/page.tsx`
- Modify: `app/page.tsx` (redirect to `/trees` or landing with login link)

**Interfaces:**
- Consumes: `FamilyTreeCanvas` (`components/FamilyTreeCanvas.tsx`), `/api/auth/*`, `/api/trees/*`, `/api/share/[token]`

- [ ] **Step 1: Implement `TreeSettingsModal.tsx` and auth pages (`/login`, `/register`)**

Include global `bonKo`, `bonHanja`, `surnameKo`, `surnameHanja`, `childOrderMode`, `isShared` toggle, and copyable `/share/[token]` URL.

- [ ] **Step 2: Implement `/trees`, `/trees/[treeId]` (owner edit/view toggle), and `/share/[token]` (read-only view)**

- `/trees/[treeId]` loads tree data, renders `FamilyTreeCanvas` in `edit` (or `view` preview) mode, and persists `onGraphChange` via `PUT /api/trees/[treeId]/graph`.
- `/share/[token]` fetches `GET /api/share/[token]` without auth and renders `FamilyTreeCanvas` in `view` mode with client-side depth & child-order controls.

- [ ] **Step 3: Run full test suite, typecheck, and production build**

Run:
```bash
npx tsc --noEmit && npx vitest run && npm run build
```
Expected: Typecheck clean, all Vitest tests PASS, Next.js build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app components
git commit -m "feat: add auth, tree management, settings modal, and read-only share pages"
```

# 로그인 사용자 기반 권한 체계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전역 관리자(`ADMIN`)와 가계도별 협업 역할(`OWNER` / `EDITOR` / `VIEWER`)을 도입하여, 회원가입 후 관리자가 소속 가계와 역할을 배정하고 기존 데이터는 무손실로 유지하는 권한 체계를 구현한다.

**Architecture:** `prisma/schema.prisma`에 `UserRole`과 `TreeMember`(`TreeRole`)를 추가하고 기존 `FamilyTree.ownerId`를 `TreeMember(OWNER)`로 백필한다. `lib/auth.ts`와 `lib/tree-auth.ts`에서 DB 기반 실시간 역할 검증(`requireAdmin`, `requireTreeAccess`)을 제공하며, 모든 API 라우트와 프론트엔드(`/trees`, `/trees/[treeId]`)가 `myRole`에 따라 동작하도록 전환한다.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 (PostgreSQL), Vitest, TypeScript, Tailwind CSS 4

**Spec:** [2026-11-26-user-role-tree-permissions-design.md](file:///Users/kpcard/Documents/node-workspace/family-tree/docs/superpowers/specs/2026-11-26-user-role-tree-permissions-design.md)

## Global Constraints

- 기존 저장 데이터(`User`, `FamilyTree`, `Person`, `Marriage`)는 절대 삭제하지 않으며, `FamilyTree.ownerId`는 유지하고 `TreeMember(OWNER)`로 무손실 백필한다.
- 새 가계도 생성(`POST /api/trees`)은 `ADMIN`만 가능하다.
- 초대 수락 플로우 없이 이미 가입된 이메일로 즉시 멤버 추가 및 역할 설정이 가능하다(미가입 이메일은 `404`).
- `OWNER`는 `EDITOR`/`VIEWER`만 추가·변경·제거할 수 있으며, `OWNER` 역할 부여·강등·제거는 `ADMIN`만 가능하다.
- `shareToken` + `isShared` 기반 비로그인 공유 링크 열람 기능은 기존과 동일하게 유지한다.

## Review Focus

- `ADMIN`이 사용자의 역할이나 멤버십을 변경했을 때, 해당 사용자가 재로그인하지 않아도 기존 세션 쿠키 상태에서 다음 요청부터 즉시 새 권한이 적용되어야 한다.
- `EDITOR`가 `PATCH /api/trees/[treeId]`로 `title`과 `isShared`를 함께 보내거나 `isShared`만 보낼 때 `403`으로 차단되어야 한다.
- 가계도에 마지막으로 남은 `OWNER`를 `PATCH`로 강등하거나 `DELETE`로 제거하려 할 때 `400`으로 차단되어야 한다.
- `POST /api/trees/[treeId]/members`에 대소문자가 섞인 이메일이나 공백이 포함된 이메일이 들어와도 `trim().toLowerCase()`로 정규화해 가입자를 찾아야 한다.
- 미배정 `USER`가 `/trees`에 접속했을 때 빈 에러가 아니라 배정 대기 안내 문구가 표시되고, 직접 `/trees/[treeId]` URL로 접근해도 `403` 안내가 표시되어야 한다.

---

### Task 1: Prisma 스키마 확장, 무손실 마이그레이션 및 ADMIN 부트스트랩 도구

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `.env.example`
- Create: `prisma/migrations/<timestamp>_add_user_roles_and_tree_members/migration.sql` (or `prisma/backfill-tree-members.ts` if DB is offline)
- Create: `prisma/promote-admin.ts`

**Interfaces:**
- Produces: Prisma models/enums `UserRole` (`ADMIN`, `USER`), `TreeRole` (`OWNER`, `EDITOR`, `VIEWER`), `User.role`, `TreeMember` (`id`, `treeId`, `userId`, `role`, `createdAt`, `updatedAt`, `@@unique([treeId, userId])`)

- [ ] **Step 1: `prisma/schema.prisma`에 `UserRole`, `TreeRole`, `TreeMember` 추가**

`prisma/schema.prisma`에 `enum UserRole { ADMIN USER }`, `enum TreeRole { OWNER EDITOR VIEWER }`를 추가하고, `User`에 `role UserRole @default(USER)` 및 `memberships TreeMember[]`를, `FamilyTree`에 `members TreeMember[]`를, 신규 `model TreeMember`를 정의한다.

- [ ] **Step 2: 무손실 마이그레이션 생성 및 백필 SQL 포함**

Run: `npx prisma migrate dev --name add_user_roles_and_tree_members --create-only`
생성된 `migration.sql` 하단에 기존 `FamilyTree` 소유자를 `TreeMember(OWNER)`로 이관하는 멱등 SQL을 추가한다:
```sql
INSERT INTO "TreeMember" ("id", "treeId", "userId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "ownerId", 'OWNER'::"TreeRole", NOW(), NOW()
FROM "FamilyTree"
ON CONFLICT ("treeId", "userId") DO NOTHING;
```
DB가 연결되어 있으면 `npx prisma migrate dev`를 실행하고, 오프라인 환경이면 `npx prisma generate`를 실행해 Prisma Client 타입을 갱신한다. (멱등 백필 스크립트 `prisma/backfill-tree-members.ts`도 함께 작성해 `db push` 환경에서도 안전하게 실행 가능하도록 한다.)

- [ ] **Step 3: `.env.example` 업데이트 및 `prisma/promote-admin.ts` 작성**

`.env.example`에 `ADMIN_EMAIL=""` 예시를 추가한다.
`prisma/promote-admin.ts`를 작성해 `npx tsx prisma/promote-admin.ts <email>` 실행 시 해당 이메일 사용자를 `UserRole.ADMIN`으로 업데이트하고 결과를 출력한다(미존재 시 exit code 1).

- [ ] **Step 4: 타입 체크 및 커밋**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

```bash
git add prisma/ .env.example
git commit -m "feat(db): add UserRole, TreeMember schema and lossless owner backfill"
```

---

### Task 2: 실시간 DB 사용자 조회 및 역할 기반 가드 (`lib/auth.ts`, `lib/tree-auth.ts`)

**Files:**
- Modify: `lib/auth.ts`
- Modify: `lib/tree-auth.ts`
- Test: `lib/__tests__/tree-auth.test.ts`

**Interfaces:**
- Consumes: `@/lib/prisma` (`user.findUnique`, `familyTree.findUnique`, `treeMember.findUnique`), `getSessionUser()`
- Produces:
  - `getCurrentUser(): Promise<{ id: string; email: string; name: string; role: UserRole } | null>` in `lib/auth.ts`
  - `EffectiveTreeRole = "ADMIN" | "OWNER" | "EDITOR" | "VIEWER"` in `lib/tree-auth.ts`
  - `requireAdmin(): Promise<{ user: CurrentUser } | { error: NextResponse }>` in `lib/tree-auth.ts`
  - `requireTreeAccess(treeId: string, minRole?: TreeRole): Promise<{ user: CurrentUser; tree: FamilyTree; role: EffectiveTreeRole } | { error: NextResponse }>` in `lib/tree-auth.ts`

- [ ] **Step 1: 실패하는 단위 테스트 작성 (`lib/__tests__/tree-auth.test.ts`)**

다음 케이스를 검증하는 테스트를 작성한다:
- `requireAdmin`: 미로그인 `401`, `USER` `403`, `ADMIN` 통과
- `requireTreeAccess`:
  - `ADMIN`은 `TreeMember`가 없어도 `OWNER` 요구 엔드포인트 통과 (`role: "ADMIN"`)
  - 미소속 `USER`는 `VIEWER` 요구 시에도 `403`
  - `VIEWER`는 `VIEWER` 통과, `EDITOR` 요구 시 `403`
  - `EDITOR`는 `VIEWER`/`EDITOR` 통과, `OWNER` 요구 시 `403`
  - `OWNER`는 `VIEWER`/`EDITOR`/`OWNER` 모두 통과
  - 존재하지 않는 `treeId`는 `404`

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run lib/__tests__/tree-auth.test.ts`
Expected: FAIL (`requireAdmin` / `requireTreeAccess` not defined)

- [ ] **Step 3: `getCurrentUser` 및 `requireAdmin`, `requireTreeAccess` 구현**

`lib/auth.ts`에 `getCurrentUser()`를 추가한다(`getSessionUser()` 결과를 바탕으로 `prisma.user.findUnique` 조회).
`lib/tree-auth.ts`에서 `requireOwnedTree`를 제거하고 `requireAdmin()`, `requireTreeAccess(treeId, minRole = "VIEWER")`를 구현한다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run lib/__tests__/tree-auth.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/auth.ts lib/tree-auth.ts lib/__tests__/tree-auth.test.ts
git commit -m "feat(auth): add getCurrentUser, requireAdmin, and requireTreeAccess guards"
```

---

### Task 3: 회원가입 `ADMIN_EMAIL`, `/api/auth/me`, `/api/trees` 권한 적용

**Files:**
- Modify: `app/api/auth/register/route.ts`
- Modify: `app/api/auth/me/route.ts`
- Modify: `app/api/trees/route.ts`
- Test: `app/api/__tests__/permissions-trees.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser()`, `requireAdmin()`
- Produces:
  - `POST /api/auth/register`: `ADMIN_EMAIL` 환경변수(쉼표 구분)에 포함되면 `role: "ADMIN"`으로 생성
  - `GET /api/auth/me`: `{ user: { id, email, name, role } }`
  - `GET /api/trees`: `{ trees: Array<TreeSummary & { myRole: EffectiveTreeRole }> }` (`ADMIN`은 전체, `USER`는 소속 가계도만)
  - `POST /api/trees`: `ADMIN`만 생성 가능 (`403` for `USER`), 생성 시 `TreeMember(role: OWNER)` 함께 생성

- [ ] **Step 1: 실패하는 테스트 작성 (`app/api/__tests__/permissions-trees.test.ts`)**

- `POST /api/auth/register`: `process.env.ADMIN_EMAIL = "admin@test.com"`일 때 `admin@test.com` 가입 시 `role: "ADMIN"`, 일반 이메일은 `role: "USER"` 전달 확인
- `GET /api/trees`: `ADMIN`은 `familyTree.findMany` 전체 조회(`myRole: "ADMIN"`), `USER`는 `members: { some: { userId } }` 조건으로 조회(`myRole` 매핑) 확인
- `POST /api/trees`: `USER`가 호출 시 `403`, `ADMIN`이 호출 시 `201` 및 `TreeMember` 생성 확인

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run app/api/__tests__/permissions-trees.test.ts`
Expected: FAIL

- [ ] **Step 3: 라우트 구현 수정**

`app/api/auth/register/route.ts`, `app/api/auth/me/route.ts`, `app/api/trees/route.ts`를 수정한다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run app/api/__tests__/permissions-trees.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/auth/register/route.ts app/api/auth/me/route.ts app/api/trees/route.ts app/api/__tests__/permissions-trees.test.ts
git commit -m "feat(api): enforce ADMIN-only tree creation and role-filtered tree listing"
```

---

### Task 4: 가계도 상세·그래프·인물·혼인 API 역할 적용

**Files:**
- Modify: `app/api/trees/[treeId]/route.ts`
- Modify: `app/api/trees/[treeId]/graph/route.ts`
- Modify: `app/api/trees/[treeId]/persons/route.ts`
- Modify: `app/api/trees/[treeId]/persons/[personId]/route.ts`
- Modify: `app/api/trees/[treeId]/marriages/route.ts`
- Modify: `app/api/trees/[treeId]/marriages/[marriageId]/route.ts`
- Modify: `app/api/__tests__/trees.test.ts`

**Interfaces:**
- Consumes: `requireTreeAccess(treeId, minRole)`

- [ ] **Step 1: `app/api/__tests__/trees.test.ts`에 역할별 접근 제어 테스트 추가 및 기존 목(mock) 업데이트**

- 기존 `mockGetSessionUser` 기반 목을 `getCurrentUser` + `treeMember.findUnique` 지원 형태로 업데이트
- 추가 테스트:
  - `GET /api/trees/[treeId]`: `VIEWER` `200` + `myRole: "VIEWER"` 반환
  - `PATCH /api/trees/[treeId]`: `VIEWER` `403`, `EDITOR`가 `title` 수정 시 `200`, `EDITOR`가 `isShared` 또는 `regenerateShareToken` 수정 시 `403`, `OWNER`가 `isShared` 수정 시 `200`
  - `DELETE /api/trees/[treeId]`: `EDITOR` `403`, `OWNER` `200`

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run app/api/__tests__/trees.test.ts`
Expected: FAIL

- [ ] **Step 3: 각 라우트의 `requireOwnedTree`를 `requireTreeAccess`로 교체**

- `GET /api/trees/[treeId]`: `requireTreeAccess(treeId, "VIEWER")`, 응답에 `myRole: auth.role` 포함
- `PATCH /api/trees/[treeId]`: `requireTreeAccess(treeId, "EDITOR")` 후 `typeof body.isShared === "boolean" || body.regenerateShareToken === true` 포함 시 `auth.role !== "OWNER" && auth.role !== "ADMIN"`이면 `403` 반환
- `DELETE /api/trees/[treeId]`: `requireTreeAccess(treeId, "OWNER")`
- `graph`, `persons`, `persons/[personId]`, `marriages`, `marriages/[marriageId]`: `requireTreeAccess(treeId, "EDITOR")`

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run app/api/__tests__/trees.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/trees/[treeId]/ app/api/__tests__/trees.test.ts
git commit -m "feat(api): enforce VIEWER/EDITOR/OWNER permissions on tree, graph, person, and marriage routes"
```

---

### Task 5: 관리자 사용자 조회 및 가계도 멤버 관리 API 구현

**Files:**
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/trees/[treeId]/members/route.ts`
- Create: `app/api/trees/[treeId]/members/[userId]/route.ts`
- Test: `app/api/__tests__/members.test.ts`

**Interfaces:**
- Consumes: `requireAdmin()`, `requireTreeAccess(treeId, "OWNER")`
- Produces:
  - `GET /api/admin/users`: `{ users: Array<{ id, email, name, role, createdAt, memberships: Array<{ treeId, treeTitle, role }> }> }`
  - `GET /api/trees/[treeId]/members`: `{ members: Array<{ userId, email, name, role, createdAt }> }`
  - `POST /api/trees/[treeId]/members`: body `{ email, role }` → `201` `{ member }`
  - `PATCH /api/trees/[treeId]/members/[userId]`: body `{ role }` → `200` `{ member }`
  - `DELETE /api/trees/[treeId]/members/[userId]`: `200` `{ ok: true }`

- [ ] **Step 1: 실패하는 테스트 작성 (`app/api/__tests__/members.test.ts`)**

- `GET /api/admin/users`: `USER` `403`, `ADMIN` `200`
- `POST /api/trees/[treeId]/members`:
  - 미가입 이메일 → `404`
  - 대소문자/공백 포함 이메일(`" User@Test.com "`) 정규화 조회 성공
  - `OWNER`가 `role: "OWNER"` 부여 시도 → `403`
  - `OWNER`가 `role: "EDITOR"` 부여 → `201`
  - `ADMIN`이 `role: "OWNER"` 부여 → `201`
- `PATCH /api/trees/[treeId]/members/[userId]`:
  - `OWNER`가 기존 `OWNER` 역할 변경 시도 → `403`
  - 마지막 남은 `OWNER` 강등 시도 → `400`
- `DELETE /api/trees/[treeId]/members/[userId]`:
  - 마지막 남은 `OWNER` 제거 시도 → `400`
  - `OWNER`가 `EDITOR` 제거 → `200`

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `npx vitest run app/api/__tests__/members.test.ts`
Expected: FAIL

- [ ] **Step 3: 3개 API 라우트 구현**

`app/api/admin/users/route.ts`, `app/api/trees/[treeId]/members/route.ts`, `app/api/trees/[treeId]/members/[userId]/route.ts`를 구현한다.

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `npx vitest run app/api/__tests__/members.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/admin/ app/api/trees/[treeId]/members/ app/api/__tests__/members.test.ts
git commit -m "feat(api): add admin user listing and tree member management endpoints"
```

---

### Task 6: UI 권한 반영 (`/trees`, `/trees/[treeId]`, 관리자 배정 패널, 멤버 관리 모달)

**Files:**
- Modify: `app/trees/page.tsx`
- Modify: `app/trees/[treeId]/page.tsx`
- Modify: `components/TreeSettingsModal.tsx`
- Create: `components/TreeMembersModal.tsx`
- Create: `components/AdminUserAssignmentPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/me`, `GET/POST /api/trees`, `GET /api/admin/users`, `GET/POST/PATCH/DELETE /api/trees/[treeId]/members`

- [ ] **Step 1: `components/AdminUserAssignmentPanel.tsx` 및 `components/TreeMembersModal.tsx` 구현**

- `AdminUserAssignmentPanel`: `ADMIN`이 `/trees`에서 가입자 목록(미배정 필터 토글 포함)을 확인하고, 가계도 선택 + 역할(`OWNER`/`EDITOR`/`VIEWER`) 선택 후 배정(`POST /api/trees/[treeId]/members`) 또는 기존 소속 해제(`DELETE /api/trees/[treeId]/members/[userId]`)를 수행한다.
- `TreeMembersModal`: `OWNER`/`ADMIN`이 특정 가계도의 멤버 목록을 보고 가입 이메일 입력 + 역할 선택으로 추가하거나 역할을 변경/제거한다. (`OWNER` 로그인 시 역할 선택지에는 `EDITOR`/`VIEWER`만 노출, `ADMIN`은 `OWNER` 포함 노출)

- [ ] **Step 2: `app/trees/page.tsx` 업데이트**

- `/api/auth/me`와 `/api/trees`를 함께 조회해 현재 사용자 `role` 확인.
- `ADMIN`일 때만 "새 가계도 만들기" 폼과 `AdminUserAssignmentPanel` 표시.
- 일반 `USER`는 소속 가계도 목록과 내 역할 배지(`소유자` / `편집자` / `열람자`) 표시, 소속 가계도가 0개이면 배정 대기 안내 메시지 표시.

- [ ] **Step 3: `app/trees/[treeId]/page.tsx` 및 `components/TreeSettingsModal.tsx` 업데이트**

- `GET /api/trees/[treeId]` 응답의 `myRole` 저장.
- `VIEWER`: 편집 모드 토글 숨기고 `mode="view"` 고정, 설정/멤버 관리 버튼 숨김.
- `EDITOR`: 편집 모드 및 기본 설정 허용, `TreeSettingsModal` 내 공개 공유(`isShared`)·삭제 영역 숨김, 멤버 관리 버튼 숨김.
- `OWNER` / `ADMIN`: 전체 기능 + "멤버 관리" 버튼(`TreeMembersModal`) 표시.

- [ ] **Step 4: 전체 테스트 및 프로덕션 빌드 검증**

Run: `npm test && npm run build`
Expected: 모든 Vitest 테스트 PASS 및 `next build` 에러 없이 완료

- [ ] **Step 5: 커밋**

```bash
git add app/trees/ components/
git commit -m "feat(ui): enforce role-based UI controls, admin assignment panel, and member modal"
```

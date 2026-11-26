# 로그인 사용자 기반 권한 체계 설계 (RBAC & 가계도별 멤버십)

작성일: 2026-11-26  
상태: 검토 대기 (Draft)

---

## 1. 목적 및 배경

현재 `family-tree` 서비스는 `User`에 별도 역할이 없고, `FamilyTree.ownerId` 기준의 단일 소유자 모델과 비로그인 `shareToken` 공유 링크만 존재한다.  
이를 확장하여 **전역 관리자(`ADMIN`)**가 신규 가입자를 소속 가계도에 배정·역할 설정하고, 가계도 내에서도 **소유자(`OWNER`) / 편집자(`EDITOR`) / 열람자(`VIEWER`)**로 권한을 세분화하는 협업 권한 체계를 도입한다.

### 핵심 요구사항 및 제약
- **권한 구조**: 전역 역할(`User.role`: `ADMIN` | `USER`) + 가계도별 역할(`TreeMember.role`: `OWNER` | `EDITOR` | `VIEWER`)
- **가계도 생성**: `ADMIN`만 새 가계도를 생성(`POST /api/trees`)할 수 있다.
- **가입 및 배정 흐름**: 초대 수락 플로우 없이, 사용자가 회원가입하면 `ADMIN`(또는 해당 가계도의 `OWNER`)이 **이미 가입된 이메일**로 가계도 소속과 역할을 설정하여 즉시 사용을 허가한다.
- **미배정 사용자**: 소속 가계도가 없는 `USER`는 로그인 후 배정 대기 안내를 보며, 어떤 가계도에도 접근할 수 없다.
- **기존 데이터 보존**: 기존 `User`, `FamilyTree`, `Person`, `Marriage` 데이터는 절대 삭제되지 않으며, 기존 `FamilyTree.ownerId`는 무손실 마이그레이션을 통해 `TreeMember(OWNER)`로 자동 이관된다.
- **공개 공유 유지**: 기존의 `shareToken` + `isShared` 기반 비로그인 열람 기능은 그대로 유지한다.

---

## 2. 데이터 모델 및 무손실 마이그레이션 (`prisma/schema.prisma`)

### 2.1 스키마 변경

```prisma
enum UserRole {
  ADMIN
  USER
}

enum TreeRole {
  OWNER
  EDITOR
  VIEWER
}

model User {
  id           String       @id @default(uuid())
  email        String       @unique
  passwordHash String
  name         String
  role         UserRole     @default(USER)
  createdAt    DateTime     @default(now())
  trees        FamilyTree[]
  memberships  TreeMember[]
}

model FamilyTree {
  // 기존 필드 유지 (ownerId 포함)
  members      TreeMember[]
}

model TreeMember {
  id        String     @id @default(uuid())
  treeId    String
  tree      FamilyTree @relation(fields: [treeId], references: [id], onDelete: Cascade)
  userId    String
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      TreeRole   @default(VIEWER)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@unique([treeId, userId])
}
```

### 2.2 기존 데이터 보존 및 마이그레이션 전략
1. **비파괴적 스키마 변경**:
   - `User.role`은 `@default(USER)`로 추가되므로 기존 사용자 행이 삭제되거나 NULL 오류가 발생하지 않는다.
   - `FamilyTree.ownerId` 컬럼은 삭제하지 않고 유지한다(초기 생성자/대표 소유자 추적 및 하위 호환성 확보).
2. **기존 소유자 자동 백필(Backfill)**:
   - 마이그레이션 SQL 또는 배포 후 1회 실행 가능한 멱등(idempotent) 백필 로직을 통해, 기존 `FamilyTree`의 `(id, ownerId)`마다 `TreeMember(role = 'OWNER')` 레코드를 `ON CONFLICT DO NOTHING`으로 생성한다.
   - 결과적으로 기존 가계도 소유자는 마이그레이션 직후에도 동일하게 `OWNER` 권한을 유지한다.
3. **마이그레이션 안내**:
   - 개발 환경: `npx prisma migrate dev` (또는 `prisma db push` 사용 시 백필 스크립트 병행)
   - 운영/Docker 환경: 기존 DB 볼륨/원격 PostgreSQL에 대해 `npx prisma migrate deploy` 실행 후, 필요 시 `ADMIN` 승격 스크립트 실행 방법 안내

---

## 3. 권한 매트릭스

| 기능 | `ADMIN` (전역) | `OWNER` (가계도) | `EDITOR` (가계도) | `VIEWER` (가계도) | 미배정 `USER` |
|---|:---:|:---:|:---:|:---:|:---:|
| 전체 가입자·미배정 사용자 조회 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 전체 가계도 목록 조회 | ✅ | ❌ (소속만) | ❌ (소속만) | ❌ (소속만) | ❌ |
| 새 가계도 생성 (`POST /api/trees`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| 가계도·인물·혼인·그래프 조회 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 인물·혼인 추가/수정/삭제 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 가계도 기본 정보 수정 (`title`, `bonKo` 등) | ✅ | ✅ | ✅ | ❌ | ❌ |
| 공개 공유 설정 (`isShared`) 변경 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 가계도 삭제 (`DELETE /api/trees/[treeId]`) | ✅ | ✅ | ❌ | ❌ | ❌ |
| 멤버 추가/역할 변경/제거 | ✅ (`OWNER`/`EDITOR`/`VIEWER`) | ✅ (`EDITOR`/`VIEWER`만) | ❌ | ❌ | ❌ |

### 보안/권한 상승 방지 규칙
- `OWNER`는 다른 사용자에게 `OWNER` 역할을 부여하거나 기존 `OWNER`를 강등/제거할 수 없다. **`OWNER` 권한 부여·변경·회수는 `ADMIN`만 수행**할 수 있다.
- 가계도에 마지막으로 남은 `OWNER`를 제거하거나 강등하려 할 경우 `400` 오류로 차단한다(단, `ADMIN`이 가계도를 삭제하는 경우는 허용).

---

## 4. 인증/인가 레이어 및 API 설계

### 4.1 인증 및 권한 가드 (`lib/auth.ts`, `lib/tree-auth.ts`)
- **`getCurrentUser()` (`lib/auth.ts`)**:
  - 기존 `getSessionUser()`로 서명된 쿠키 토큰의 `userId`를 검증한 뒤, DB에서 최신 `User(id, email, name, role)`를 조회한다.
  - 이를 통해 `ADMIN`이 사용자의 역할을 변경하거나 멤버를 해제했을 때, 해당 사용자가 재로그인하지 않아도 **다음 요청부터 즉시 권한이 반영**된다.
- **`requireAdmin()` (`lib/tree-auth.ts`)**:
  - 미로그인 시 `401`, `user.role !== "ADMIN"` 시 `403` 반환.
- **`requireTreeAccess(treeId, minRole: "VIEWER" | "EDITOR" | "OWNER")` (`lib/tree-auth.ts`)**:
  - 기존 `requireOwnedTree(treeId)`를 대체한다.
  - 미로그인 시 `401`, 가계도 미존재 시 `404`.
  - `user.role === "ADMIN"`이면 모든 가계도에 대해 통과(`effectiveRole: "ADMIN"`).
  - 일반 `USER`는 `TreeMember`를 조회해 `ROLE_RANK = { VIEWER: 1, EDITOR: 2, OWNER: 3 }` 기준으로 `ROLE_RANK[member.role] >= ROLE_RANK[minRole]`를 검증하고, 미소속이거나 권한이 부족하면 `403`을 반환한다.

### 4.2 기존 API 변경
- `GET /api/auth/me`: 응답 `user` 객체에 `role` (`"ADMIN" | "USER"`) 포함.
- `GET /api/trees`:
  - `ADMIN`: 전체 가계도 목록 반환 (`myRole: "ADMIN"` 포함).
  - `USER`: 본인이 `TreeMember`로 등록된 가계도만 반환 (`myRole: member.role` 포함).
- `POST /api/trees`: `requireAdmin()` 적용 (`ADMIN`만 생성 가능). 생성 시 `ownerId = admin.id`로 기록하고, 선택적으로 초기 소유자나 `TreeMember(ADMIN, OWNER)`를 함께 연결한다.
- `GET /api/trees/[treeId]`, `GET /api/trees/[treeId]/graph`: `requireTreeAccess(treeId, "VIEWER")`, 응답에 `myRole` 포함.
- `PATCH /api/trees/[treeId]`:
  - 기본 가계도 정보(`title`, `bonKo`, `bonHanja`, `surnameKo`, `surnameHanja`, `childOrderMode`, `rootPersonId`) 수정은 `EDITOR` 이상 허용.
  - 요청 본문에 `isShared` 변경이 포함된 경우 `OWNER` 이상(`ADMIN` 포함)만 허용, `EDITOR`가 요청 시 `403` 반환.
- `DELETE /api/trees/[treeId]`: `requireTreeAccess(treeId, "OWNER")`.
- `app/api/trees/[treeId]/persons/*`, `app/api/trees/[treeId]/marriages/*`: 변경 엔드포인트(`POST`, `PATCH`, `DELETE`)에 `requireTreeAccess(treeId, "EDITOR")` 적용.

### 4.3 신규 API
- **`GET /api/admin/users`** (`ADMIN` 전용):
  - 가입된 전체 사용자 목록(`id`, `email`, `name`, `role`, `createdAt`)과 각 사용자의 소속 가계도/역할(`memberships`)을 반환한다.
  - 쿼리 파라미터 `?unassigned=true`로 미배정 사용자만 필터링할 수 있다.
- **`GET /api/trees/[treeId]/members`** (`OWNER` 이상):
  - 해당 가계도의 멤버 목록(`userId`, `email`, `name`, `role`, `createdAt`) 반환.
- **`POST /api/trees/[treeId]/members`** (`OWNER` 이상):
  - 요청: `{ email: string, role: "OWNER" | "EDITOR" | "VIEWER" }`
  - 가입된 `email` 조회 → 없으면 `404` (`"가입된 사용자를 찾을 수 없습니다."`)
  - 요청자가 `OWNER`(비-ADMIN)인데 `role === "OWNER"`를 지정하려 하면 `403`.
  - 이미 멤버인 경우 역할을 업데이트(`upsert`)하거나 중복 안내 처리(관리자 배정 편의상 `upsert` 권장).
- **`PATCH /api/trees/[treeId]/members/[userId]`** (`OWNER` 이상):
  - 요청: `{ role: "OWNER" | "EDITOR" | "VIEWER" }`
  - `OWNER` 지정/강등은 `ADMIN`만 가능 (`403`), 마지막 `OWNER` 강등 차단 (`400`).
- **`DELETE /api/trees/[treeId]/members/[userId]`** (`OWNER` 이상):
  - `OWNER` 대상 제거는 `ADMIN`만 가능 (`403`), 마지막 `OWNER` 제거 차단 (`400`).

---

## 5. UI/UX 및 초기 ADMIN 설정

### 5.1 UI 흐름
- **가계도 목록 (`/trees`)**:
  - `ADMIN`: "새 가계도 만들기" 버튼/폼 표시, **사용자 및 권한 관리 패널/모달(또는 `/admin` 뷰)** 제공 (미배정 사용자 확인 → 가계도 선택 + 역할 배정/변경/해제).
  - 일반 `USER`: "새 가계도 만들기" UI 미노출, 배정된 가계도 카드에 내 역할 배지(`소유자` / `편집자` / `열람자`) 표시.
  - 미배정 `USER` (배정된 가계도 0개): *"아직 배정된 가계도가 없습니다. 관리자가 소속 가계와 역할을 설정하면 이용할 수 있습니다."* 안내 메시지 표시.
- **가계도 상세 (`/trees/[treeId]`)**:
  - 서버/API에서 내려주는 `myRole`(`"ADMIN" | "OWNER" | "EDITOR" | "VIEWER"`)에 따라 UI 제어:
    - `VIEWER`: 인물/혼인 추가·수정·삭제 버튼, 설정/삭제 버튼 숨김(읽기 전용 모드).
    - `EDITOR`: 인물/혼인 및 가계도 기본 정보 편집 가능, 공개 공유(`isShared`) 토글·가계도 삭제·멤버 관리 버튼 숨김.
    - `OWNER` / `ADMIN`: 모든 기능 + **멤버 관리 모달**(이메일 입력 + 역할 선택으로 멤버 추가, 기존 멤버 역할 변경/제거).

### 5.2 초기 `ADMIN` 부트스트랩
1. **환경변수 `ADMIN_EMAIL` 지원**:
   - `.env` / `.env.example`에 `ADMIN_EMAIL` (쉼표 구분 복수 이메일 지원) 추가.
   - `POST /api/auth/register` 시 가입 이메일이 `ADMIN_EMAIL` 목록에 포함되면 자동으로 `role: "ADMIN"`으로 생성.
2. **기존 계정 승격 스크립트 (`prisma/promote-admin.ts`)**:
   - 이미 가입된 사용자를 CLI(`npx tsx prisma/promote-admin.ts <email>`)로 `ADMIN`으로 승격할 수 있는 스크립트 제공.

---

## 6. 테스트 전략
- **단위 테스트 (`lib/__tests__/tree-auth.test.ts`)**:
  - `requireAdmin`, `requireTreeAccess`의 역할 계층(`VIEWER < EDITOR < OWNER < ADMIN`) 및 미배정 사용자 `403` 차단 검증.
- **API 테스트 (`app/api/__tests__/`)**:
  - `POST /api/trees`: `ADMIN` 허용 / `USER` `403` 차단.
  - `PATCH /api/trees/[treeId]`: `isShared` 변경 시 `EDITOR` `403` / `OWNER` 허용, 일반 필드 수정 시 `EDITOR` 허용 / `VIEWER` `403`.
  - `/api/trees/[treeId]/members`: 미가입 이메일 `404`, `OWNER`의 `OWNER` 권한 부여 차단(`403`), 마지막 `OWNER` 제거 차단(`400`), `ADMIN`의 정상 배정(`200`/`201`).
- **회귀 검증**: 기존 `vitest run` 테스트 스위트 전체 통과 및 `next build` 성공 확인.

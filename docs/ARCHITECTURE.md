# 시스템 아키텍처 (Current State)

이 문서는 `family-tree` 서비스의 현재 구현된 아키텍처, 데이터 모델, 권한 체계, 보안 정책 및 주요 UI 구조를 설명합니다.

---

## 1. 기술 스택
- **Framework**: Next.js 16 (`app/` App Router, `output: "standalone"`)
- **Frontend**: React 19, Tailwind CSS 4, `family-chart` (`0.9.0`), `d3`
- **Backend / ORM**: Next.js Route Handlers, Prisma 6 (`@prisma/client`), PostgreSQL
- **Test**: Vitest 5 (`npm test`)

---

## 2. 데이터 모델 (`prisma/schema.prisma`)

| 모델 / Enum | 주요 필드 | 설명 |
|---|---|---|
| `UserRole` | `ADMIN`, `USER` | 서비스 전역 역할 |
| `TreeRole` | `OWNER`, `EDITOR`, `VIEWER` | 가계도별 멤버 역할 |
| `User` | `id`, `email` (unique), `passwordHash`, `name`, `role` (default `USER`) | 사용자 계정 |
| `FamilyTree` | `id`, `title`, `ownerId`, `bonKo`, `bonHanja`, `surnameKo`, `surnameHanja`, `childOrderMode`, `rootPersonId`, `shareToken` (unique), `isShared` | 가계도 메타데이터 및 공유 설정 |
| `TreeMember` | `id`, `treeId`, `userId`, `role` (`@@unique([treeId, userId])`) | 사용자-가계도 다대다 소속 및 권한 |
| `Person` | `id`, `treeId`, `nameKo`, `nameHanja`, `surnameKo`, `surnameHanja`, `bonKo`, `bonHanja`, `gender`, `birthDate`, `deathDate`, `birthOrder`, `memo`, `fatherId`, `motherId` | 가계도 구성원 |
| `Marriage` | `id`, `treeId`, `person1Id`, `person2Id` (`@@unique([treeId, person1Id, person2Id])`) | 혼인(배우자) 관계 |

- **기존 데이터 보존**: `FamilyTree.ownerId`를 유지하며, `prisma/backfill-tree-members.mjs`가 모든 기존 가계도의 `ownerId`를 `TreeMember(OWNER)`로 멱등 백필합니다.

---

## 3. 인증 및 권한 체계 (RBAC)

### 3.1 인증 (`lib/auth.ts`)
- **비밀번호 해시**: Node `crypto.scrypt` + 16바이트 랜덤 솔트 + `crypto.timingSafeEqual`
- **세션 쿠키 (`ft_session`)**: HMAC-SHA256 서명 토큰 (`httpOnly: true`, `sameSite: "lax"`, `NODE_ENV === "production"` 시 `secure: true`, 만료 7일)
- **실시간 DB 조회 (`getCurrentUser()`)**: 쿠키 서명 검증 후 DB에서 최신 `User(id, email, name, role)`을 조회하므로 역할 변경이 재로그인 없이 즉시 반영됩니다.
- **서버 측 페이지 보호 (`middleware.ts`)**: `/trees` 및 `/trees/:path*` 접근 시 `ft_session` 쿠키가 없거나 형식이 유효하지 않으면 `/login`으로 리다이렉트합니다.

### 3.2 권한 가드 (`lib/tree-auth.ts`)
- `requireAdmin()`: `user.role === "ADMIN"` 검증 (`401` / `403`)
- `requireTreeAccess(treeId, minRole)`:
  - `user.role === "ADMIN"`이면 모든 가계도에 `effectiveRole = "ADMIN"`으로 통과
  - 일반 `USER`는 `TreeMember`를 조회해 `VIEWER (1) < EDITOR (2) < OWNER (3)` 순위로 검증 (`401` / `403` / `404`)

### 3.3 역할별 권한 매트릭스

| 기능 | `ADMIN` | `OWNER` | `EDITOR` | `VIEWER` | 미배정 `USER` |
|---|:---:|:---:|:---:|:---:|:---:|
| 전체 사용자·미배정 사용자 조회 (`GET /api/admin/users`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| 새 가계도 생성 (`POST /api/trees`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| 가계도·인물·혼인·그래프 조회 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 인물·혼인·가계도 기본 정보 수정 | ✅ | ✅ | ✅ | ❌ | ❌ |
| 공개 공유 설정(`isShared`, `regenerateShareToken`) 및 삭제 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 멤버 추가·역할 변경·제거 | ✅ (전체) | ✅ (`EDITOR`/`VIEWER`) | ❌ | ❌ | ❌ |

- `POST /api/trees/[treeId]/members`, `PATCH/DELETE /api/trees/[treeId]/members/[userId]`는 가입된 이메일(`trim().toLowerCase()`)로만 멤버를 추가하며, 마지막 `OWNER`의 강등/제거는 `400`으로 차단합니다.
- `GET /api/trees`, `GET /api/trees/[treeId]`는 `myRole`이 `OWNER` 또는 `ADMIN`이 아닌 경우 `shareToken`과 `ownerId`를 응답에서 제외합니다.

---

## 4. API 엔드포인트 요약

- **Auth**:
  - `POST /api/auth/register`: 회원가입 (`password.length >= 8`, `ADMIN_EMAIL` 일치 시 `ADMIN` 부여)
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Admin**:
  - `GET /api/admin/users` (`?unassigned=true` 지원)
- **Trees & Members**:
  - `GET / POST /api/trees`
  - `GET / PATCH / DELETE /api/trees/[treeId]`
  - `GET / POST /api/trees/[treeId]/members`
  - `PATCH / DELETE /api/trees/[treeId]/members/[userId]`
  - `PUT /api/trees/[treeId]/graph`
  - `POST /api/trees/[treeId]/persons`, `PATCH / DELETE /api/trees/[treeId]/persons/[personId]`
  - `POST /api/trees/[treeId]/marriages`, `DELETE /api/trees/[treeId]/marriages/[marriageId]`
- **Public Share**:
  - `GET /api/share/[token]` (`isShared === true`인 경우에만 `ownerId`/`shareToken` 제외 후 반환)

---

## 5. 보안 설정 (`next.config.ts`, `app/api/auth/*`)
- `next.config.ts`에서 모든 응답에 `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` 헤더를 적용합니다.
- 로그인·회원가입·로그아웃 쿠키 모두 `httpOnly`, `sameSite: "lax"`, 프로덕션 `secure: true`를 일관 적용합니다.
- `components/FamilyTreeCanvas.tsx`는 카드 표시 텍스트에 `escapeHtml()`을 적용해 XSS를 방지합니다.

---

## 6. 주요 프론트엔드 페이지 및 컴포넌트
- `app/trees/page.tsx`: `ADMIN`에게만 가계도 생성 폼 및 `AdminUserAssignmentPanel` 노출, 일반 `USER`에게는 소속 가계도와 역할 배지(또는 배정 대기 안내) 표시
- `app/trees/[treeId]/page.tsx`: `myRole`에 따라 `VIEWER` 읽기 전용 고정, `EDITOR` 기본 편집 + 가계도 설정(공유 제외), `OWNER`/`ADMIN` 전체 기능 + `TreeMembersModal` 노출
- `components/FamilyTreeCanvas.tsx`:
  - 좌상단 플로팅 `보기 옵션` 토글 버튼(기본 접힘 `false`) + 활성 옵션 요약 배지
  - `family-chart` 편집 폼 내 `Close → Cancel → Submit` 버튼 순서 커스터마이징
  - `app/globals.css`에서 `#FamilyChart .f3-form-cont` `z-index: 30`으로 모바일 겹침 방지
- `components/TreeSettingsModal.tsx`: 가계도 메타 설정 및 공개 공유(`isShared` 체크 후 **저장** 시 DB 반영, 토큰 재발급 시 `isShared: true` 함께 저장)

# 개발 인수인계 및 후속 백로그 (HANDOFF)

이 문서는 지금까지의 핵심 의사결정 맥락과 향후 이어서 개발할 백로그를 정리한 인수인계 문서입니다.

---

## 1. 주요 의사결정 및 맥락

1. **초대 수락 플로우 미사용 → 관리자 배정 모델**
   - 사용자가 회원가입(`USER`)하면, `ADMIN`이 `/trees`의 `AdminUserAssignmentPanel`에서 가입된 이메일과 소속 가계도·역할(`OWNER` / `EDITOR` / `VIEWER`)을 배정해 사용을 허가합니다.
   - 새 가계도 생성(`POST /api/trees`)은 `ADMIN`만 가능합니다.
2. **무손실 스키마 동기화 (`prisma db push` + 멱등 백필)**
   - 프로젝트 배포(`docker-entrypoint.sh`)가 `prisma db push --skip-generate` 기반이므로 `prisma/migrations/` 대신 `prisma/backfill-tree-members.mjs`를 작성해 엔트리포인트에서 자동 실행하도록 구성했습니다.
   - `prisma/backfill-tree-members.mjs`와 `prisma/promote-admin.ts`는 Node 24의 `process.loadEnvFile?.()`을 호출해 `.env`를 자동으로 읽습니다.
3. **공유 링크 활성화 시점**
   - `TreeSettingsModal`에서 **읽기 전용 공유 링크 활성화** 체크박스를 켠 뒤 반드시 **저장** 버튼을 눌러야 `isShared: true`가 DB에 반영되도록 의도적으로 유지하고 있습니다(과거 즉시 저장 변경은 사용자 요청으로 `909df7d`에서 롤백함).
4. **다이어그램 보기 옵션 및 편집 폼 UX**
   - `FamilyTreeCanvas.tsx` 상단의 보기 옵션(`상위 세대`, `하위 세대`, `자녀 나열`, `트리 방향`)은 좌상단 플로팅 토글로 분리했고 기본값은 접힘(`false`)입니다.
   - 모바일에서 편집 폼 상단 닫기 버튼이 보기 옵션 바에 가려지던 문제를 해결하기 위해 `#FamilyChart .f3-form-cont`에 `z-index: 30`을 적용하고, 폼 하단 버튼 영역을 `Close → Cancel → Submit` 순으로 배치했습니다.

---

## 2. 후속 개발 백로그 (미구현)

### 우선순위 높음 — 논의 완료된 기능
- **공유 링크 유효기간 설정 (시간 단위 / 일 단위)**
  - **설계 방향**:
    1. `prisma/schema.prisma`의 `FamilyTree`에 `shareExpiresAt DateTime?` 추가 (`null`이면 무기한)
    2. `PATCH /api/trees/[treeId]`에서 기간 값(`hours` / `days`)을 받아 **서버 시각 기준**으로 `shareExpiresAt` 계산 저장
    3. `GET /api/share/[token]`에서 `tree.shareExpiresAt && tree.shareExpiresAt <= new Date()`이면 `410 Gone` 반환, `/share/[token]/page.tsx`에서 만료 안내 표시
    4. `TreeSettingsModal.tsx`에 무기한/시간/일 입력 및 현재 만료 예정 시각 표시 추가
  - **구현 전 확인 필요 사항**:
    - 만료 후 기간을 다시 연장했을 때 기존 토큰을 그대로 살릴지 여부
    - 최소/최대 허용 기간(예: 최소 1시간 ~ 최대 365일)

### 우선순위 중간/낮음 — 보안 및 코드 품질 개선
- **마지막 `OWNER` 보호 트랜잭션화**: `app/api/trees/[treeId]/members/route.ts` 및 `[userId]/route.ts`의 `count` + `update`/`delete`/`upsert`를 `prisma.$transaction`으로 묶어 동시성(TOCTOU) 경합 방지
- **로그인 브루트포스 방어**: `POST /api/auth/login`에 실패 횟수 제한(Rate Limiting) 도입 검토
- **Next.js 16 `middleware.ts` → `proxy.ts` 마이그레이션**: `next build` 시 출력되는 deprecation 안내에 맞춰 추후 `proxy.ts`로 전환 검토
- **프론트엔드 에러/접근성 보강**:
  - `app/trees/page.tsx` 비-401 오류 상태 표시
  - `app/login/page.tsx` / `app/register/page.tsx` 안내 문구를 현재 권한 모델에 맞게 수정
  - `TreeMembersModal.tsx`, `TreeSettingsModal.tsx`에 `role="dialog"` / `aria-modal="true"` 추가

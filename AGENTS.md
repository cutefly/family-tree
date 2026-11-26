# AGENTS.md — AI 에이전트 작업 지침

이 문서는 새로운 AI 세션이 `family-tree` 프로젝트를 클린 환경에서 이어받아 개발할 때 가장 먼저 참고해야 하는 프로젝트 기준 지침입니다.

## 1. 기준 문서 안내
- **현재 시스템 아키텍처 (Single Source of Truth)**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **의사결정 맥락 및 후속 백로그**: [docs/HANDOFF.md](docs/HANDOFF.md)
- **셋업 및 배포 가이드**: [README.md](README.md)
- `docs/superpowers/specs/` 및 `docs/superpowers/plans/`는 과거 설계·구현 기록(아카이브)이므로, 현재 동작과 충돌할 경우 반드시 `docs/ARCHITECTURE.md`와 실제 코드를 우선합니다.

## 2. 기술 스택 및 핵심 명령어
- **Stack**: Next.js 16 (`--webpack`), React 19, TypeScript, Prisma 6 (PostgreSQL), Tailwind CSS 4, `family-chart` + `d3`, Vitest
- **테스트 실행**: `npm test` (`vitest run`)
- **프로덕션 빌드 및 타입 체크**: `npm run build` (`next build --webpack`)
- **DB 스키마 동기화**: `npx prisma db push` *(이 프로젝트는 `prisma/migrations`를 사용하지 않음)*
- **기존 소유자 백필 (멱등)**: `node prisma/backfill-tree-members.mjs`
- **관리자 승격 CLI**: `npx tsx prisma/promote-admin.ts <email>`

## 3. 절대 유지해야 하는 아키텍처 불변 규칙
1. **데이터베이스 스키마 변경 시 기존 데이터 보존**:
   - `FamilyTree.ownerId` 컬럼은 하위 호환성과 소유자 추적을 위해 유지합니다.
   - 배포 시 `docker-entrypoint.sh`가 `prisma db push --skip-generate` 후 `node ./prisma/backfill-tree-members.mjs`를 자동 실행하므로, 스키마 변경 시 기존 데이터가 삭제되지 않도록 비파괴적 변경을 유지합니다.
2. **인증 및 권한 검증**:
   - 모든 보호된 API는 `lib/auth.ts`의 `getCurrentUser()`로 **매 요청 시 DB에서 최신 `User(role)`을 조회**합니다(세션 쿠키 재발급 없이 권한 변경 즉시 반영).
   - 가계도 권한 검증은 `lib/tree-auth.ts`의 `requireAdmin()` 및 `requireTreeAccess(treeId, minRole)`을 사용합니다.
   - `POST /api/trees`는 `ADMIN` 전용입니다.
   - `OWNER`는 `EDITOR`/`VIEWER`만 관리할 수 있으며, `OWNER` 권한 부여·강등·제거는 `ADMIN`만 가능합니다. 마지막 `OWNER`의 강등/제거는 항상 `400`으로 차단합니다.
   - `VIEWER`와 `EDITOR`에게 반환되는 가계도 API 응답(`GET /api/trees`, `GET /api/trees/[treeId]`)에는 `shareToken`과 `ownerId`를 포함하지 않습니다.
3. **공유 링크 동작**:
   - `TreeSettingsModal`에서 **읽기 전용 공유 링크 활성화** 체크 후 **저장** 버튼을 눌러야 DB의 `isShared`가 활성화됩니다(체크 시 즉시 저장하지 않음).
4. **다이어그램 UI (`components/FamilyTreeCanvas.tsx`)**:
   - 상단 보기 옵션 행(`상위 세대`, `하위 세대`, `자녀 나열`, `트리 방향`)은 좌상단 플로팅 토글 버튼(`보기 옵션`)으로 제어하며, **초기 기본값은 접힘(`false`)**입니다.
   - `family-chart` 편집 폼(`.f3-form-buttons`)의 버튼 순서는 **`Close → Cancel → Submit`**을 유지하고, `app/globals.css`에서 `#FamilyChart .f3-form-cont`의 `z-index`는 플로팅 옵션 바(`z-20`)보다 높게(`z-30`) 유지합니다.
   - 카드 HTML 출력 시 반드시 `escapeHtml()`을 거쳐 XSS를 방지합니다.

## 4. 작업 완료 기준
- 코드 수정 후 `npm test`와 `npm run build`를 모두 실행해 통과를 확인합니다.
- 변경된 API/권한 규칙에는 Vitest 단위/통합 테스트를 함께 추가합니다.

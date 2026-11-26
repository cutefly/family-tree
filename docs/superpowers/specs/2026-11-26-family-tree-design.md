# 가계도 관리 웹 애플리케이션 설계 스펙

**작성일**: 2026-11-26  
**상태**: 검토 대기 (Draft)  
**대상 경로**: `/Users/kpcard/Documents/node-workspace/family-tree`

---

## 1. 개요 및 목표

개인을 객체(`Person`)로 관리하고 부모-자녀 관계 및 배우자 관계를 데이터로 저장하여, 한국식 가계도(족보) 특성을 반영한 다이어그램으로 시각화하는 웹 애플리케이션입니다.

### 핵심 요구사항
- **실행 환경**: 서버·DB 기반 웹 서비스 (Next.js App Router + PostgreSQL + Prisma)
- **관계 범위**: 수십 명 규모의 기본 가족 관계(친생 부모-자녀, 배우자)
- **한국식 가계도 특성**:
  - 개인의 한글 이름(`nameKo`) 및 한자 이름(`nameHanja`) 지원
  - 이름 없이 성씨와 본관(출생지)만 있는 배우자 지원 (성씨·본관 모두 한글/한자 저장)
  - 가계도 단위의 대표 본관·성씨(한글/한자) 글로벌 설정
  - 자녀 순서(`birthOrder`) 저장 및 나열 방식 선택 (전체 순번순 / 성별+순번순)
- **다이어그램 시각화**: 가계도 전용 라이브러리(`family-chart`) 기반 렌더링, 줌/패닝, 라이브러리 내장 상·하위 세대 수(`setAncestryDepth`, `setProgenyDepth`) 설정 연동
- **접근 제어**: 소유자 로그인 후 생성·편집, 가족들에게는 읽기 전용 공유 URL(`/share/[token]`) 제공

---

## 2. 시스템 아키텍처

단일 **Next.js (App Router, TypeScript)** 프로젝트로 프론트엔드 UI와 백엔드 API를 통합 구성합니다.

- **Presentation Layer (`app/`, `components/`)**:
  - `FamilyTreeCanvas`: `family-chart` 라이브러리를 마운트하여 가계도 다이어그램을 렌더링하고, 줌/패닝, 중심 인물 전환, 상·하위 세대 수(`setAncestryDepth`, `setProgenyDepth`) 및 자녀 나열 방식 보기 옵션을 제공합니다.
  - `PersonDetailPanel`: 노드 클릭 시 상세 정보 표시 및 소유자 전용 편집(정보 수정, 부모/배우자/자녀 추가·연결·삭제)을 처리합니다.
  - `TreeSettingsModal`: 가계도 제목, 글로벌 본관·성씨(한글/한자), 기본 자녀 나열 방식(`childOrderMode`), 공유 링크 활성화/재발급을 관리합니다.
- **Domain Logic (`lib/`)**:
  - `lib/family-graph.ts`: DB 엔티티(`Person[]`, `Marriage[]`)를 `family-chart` 입력 데이터 포맷으로 변환하는 순수 함수 모듈 (자녀 정렬, 표시 이름 포맷팅 포함).
  - `lib/validation.ts`: 순환 부모 참조 검사, 이름/성씨 필수 입력 검증 등 무결성 규칙.
  - `lib/auth.ts`: 비밀번호 해싱(`scrypt`) 및 HTTP-only 세션 쿠키 검증.
- **API & Data Layer (`app/api/`, `prisma/`)**:
  - Next.js Route Handlers에서 REST API 제공.
  - `Prisma ORM`을 통해 **PostgreSQL**과 통신.

---

## 3. PostgreSQL 데이터 모델 (Prisma 스키마 설계)

### 3.1 `User`
| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | String (UUID) | PK | 사용자 고유 ID |
| `email` | String | Unique, Not Null | 로그인 이메일 |
| `passwordHash` | String | Not Null | 솔트 포함 해시 비밀번호 |
| `name` | String | Not Null | 사용자 이름 |
| `createdAt` | DateTime | Default now() | 생성 시각 |

### 3.2 `FamilyTree` (가계도 및 글로벌 설정)
| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | String (UUID) | PK | 가계도 ID |
| `title` | String | Not Null | 가계도 이름 |
| `ownerId` | String | FK → `User.id` | 소유자 ID |
| `bonKo` | String? | Nullable | 글로벌 대표 본관 (한글, 예: `김해`) |
| `bonHanja` | String? | Nullable | 글로벌 대표 본관 (한자, 예: `金海`) |
| `surnameKo` | String? | Nullable | 글로벌 대표 성씨 (한글, 예: `김`) |
| `surnameHanja` | String? | Nullable | 글로벌 대표 성씨 (한자, 예: `金`) |
| `childOrderMode` | Enum | Default `BY_ORDER` | `BY_ORDER` \| `BY_GENDER_THEN_ORDER` |
| `rootPersonId` | String? | Nullable | 기본 중심 인물 ID |
| `shareToken` | String | Unique, Not Null | 읽기 전용 공유 토큰 |
| `isShared` | Boolean | Default false | 공유 링크 활성화 여부 |
| `createdAt` | DateTime | Default now() | 생성 시각 |
| `updatedAt` | DateTime | UpdatedAt | 수정 시각 |

### 3.3 `Person` (개인 객체)
| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | String (UUID) | PK | 개인 고유 ID |
| `treeId` | String | FK → `FamilyTree.id` (Cascade) | 소속 가계도 |
| `nameKo` | String? | Nullable | 한글 이름 (이름 없는 배우자는 null) |
| `nameHanja` | String? | Nullable | 한자 이름 |
| `surnameKo` | String? | Nullable | 성씨 한글 (예: `김`) |
| `surnameHanja` | String? | Nullable | 성씨 한자 (예: `金`) |
| `bonKo` | String? | Nullable | 본관/출생지 한글 (예: `김해`) |
| `bonHanja` | String? | Nullable | 본관/출생지 한자 (예: `金海`) |
| `gender` | Enum | Not Null | `MALE` \| `FEMALE` \| `OTHER` |
| `birthDate` | String? | Nullable | 생년월일 (부분 날짜 `YYYY`, `YYYY-MM`, `YYYY-MM-DD` 허용) |
| `deathDate` | String? | Nullable | 사망일 (부분 날짜 허용) |
| `birthOrder` | Int? | Nullable | 부모 기준 자녀 순번 (1, 2, 3...) |
| `memo` | String? | Nullable | 비고/메모 |
| `fatherId` | String? | FK → `Person.id` (`SET NULL`) | 부(아버지) ID |
| `motherId` | String? | FK → `Person.id` (`SET NULL`) | 모(어머니) ID |
| `createdAt` | DateTime | Default now() | 생성 시각 |
| `updatedAt` | DateTime | UpdatedAt | 수정 시각 |

### 3.4 `Marriage` (배우자 관계)
| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | String (UUID) | PK | 관계 ID |
| `treeId` | String | FK → `FamilyTree.id` (Cascade) | 소속 가계도 |
| `person1Id` | String | FK → `Person.id` (Cascade) | 배우자 1 (`person1Id < person2Id` 정규화) |
| `person2Id` | String | FK → `Person.id` (Cascade) | 배우자 2 |
| `createdAt` | DateTime | Default now() | 생성 시각 |

- **유니크 제약**: `@@unique([treeId, person1Id, person2Id])`로 동일 부부 중복 저장을 방지합니다.

---

## 4. 가계도 변환 로직 및 시각화 (`lib/family-graph.ts`)

### 4.1 인물 카드 표시 이름 포맷팅
1. `nameKo`가 존재하는 경우:
   - 성씨가 별도로 있으면 `surnameKo + nameKo` 또는 `nameKo` (한자 병기 시 `홍길동 (洪吉童)`). 입력 시 `nameKo`에 성을 포함한 풀네임을 적거나 성/이름을 분리해 일관되게 표시합니다. (기본: `nameKo`에 이름 또는 성명 저장, `surnameKo`/`bonKo`는 본관·성씨 메타데이터로 보관하며, `nameKo`가 없을 때 조합에 사용)
2. `nameKo`가 없고 `surnameKo`만 존재하는 경우 (배우자 등):
   - `bonKo`가 함께 있으면: `${bonKo} ${surnameKo}씨` (한자 병기 가능 시 `${bonHanja} ${surnameHanja}氏`)
   - `surnameKo`만 있으면: `${surnameKo}씨`

### 4.2 자녀 정렬 규칙 (`childOrderMode`)
- **`BY_ORDER`**: `birthOrder` 오름차순으로 정렬 (`null`인 경우 뒤쪽에 배치, 동일 순번 시 `createdAt` 순).
- **`BY_GENDER_THEN_ORDER`**: 성별 그룹(`MALE` → `FEMALE` → `OTHER`)으로 먼저 묶고, 각 그룹 내에서 `birthOrder` 오름차순으로 정렬.

### 4.3 `family-chart` 어댑터 매핑 및 세대 범위 제어
- `lib/family-graph.ts`는 `Person[]`과 `Marriage[]`를 `family-chart` 노드 포맷(`{ id, data, rels: { parents, children, spouses } }`)으로 변환합니다.
- `children` 배열은 선택된 `childOrderMode`에 따라 정렬한 순서대로 전달합니다.
- **상·하위 세대 범위 표기**: 커스텀 그래프 필터링을 직접 구현하지 않고, `family-chart`가 기본 제공하는 `setAncestryDepth(depth)` 및 `setProgenyDepth(depth)` API에 UI의 세대 수 옵션을 연결하여 처리합니다.
- `family-chart`의 성별 매핑(`'M' | 'F'`)에서 `OTHER`는 레이아웃 처리용 기본값으로 매핑하되 카드 UI에는 실제 성별 라벨을 표시합니다.
- 캔버스는 줌/패닝, 화면 맞춤(Fit), 중심 인물 전환, 상/하위 세대 수 선택 컨트롤을 제공합니다.

---

## 5. 인증, 공유 및 API 설계

### 5.1 주요 API 엔드포인트
- **인증**:
  - `POST /api/auth/register` — 회원가입
  - `POST /api/auth/login` — 로그인 (HTTP-only 세션 쿠키 발급)
  - `POST /api/auth/logout` — 로그아웃
  - `GET /api/auth/me` — 현재 로그인 사용자 확인
- **가계도 (소유자 인증 필수)**:
  - `GET /api/trees` — 내 가계도 목록
  - `POST /api/trees` — 가계도 생성 (글로벌 본관·성씨 설정 포함)
  - `GET /api/trees/[treeId]` — 가계도 상세 + 전체 인물·결혼 데이터
  - `PATCH /api/trees/[treeId]` — 글로벌 설정, `childOrderMode`, `rootPersonId`, `isShared` 수정 및 `shareToken` 재발급
  - `DELETE /api/trees/[treeId]` — 가계도 삭제
- **인물 및 관계 (소유자 인증 + `tree.ownerId === session.userId` 검증 필수)**:
  - `POST /api/trees/[treeId]/persons` — 인물 추가 (글로벌 본관·성씨 기본값 자동 제안 가능)
  - `PATCH /api/trees/[treeId]/persons/[personId]` — 인물 정보 및 `fatherId`/`motherId`/`birthOrder` 수정
  - `DELETE /api/trees/[treeId]/persons/[personId]` — 인물 삭제
  - `POST /api/trees/[treeId]/marriages` — 배우자 연결
  - `DELETE /api/trees/[treeId]/marriages/[marriageId]` — 배우자 연결 해제
- **읽기 전용 공유 (인증 불필요)**:
  - `GET /api/share/[token]` — `isShared === true`인 가계도의 읽기 전용 데이터 반환 (소유자 이메일 등 민감 정보 제외)

### 5.2 공유 화면 (`/share/[token]`)
- 로그인 없이 접속 가능하며, 편집 UI는 모두 비활성화됩니다.
- 열람자도 화면 상단의 **보기 옵션**(중심 인물 선택, 상위/하위 세대 수 제한, 자녀 정렬 방식 미리보기, 줌/패닝)을 로컬 상태로 자유롭게 조작할 수 있습니다.

---

## 6. 데이터 무결성 및 에러 처리

- **이름 필수 검증**: `Person` 생성/수정 시 `nameKo`와 `surnameKo`가 모두 비어 있으면 `400 Bad Request`를 반환합니다.
- **부모 성별/순환 참조 검증**:
  - 자기 자신을 `fatherId` 또는 `motherId`로 지정할 수 없습니다.
  - 부모를 연결할 때, 대상 부모의 조상을 거슬러 올라가며 현재 인물이 나타나면 순환 참조로 간주해 `400 Bad Request`를 반환합니다.
  - `fatherId`와 `motherId`가 동일한 인물일 수 없습니다.
- **배우자 관계 검증**: 자기 자신과 결혼할 수 없으며, `person1Id < person2Id`로 정렬 후 저장해 중복을 방지합니다.
- **삭제 안정성**: 인물 삭제 시 자녀의 `fatherId`/`motherId`는 DB 외래키 `ON DELETE SET NULL`로 안전하게 해제되며, `FamilyTree.rootPersonId`가 해당 인물이었다면 `null`로 초기화합니다.

---

## 7. 테스트 전략 (Vitest)

- **단위 테스트 (`lib/__tests__/`)**:
  - `family-graph.test.ts`:
    - `nameKo` 유무 및 `bonKo`/`surnameKo` 조합 표시 이름 포맷팅 검증
    - `BY_ORDER` vs `BY_GENDER_THEN_ORDER` 자녀 정렬 검증
    - `family-chart` 어댑터의 양방향 `parents`/`children`/`spouses` 생성 검증
  - `validation.test.ts`:
    - 직계/다세대 순환 부모 참조 탐지 검증
    - 이름/성씨 필수 조건 및 배우자 ID 정규화 검증
- **API 통합 테스트**:
  - 소유자 권한 검증(타인의 가계도 수정 시 `403 Forbidden`)
  - 공유 토큰 비활성화(`isShared: false`) 시 `404` 응답 검증

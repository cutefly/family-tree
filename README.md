# Family Tree (가계도 관리 서비스)

로그인 사용자별 권한 체계(`ADMIN` / `OWNER` / `EDITOR` / `VIEWER`)와 인터랙티브 가계도 다이어그램(`family-chart`), 읽기 전용 공유 링크를 제공하는 Next.js 웹 애플리케이션입니다.

---

## 1. 환경 변수 설정 (`.env`)

`.env.example`을 복사해 `.env`를 생성합니다.

```bash
cp .env.example .env
```

| 변수명 | 설명 | 비고 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 필수 |
| `SESSION_SECRET` | 세션 쿠키 HMAC 서명 키 | 운영(`production`) 환경 필수 (`openssl rand -base64 32`) |
| `ADMIN_EMAIL` | 회원가입 시 자동으로 `ADMIN` 권한을 부여할 이메일 | 선택 (쉼표로 복수 지정 가능) |

---

## 2. 로컬 개발 환경 실행

```bash
# 1) 의존성 설치
npm install

# 2) Prisma Client 생성 및 DB 스키마 반영
npx prisma generate
npx prisma db push

# 3) (기존 데이터가 있는 DB인 경우) 기존 소유자 멤버십 백필
node prisma/backfill-tree-members.mjs

# 4) 개발 서버 실행
npm run dev
```

### 테스트 및 빌드 검증
```bash
npm test       # Vitest 전체 테스트 실행
npm run build  # TypeScript 검사 및 Next.js 프로덕션 빌드
```

---

## 3. 초기 관리자(`ADMIN`) 설정

1. **신규 가입 시 자동 지정**: `.env`의 `ADMIN_EMAIL`에 이메일을 등록한 뒤 해당 이메일로 회원가입합니다.
2. **기존 계정 승격**: 이미 가입된 사용자를 관리자로 승격하려면 아래 CLI를 실행합니다.
   ```bash
   npx tsx prisma/promote-admin.ts user@example.com
   ```

---

## 4. Docker Compose 배포

```bash
docker compose up -d --build
```

컨테이너 시작 시 `docker-entrypoint.sh`가 다음을 자동으로 수행합니다.
1. `prisma db push --skip-generate` (기존 데이터 무손실 스키마 동기화)
2. `node ./prisma/backfill-tree-members.mjs` (기존 `FamilyTree.ownerId` → `TreeMember(OWNER)` 멱등 백필)
3. `node server.js` (Next.js standalone 서버 시작)

---

## 5. 프로젝트 문서
- AI 작업 지침: [AGENTS.md](AGENTS.md)
- 시스템 아키텍처: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 인수인계 및 백로그: [docs/HANDOFF.md](docs/HANDOFF.md)

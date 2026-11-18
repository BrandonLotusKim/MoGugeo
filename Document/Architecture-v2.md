# 모국어(MoGugeo) v2 아키텍처 설계 — DB 기반 재설계

최종 작성: 2026-05-14
상태: **설계 확정본** (구현 미착수)
연계 문서: `FeatureSpec.md` (5개 기능 정의), `Roadmap.md` (이행 체크리스트)

---

## 0. 배경과 목표

v1 은 Electron 단독 + `localStorage` 구조라 데이터가 디바이스에 종속되고,
콘텐츠 갱신·학습 통계 누적·다중 디바이스 동기화가 불가능하다.

v2 는 PostgreSQL 기반으로 다음 데이터를 영속 저장한다:
- 외국어 콘텐츠 (문장 + 해석·예문·팁)
- 사용자 계정 정보, 로그인 기록
- 점수·공부 기록·복습 큐·스트릭 등 학습 활동 데이터

핵심 원칙:
1. **한 번에 다 바꾸지 않는다.** 4단계(P1~P4)로 점진 이행, 각 단계는 독립 배포 가능.
2. **무과금.** 모든 인프라는 무료 티어로 구성. 유료 전환은 사용자가 명시적으로 결정하기 전까지 없다.
3. **v1 자산 폐기 금지.** 기존 STAGE C 로직은 P3 에서 동기화 레이어만 덧붙여 재사용.

### 기능 범위 (FeatureSpec.md 기준)
활성: **회원가입 · 로그인 · 데일리 팝업 · 문장 해석 · 학업 성취도** 5개.
비활성: 단어 학습·원어민 표현 (`src/renderer/_disabled/` 백업), 레벨 시스템 제거.

---

## 1. 아키텍처 전환

```
[현재 v1]  Electron 단독 ── localStorage (mogugeo_state 키 1개)

[목표 v2]  Electron 클라이언트 ──HTTPS──> Supabase ──> PostgreSQL
                  │                  (Auth + DB + Storage + 자동 API)
                  └── 로컬 캐시 (오프라인 폴백)
```

### 무료 인프라 스택 (확정)

| 역할 | 서비스 | 무료 티어 | 비고 |
|---|---|---|---|
| DB | **Supabase** (PostgreSQL) | 500MB DB | Prisma 그대로 호환 |
| 인증 | **Supabase Auth** | 월 50,000 MAU | 아이디→내부 이메일 매핑 방식 |
| API | Supabase 자동 생성 API + Edge Functions | 무제한 요청 | 별도 서버 운영 불필요 |
| 콘텐츠/EXE 호스팅 | **GitHub Releases** + **GitHub Pages** | 무료 | 인스톨러·정적 콘텐츠 배포 |

### 무료 티어의 한계 (정직한 고지)
- Supabase 무료 프로젝트는 **1주일간 활동이 없으면 일시정지**된다 (대시보드에서 재활성 가능, 데이터 보존). GitHub Actions cron 핑으로 회피.
- DB 500MB / Storage 1GB 제한 — 초기 수년간 충분하나 사용자 급증 시 한계.
- **상업화하거나 사용자가 급증하면** Supabase Pro($25/월) 전환 지점이 온다. 그 전까지 0원.

---

## 2. 데이터 3분류

| 영역 | 성격 | 내용 |
|---|---|---|
| 콘텐츠 | 공용, 관리자 관리 | 문장 + 해석/예문/팁 |
| 계정 | 개인, 민감 | 사용자 프로필(아이디·닉네임·복구이메일·전화·통신사), 로그인 기록 |
| 학습활동 | 개인, 대량 누적 | 점수, 공부 기록, 복습 큐, 스트릭, 세션 |

---

## 3. DB 스키마 (Prisma)

```prisma
// ───────── 콘텐츠 영역 ─────────
model Sentence {
  id          String   @id @default(cuid())
  level       Level                       // 난이도 (출제 필터용, 화면 노출 금지)
  category    Category                    // 분류 (내부용, 화면 노출 금지)
  english     String
  answer      String                      // 한국어 모범 답안
  keywords    String[]                    // 채점용 키워드
  tip         String
  grammar     String
  extra       String
  contentVer  Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  records     StudyRecord[]
}

// 단어/표현 콘텐츠는 v1 에서 비활성화 — 재활성화 시 Word/Expression 모델 추가
// (src/renderer/_disabled/ 에 화면 백업 보존)

// 콘텐츠 묶음/버전 — 클라이언트 증분 동기화용
model ContentVersion {
  id          Int      @id @default(autoincrement())
  version     String                       // "1.2.0"
  publishedAt DateTime @default(now())
  notes       String?
}

// ───────── 계정 영역 ─────────
// 인증은 Supabase Auth + 아이디→내부 이메일 매핑.
// 가입 시 {아이디}@mogugeo.local 내부 이메일을 생성해 Supabase Auth 에 등록.
model User {
  id            String   @id            // Supabase auth user uid
  username      String   @unique        // 로그인 ID (아이디 기반 회원가입)
  displayName   String                  // 닉네임 (화면 표시명)
  recoveryEmail String?                 // 선택 입력 — 비번 복구용
  phone         String?                 // 선택 입력 — 저장만 (SMS 활용은 유료 전환 시)
  carrier       String?                 // 선택 입력 — 저장만 (본인확인은 유료 전환 시)
  createdAt     DateTime @default(now())
  loginLogs     LoginLog[]
  sessions      StudySession[]
  records       StudyRecord[]
  reviewItems   ReviewItem[]
  streak        Streak?
  settings      UserSettings?
}

model LoginLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  loggedAt  DateTime @default(now())
  ip        String?
  device    String?
  success   Boolean
}

// ───────── 학습활동 영역 ─────────
model StudySession {
  id         String      @id @default(cuid())
  userId     String
  user       User        @relation(fields: [userId], references: [id])
  type       ContentType
  startedAt  DateTime    @default(now())
  endedAt    DateTime?
  itemsCount Int         @default(0)
  records    StudyRecord[]
}

model StudyRecord {
  id          String        @id @default(cuid())   // 클라이언트 생성 → 멱등 동기화 키
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  sessionId   String?
  session     StudySession? @relation(fields: [sessionId], references: [id])
  contentType ContentType                          // 현재는 sentence 만 사용
  sentenceId  String?
  sentence    Sentence?     @relation(fields: [sentenceId], references: [id])
  direction   Direction                            // en2ko / ko2en (데일리 팝업 양방향 구분)
  userAnswer  String
  score       Int                                  // 0~100
  isCorrect   Boolean
  answeredAt  DateTime      @default(now())
  syncedAt    DateTime?                             // 서버 반영 시각 (오프라인 동기화 추적)
}

model ReviewItem {
  id             String      @id @default(cuid())
  userId         String
  user           User        @relation(fields: [userId], references: [id])
  contentType    ContentType
  contentId      String
  level          Int         @default(0)    // 망각곡선 단계 0~3
  nextReviewAt   DateTime
  lastReviewedAt DateTime?
  @@unique([userId, contentType, contentId])
}

model Streak {
  id             String    @id @default(cuid())
  userId         String    @unique
  user           User      @relation(fields: [userId], references: [id])
  currentStreak  Int       @default(0)
  longestStreak  Int       @default(0)
  lastStudyDate  DateTime?
  totalStudyDays Int       @default(0)
}

model UserSettings {
  id            String   @id @default(cuid())
  userId        String   @unique
  user          User     @relation(fields: [userId], references: [id])
  difficulty    Level    @default(intermediate)   // 최초 로그인 시 사용자가 선택
  dailyPopupOn  Boolean  @default(true)
  popupTime     String   @default("08:30")
  autoStart     Boolean  @default(true)           // 부팅 시 트레이 상주
  darkMode      Boolean  @default(false)
}

enum Level       { beginner intermediate advanced }
enum Category    { business daily academic travel emotion }
enum ContentType { sentence }                      // word/expression 비활성 — 재활성 시 추가
enum Direction   { en2ko ko2en }
```

### 설계 노트
- `Sentence` 는 v1 `src/data/sentences.json` 필드를 1:1 정규화. 단어/표현 모델은 비활성화로 제외.
- `User.level` 필드 제거 — 난이도는 `UserSettings.difficulty` 로 일원화. 게이미피케이션 레벨도 제거.
- `StudyRecord.id` 는 **클라이언트가 cuid 로 생성** → 오프라인 기록을 나중에 올려도 중복 안 됨(멱등).
- `StudyRecord.direction` — 데일리 팝업의 영→한 / 한→영 양방향을 구분.
- `Streak`/`ReviewItem` 은 직접 동기화하지 않고 **서버가 StudyRecord 기반으로 재계산** (§6 참조).
- `level`·`category` 는 출제 필터·내부 분류용 — **풀이 화면에 절대 노출하지 않는다** (FeatureSpec.md 결정 5).

---

## 4. API 레이어

Supabase 자동 생성 REST/RPC + Edge Functions 사용. 논리적 엔드포인트:

| 그룹 | 동작 |
|---|---|
| 인증 | Supabase Auth — 아이디(→내부 이메일) 회원가입·로그인·토큰 갱신 |
| 콘텐츠 | 콘텐츠 버전 조회 · 문장 증분 다운로드 (`since` 파라미터) |
| 학습 | 세션 생성 · 기록 일괄 업로드(멱등) · 통계 조회 · 스트릭 조회 |
| 복습 | 복습 예정 항목 조회 · 복습 결과 반영 |
| 설정 | 사용자 설정 조회/갱신 |

- 토큰은 Electron `safeStorage` 로 보관.
- 콘텐츠 동기화: 버전 비교 후 변경분만 증분 다운로드.

---

## 5. 프로젝트 구조 — 모노레포 (확정)

```
MoGugeo/
├── apps/
│   └── desktop/          # 기존 Electron (현 src/main.ts, renderer/ 이동)
├── packages/
│   └── shared/           # 공용 타입 + 채점·망각곡선 로직
├── supabase/
│   ├── migrations/       # DB 마이그레이션 SQL
│   ├── functions/        # Edge Functions (필요 시)
│   └── seed.sql          # src/data/sentences.json → DB 시드
├── prisma/
│   └── schema.prisma     # 스키마 정의 (Supabase PostgreSQL 대상)
└── package.json          # 워크스페이스 루트
```

- 별도 Next.js 서버 디렉토리는 두지 않음 — Supabase 가 API 역할을 대신.
- 채점·망각곡선 로직을 `packages/shared` 로 추출 → 클라이언트·Edge Function 양쪽에서 공유.

### 전환 리스크
- `src/` → `apps/desktop/src/` 이동 시 `tsconfig.json`, `package.json`, `electron-builder` 경로, `scripts/*.ps1` 전부 수정 필요.
- 빌드가 깨질 수 있는 작업이므로 **P1 의 첫 태스크로 격리 진행** + 빌드 통과 검증 필수.

---

## 6. 오프라인 학습기록 충돌 정책 (확정)

앱은 오프라인에서도 학습 가능(콘텐츠 캐시 보유). 여러 디바이스가 따로 학습한 뒤
동기화할 때 충돌이 발생한다. 정책:

> **"기록은 합치고, 상태는 서버가 다시 계산한다."**

- **StudyRecord (학습기록)**: append-only. 모든 디바이스의 기록을 합친다.
  클라이언트가 생성한 `cuid` 를 PK 로 써서 같은 기록이 두 번 올라가지 않도록 멱등 보장.
- **Streak / ReviewItem (파생 상태)**: 직접 동기화하지 않는다.
  서버가 해당 사용자의 StudyRecord 전체를 보고 스트릭·복습 레벨을 **재계산**한다.
- **재계산 트리거**: 동기화 완료 시 + 일 1회 배치.

---

## 7. 단계적 이행 경로 (P1~P4)

| Phase | 내용 | 인증 | localStorage 영향 |
|---|---|---|---|
| **P1** | 모노레포 전환 → Supabase 프로젝트 생성 + 스키마 마이그레이션 + 콘텐츠 시드 + 콘텐츠 동기화 | ❌ | 학습기록은 그대로 로컬 유지 |
| **P2** | Supabase Auth 아이디(→내부 이메일) 회원가입·로그인 + `User`/`LoginLog` + 최초 로그인 난이도 선택 | ✅ | 로그인 시 프로필 생성 |
| **P3** | 학습기록·점수·복습·스트릭 서버 동기화 (§6 정책 적용) | ✅ | `localStorage` → DB 마이그레이션, 로컬은 캐시로 강등 |
| **P4** | 학업 성취도 실데이터 집계, 로그인 기록 조회, 관리자 최소 콘텐츠 CRUD | ✅ | — |

### 관리자 콘텐츠 UI 범위 (확정 — 최소)
- 별도 관리 콘솔을 만들지 않는다.
- Supabase 대시보드의 테이블 편집기로 콘텐츠를 직접 추가/수정 + `seed.sql` 재적용 스크립트.
- 콘텐츠 버전(`ContentVersion`) 행만 올리면 클라이언트가 증분 동기화.

### 기존 작업 보존
v1 STAGE C 작업(localStorage 기반 채점·복습·스트릭)은 폐기하지 않는다.
P3 에서 동기화 레이어만 덧붙이면 그대로 재사용된다.

### P1 태스크 분해 (착수 시)
1. 모노레포 전환 (`src/` → `apps/desktop/`, 워크스페이스 설정, 빌드 검증)
2. Supabase 프로젝트 생성 (무료 티어) + `prisma/schema.prisma` 작성
3. 스키마 마이그레이션 적용
4. `supabase/seed.sql` — `src/data/sentences.json` → DB 적재
5. 클라이언트 `data-loader.js` 를 Supabase 콘텐츠 조회 + 로컬 캐시 폴백으로 교체

---

## 8. 결정 기록

| 항목 | 결정 | 사유 |
|---|---|---|
| DB | Supabase (PostgreSQL) | 무료 티어, Prisma 호환, Auth·Storage 통합 |
| ORM | Prisma | 타입 안전, 마이그레이션 관리 |
| 인증 | Supabase Auth — **아이디 기반** (내부 이메일 매핑) | 무료, 사용자는 아이디만 입력 |
| 비번 복구 | 가입 시 이메일 선택 입력 → 등록자만 재설정 메일 | 아이디 기반의 복구 수단 확보 |
| 전화·통신사 | 선택 입력으로 저장만 | SMS·본인확인은 유료 — 데이터만 미리 축적 |
| API | Supabase 자동 API + Edge Functions | 별도 서버 운영 불필요 |
| 콘텐츠/EXE 호스팅 | GitHub Releases + Pages | 무료 |
| repo 구조 | 모노레포 | 타입 공유, 버전 일관성 |
| 콘텐츠 저장 | DB 정본 + 클라 캐시 | 오프라인 학습 유지 |
| 오프라인 충돌 | 기록 합치기(멱등) + 상태 서버 재계산 | 데이터 손실 없음, 충돌 제거 |
| 관리자 UI | 최소 — Supabase 대시보드 활용 | 별도 콘솔 개발 비용 회피 |
| 기능 범위 | 5개 활성, 단어/표현 비활성, 레벨 시스템 제거 | 최소 기능 집중 |
| 이행 방식 | 4단계 점진 | v1 자산 보존, 단계별 독립 배포 |
| 인프라 비용 | **전부 무료 티어. 유료 전환 없음** | 사용자 요구 — 무과금 |

---

## 9. 남은 고려 사항 (P1 착수 후 발생 시 판단)

- Supabase 무료 프로젝트 1주 비활성 일시정지 → 정기 핑(GitHub Actions cron)으로 회피.
- 무료 티어 용량 한계 도달 시점 모니터링 (DB 500MB / Storage 1GB).
- 콘텐츠 규모가 커지면 콘텐츠 동기화를 전체→증분으로 최적화.
- 상업화 또는 사용자 급증 시에만 유료 전환 재논의 (현재는 고려 대상 아님).

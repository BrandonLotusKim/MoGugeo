# 모국어(MoGugeo) 통합 로드맵 — 마스터 체크리스트

최종 갱신: 2026-05-14
연계 문서: `FeatureSpec.md` (5개 기능 정의), `Architecture-v2.md` (DB·인프라)

---

## 방향 요약

"v1 로컬 앱 단독 정식 출시" 마일스톤은 폐기. 다음 순서로 일원화한다:

```
STAGE C  클라이언트 기능 완성 (localStorage 기반)
   │     └ 폐기 아님 — P3 에서 동기화 레이어만 덧붙여 재사용
   ▼
STAGE P1 모노레포 전환 + Supabase 콘텐츠 백엔드
   ▼
STAGE P2 인증 (Supabase Auth, 아이디 기반)
   ▼
STAGE P3 학습 데이터 서버 동기화
   ▼
STAGE P4 운영 기능 (성취도 실데이터·관리)
   ▼
STAGE Q  품질 & 보안     ─┐ 병렬 가능
STAGE R  배포             ─┘
```

활성 기능 5개: 회원가입 · 로그인 · 데일리 팝업 · 문장 해석 · 학업 성취도.
비활성: 단어 학습·원어민 표현, 레벨 시스템.

---

## ✅ 이미 완료 (검증됨)

- [x] **A-1** 콘텐츠 JSON 분리 + 데이터 로더 (`data-loader.js`, fetch+XHR 폴백)
- [x] **A-2** 콘텐츠 분량 — sentences 50 / words 100 / expressions 30 (한글 정상, JSON 유효)
- [x] **단어/표현 비활성화** — `vocabulary.html`·`expressions.html` → `_disabled/` 백업, 4개 화면 진입로 제거, app.js 호출 제거, package.json 패키징 제외, 빌드 통과
- [x] **D-4** GitHub Actions CI + Release 워크플로
- [x] **F-1** 개인정보 처리방침 초안 (`Document/PrivacyPolicy.md`)
- [x] **F-2** 이용약관 초안 (`Document/TermsOfService.md`)
- [x] **F-4** CHANGELOG.md
- [x] 부수 — README.md, MVPDefinition.txt, verify-build.ps1
- [x] 빌드 통과 확인 (`dist/main.js`, `dist/preload.js`)
- [x] 설계 확정 — `Architecture-v2.md`, `FeatureSpec.md` (5개 기능 심화 정의)

---

## STAGE C · 클라이언트 기능 완성 (localStorage 기반)

> P3 동기화 전까지 로컬로 동작. 이 작업은 P3 에서 그대로 재사용된다.
> 한글 텍스트를 다루는 태스크는 `fs.writeFile utf8` 직접 호출을 프롬프트에 명시할 것 (MG-001 인코딩 사고 재발 방지).

- [ ] **C-1** 채점 알고리즘 개선 — 키워드 40% + 토큰 유사도 60% + 형태소 어간 보너스, 합격선 60. 문장 해석·데일리 팝업이 **공유**
- [ ] **C-2** 데일리 팝업 — 핵심 묶음:
  - [ ] `MoGugeo.exe --popup` 인자 분기 (main.ts) — 메인 창 없이 팝업만
  - [ ] Windows Task Scheduler 등록/갱신/해제 (`schtasks`) — 정시 자동 트리거
  - [ ] 부팅 시 트레이 상주 (`app.setLoginItemSettings`) 배선
  - [ ] 양방향 2문제 (영→한 1, 한→영 1) — `sentences.json` 연동, 하드코딩 제거
  - [ ] 문제 선정 알고리즘 (복습 due 우선 → 미학습 랜덤 → 저정답 재출제)
  - [ ] 실제 채점 + `StudyRecord` 기록 + 하루 1회 가드
  - [ ] `powerMonitor` 절전 복귀 대응
- [ ] **C-3** 복습 큐 UI 활성화 + 망각곡선 (level 0~3 / +1·3·7·30일)
- [ ] **C-4** 다크모드 CSS 변수 배선
- [ ] **C-5** TTS 발음 재생 — 문장 해석 `#btn-play-audio` 활성화 (원어민 표현은 비활성이므로 제외)
- [ ] **C-6** 설정 변경 실시간 반영
- [ ] **C-7** localStorage 스키마 버전 필드 + 마이그레이션 함수
- [ ] **C-8** 로그인/회원가입 UI 정리 — 게스트 경로 제거(게스트 모드 없음 확정), 실제 인증(P2) 들어갈 자리 마련
- [ ] **C-9** mypage 레벨 표시 제거 + 메타 라벨(카테고리·난이도) 노출 금지 점검

---

## STAGE P1 · 모노레포 전환 + Supabase 콘텐츠 백엔드

> 인증 불필요. 콘텐츠만 서버화. 무료 티어.

- [ ] **P1-1** 모노레포 전환 — `src/` → `apps/desktop/`, 워크스페이스 설정, 경로 수정, **빌드 통과 검증 필수**
- [ ] **P1-2** Supabase 프로젝트 생성 (무료 티어) + `prisma/schema.prisma` 작성
- [ ] **P1-3** 스키마 마이그레이션 적용 (`supabase/migrations/`)
- [ ] **P1-4** `supabase/seed.sql` — `src/data/sentences.json` → DB 시드 적재
- [ ] **P1-5** 클라이언트 `data-loader.js` → Supabase 콘텐츠 조회 + 로컬 캐시 폴백
- [ ] **P1-6** 콘텐츠 버전 체크 → 증분 동기화 로직
- [ ] **P1-7** GitHub Actions cron 핑 — Supabase 1주 비활성 일시정지 회피
- [ ] **P1-8** `packages/shared` — 공용 타입 + 채점·망각곡선 로직 추출

---

## STAGE P2 · 인증 (Supabase Auth, 아이디 기반)

- [ ] **P2-1** Supabase Auth 연동 — 아이디 → `{아이디}@mogugeo.local` 내부 이메일 매핑
- [ ] **P2-2** `User`(username·displayName·recoveryEmail·phone·carrier) / `LoginLog` 테이블 + 프로필 생성
- [ ] **P2-3** 회원가입 UI 실배선 — 아이디·비번·닉네임·이메일/전화/통신사(선택)·약관 동의 + 입력 검증
- [ ] **P2-4** 로그인 UI 실배선 + Electron `safeStorage` 토큰 보관 + 자동 로그인
- [ ] **P2-5** 최초 로그인 시 난이도 선택 화면 1회 → `UserSettings.difficulty`
- [ ] **P2-6** 비밀번호 찾기 — `recoveryEmail` 등록자 대상 재설정 메일

---

## STAGE P3 · 학습 데이터 서버 동기화

> 충돌 정책: "기록은 합치고(멱등 cuid), 상태는 서버가 재계산" (Architecture-v2.md §6)

- [ ] **P3-1** `StudySession` / `StudyRecord` 업로드 — 클라이언트 cuid 멱등 동기화
- [ ] **P3-2** `Streak` / `ReviewItem` 서버 재계산 로직 (StudyRecord 기반)
- [ ] **P3-3** 기존 `localStorage` 데이터 → DB 1회 마이그레이션
- [ ] **P3-4** localStorage 를 캐시로 강등 — 오프라인 큐 + 온라인 복귀 시 flush
- [ ] **P3-5** `UserSettings` 서버 동기화

---

## STAGE P4 · 운영 기능

- [ ] **P4-1** 학업 성취도 실데이터 집계 — mypage 목업 → `StudyRecord`/`Streak`/`ReviewItem` 집계로 교체
- [ ] **P4-2** 로그인 기록 조회 화면
- [ ] **P4-3** 관리자 최소 콘텐츠 CRUD — Supabase 대시보드 + `seed.sql` 재적용 + `ContentVersion` 발행
- [ ] **P4-4** 콘텐츠 동기화 전체→증분 최적화 (규모 커질 시)

---

## STAGE Q · 품질 & 보안

> P1 이후 어느 시점이든 병렬 진행 가능

- [ ] **Q-1** CSP 메타 태그 (전 HTML)
- [ ] **Q-2** `webPreferences` 보안 옵션 명시 (nodeIntegration false 등)
- [ ] **Q-3** IPC 입력 검증
- [ ] **Q-4** 크래시 리포팅 (Sentry 무료 티어 or 자체 엔드포인트)
- [ ] **Q-5** 빈 상태 화면 (학습 데이터 0일 때)
- [ ] **Q-6** 온보딩 가이드 (최초 실행 1~2화면)
- [ ] **Q-7** 클린 Windows VM 인스톨/실행/언인스톨 테스트
- [ ] **Q-8** 자동 업데이트 E2E + 콘텐츠 동기화 E2E + 데일리 팝업 스케줄 E2E

---

## STAGE R · 배포

> 무료 스택 기준 (GitHub Releases + Pages)

- [ ] **R-1** `electron-updater` 도입 + GitHub Releases 를 update feed 로 설정
- [ ] **R-2** 코드 사이닝 — **선택**. 미서명으로 시작, SmartScreen 경고 감수 가능
- [ ] **R-3** 개인정보처리방침·이용약관 정적 페이지화 (초안 → GitHub Pages 게시)
- [ ] **R-4** changelog 정적 페이지 (CHANGELOG.md → 렌더)
- [ ] **R-5** 런칭/다운로드 페이지 (GitHub Pages, 무료)
- [ ] **R-6** 앱 내 "문제 신고" 메뉴
- [ ] **R-7** 베타 배포 (지인 5~10명) → 피드백 → v1.0 정식

---

## 진행 원칙

- 콘텐츠·문서 작성 시 한글은 `fs.writeFile utf8` 직접 호출 (셸 echo 경유 금지 — CP949 손상)
- 각 STAGE 의 코드 태스크는 완료 시 빌드 통과 + 산출물 직접 검증 후에만 ✅
- 무료 티어 한계 모니터링 (Supabase DB 500MB / Storage 1GB)

---

## 다음 착수 지점

**STAGE C** (클라이언트 기능 완성) 부터. C-1~C-9 중 C-2(데일리 팝업)가 가장 크고, FeatureSpec.md §3 에 상세 정의가 있다.
의존성상 권장 순서: C-1 → C-7 → C-3 → C-2 묶음 → C-4·C-5·C-6·C-8·C-9.

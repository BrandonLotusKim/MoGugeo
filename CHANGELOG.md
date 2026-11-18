# Changelog

본 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따른다.

## [Unreleased]

### Added
- 콘텐츠 외부 JSON 분리 — `src/data/sentences.json`, `words.json`, `expressions.json`, `meta.json`
- 데이터 로더 (`src/renderer/data-loader.js`) — fetch + file:// XHR 폴백
- 콘텐츠 분량 보강 — 문장 50 / 단어 100 / 표현 30 (한글 정상)
- 설계 문서 — `FeatureSpec.md`(5개 기능 상세 정의), `Architecture-v2.md`(DB·인프라), `Roadmap.md`(통합 체크리스트)
- 개인정보 처리방침 / 이용약관 초안
- GitHub Actions CI + Release 워크플로
- 빌드 검증 스크립트 (`scripts/verify-build.ps1`)

### Changed
- 학습 데이터를 코드에서 분리 — 콘텐츠 갱신이 빌드 없이 가능
- 문서를 학습 앱 컨셉으로 전면 재정비 (기존 "공용 게시판" 컨셉 폐기)
- 인프라 방향 확정 — Supabase + GitHub **무료 스택** (유료 DigitalOcean 사용 안 함)
- 회원가입 방식 정의 — 아이디 기반 (이메일 인증 아님), 게스트 모드 없음
- 데일리 팝업 정의 — 영↔한 양방향 2문제, Windows Task Scheduler 로 앱 실행 여부와 무관하게 트리거

### Disabled
- 단어 학습·원어민 표현 화면 비활성화 — `src/renderer/_disabled/` 로 백업, 4개 화면의 진입로 제거, `app.js` 호출 제거, 패키징에서 제외
- 레벨 시스템 — 제거 결정 (mypage 코드 제거는 STAGE C-9 예정)

### 미구현 (STAGE C 예정 — 정의만 완료)
- 데일리 팝업 정시 스케줄러 / 자동 시작 / 실제 채점 / 콘텐츠 연동 / 하루 1회 가드
- 채점 알고리즘 개선 (현재 단순 키워드 매칭)
- 복습 큐 UI / 망각곡선
- 다크모드 CSS 변수 배선 / TTS / 설정 실시간 반영 / localStorage 스키마 버전

## [1.0.0] - 2026-04-10
### Added
- 초기 Electron 빌드
- 로그인/회원가입 UI (목업)
- 대시보드 / 문장 학습 / 단어 학습 / 원어민 표현 / 마이페이지 / 설정 페이지
- 시스템 트레이 + 데일리 팝업 윈도우
- 커스텀 프레임리스 타이틀바
- NSIS 인스톨러 빌드 (`MoGugeo-Setup-1.0.0.exe`)
- 학습 데이터 8문장 + 10단어 (하드코딩)
- 키워드 매칭 채점 (초기 버전)
- 스트릭 시스템 (localStorage)

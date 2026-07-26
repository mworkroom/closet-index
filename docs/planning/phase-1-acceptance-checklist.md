# Closet Index Phase 1 Acceptance Checklist

- 최종 수정일: 2026-07-26
- 현재 단계: Phase 1A 앱·원격 schema·실제 로그인·Notion 시험 이전 완료, Technical Alpha 가능

## 1. 자동 검증

- [x] TypeScript typecheck
- [x] 추천·KST 날짜 단위 테스트
- [x] 같은 날짜·같은 Outfit 복수 기록 repository 테스트
- [x] 동일 submission token 멱등 처리 테스트
- [x] Wear Log 수정·삭제 repository 테스트
- [x] 미착용 Outfit의 시험 착장 분류와 첫 기록 후 자동 전환
- [x] Vite production build
- [x] PWA manifest와 service worker 생성
- [x] 최소 fixture로 Notion import dry-run과 row plan 검증
- [ ] 격리된 로컬 Supabase `db reset`
- [ ] pgTAP RLS·schema 계약 테스트
- [ ] 의존성 취약점 원격 audit

미완료 사유:

- 개발 PC에 Docker 명령이 없어 로컬 Supabase stack을 실행할 수 없다.
- `npm audit`는 npm registry에 dependency metadata를 전송하는 외부 요청이어서 별도 허용 없이 실행하지 않았다.

## 2. 모바일 브라우저 검증

390×844 viewport에서 다음을 직접 확인했다.

- [x] HOME 조건 폼이 하단 내비게이션에 가리지 않음
- [x] HOME 상위 3개 추천과 근거 표시
- [x] `나머지 2개 더 보기`로 전체 5개 데모 후보 표시
- [x] 추천 카드 → 정확한 Outfit 상세
- [x] HOME 조건이 `오늘 입기` 폼에 미리 입력됨
- [x] 착용 저장 → Calendar 반영
- [x] 같은 날짜·같은 Outfit 2건이 서로 다른 기록으로 표시
- [x] 장소가 다른 두 기록을 각각 식별
- [x] Statistics의 Outfit·Item 집계 즉시 증가
- [x] 두 검증 기록 삭제 후 집계 원복
- [x] CLOSET 기본 Retired 제외와 `Retired 포함` 필터
- [x] LOOKBOOK 기본 Error·Retired 제외
- [x] FAVORITE 고정 필터
- [x] 브라우저 console warning/error 없음
- [ ] 실제 iPhone Safari와 홈 화면 설치

## 3. 화면

- [x] A-01 Login / 비허용 계정 상태
- [x] A-02 HOME
- [x] A-03 CLOSET
- [x] A-04 Item 상세 / 조건 적합성 최소 편집
- [x] A-05 LOOKBOOK
- [x] A-06 FAVORITE
- [x] A-07 Outfit 상세
- [x] A-08 착용 기록 생성·수정
- [x] A-09 MORE
- [x] A-10 Calendar / 기록 삭제
- [x] A-11 Statistics
- [x] A-12 Settings

## 4. 데이터와 보안

- [x] UUID PK와 workspace relation SQL
- [x] 같은 날짜·같은 Outfit을 허용하는 Wear Log schema
- [x] `Favorite | OK | Error | null` 단일 Rating
- [x] 모든 public 앱 테이블 RLS SQL
- [x] 공용 `workspace_members` 접근 계약
- [x] Item의 두 적합성 컬럼만 update 권한
- [x] Wear Log CRUD 권한
- [x] `security_invoker` 통계 View
- [x] service role을 브라우저에서 사용하지 않음
- [x] Phase 1A에서 Storage 미생성
- [x] 공용 `mworkroom` 프로젝트 지정
- [x] `000…0003` workspace와 두 membership 생성
- [x] migration 2개 원격 적용
- [x] 원격 RLS·grant·View·advisor 정적 검증
- [x] 익명 REST 읽기 요청 HTTP 401 확인
- [x] 복합 외래 키 index advisor 항목 10개 해소
- [ ] Google OAuth provider·redirect 설정
- [ ] 실제 로그인·RLS 교차 계정 테스트

## 5. Notion 이전

- [x] 4개 원본 데이터 source 조사
- [x] 필드·relation 매핑 문서
- [x] API `2026-03-11` pagination 추출기
- [x] relation 25개 초과 보완 조회
- [x] dry-run 기본 / 명시적 `--apply`
- [x] stable UUID upsert와 import report
- [x] 자동 delete 없음
- [x] 개인 snapshot·실제 매핑 파일 Git 제외
- [x] 네 원본 Connection 접근과 현재 기준 수량 확인
- [x] Notion connection token으로 전체 snapshot 생성
- [x] custom emoji ID별 HEX 확정
- [x] dry-run 수량·relation 대조
- [x] Supabase 시험 이전
- [ ] Technical Alpha
- [ ] 전환 직전 수동 추가분 이전
- [ ] 최종 원본 대조와 전환 시점 선언

## 6. Phase 1B

- [ ] 이미지 규격
- [ ] Storage bucket과 객체 정책
- [ ] 누끼 이미지 준비
- [ ] Item image fallback
- [ ] 고정 slot Outfit 합성
- [ ] 이미지 있는 항목과 없는 항목 혼합 검증

## 7. 현재 판단

Phase 1 구현은 시작 가능한 상태를 지나 Phase 1A 로컬 애플리케이션까지 만들어졌다. 다만 아래를 구분한다.

- **구현 완료:** 로컬 PWA, 전체 화면, 추천, 기록 CRUD, 집계, schema·RLS migration, 이전 도구
- **원격 기반 완료:** `mworkroom` workspace `000…0003`, 12개 RLS 테이블, 2개 `security_invoker` View
- **활성화 완료:** Supabase 시험 import와 원격 수량·관계 대조
- **후속 범위:** Phase 1B 이미지

기존 앱 테이블은 변경하지 않았고 새 객체는 모두 `closet_*` 접두사를 사용한다.

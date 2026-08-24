# Closet Index Phase 1 Implementation Status

- 날짜: 2026-07-26
- 앱 버전: `0.1.0`
- 2026-08-25 갱신: Notion → Supabase 일회성 migration은 완료 상태이며 active import writer와 package command를 제거했다.

## 실행

```powershell
npm install
npm run dev
```

기본 `.env.example`은 `VITE_DEMO_MODE=true`다. 브라우저 localStorage에 들어 있는 작은 데모 dataset으로 전체 흐름을 확인할 수 있다.

## Supabase 모드

원격 대상은 `mworkroom` 프로젝트이며 Closet Index workspace는 `00000000-0000-0000-0000-000000000003`이다. 2026-07-26에 schema와 FK index migration을 적용했다.

`.env.local`:

```dotenv
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://ddlwainwollvpaeccpty.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_CLOSET_WORKSPACE_ID=00000000-0000-0000-0000-000000000003
```

브라우저에는 publishable key만 둔다. 초기 Notion migration 당시 secret key는 Git에서 제외된 로컬 환경에서만 사용했다. 해당 import writer는 제거했으며 현재 앱과 active script는 이 migration 경로의 secret/service-role key를 사용하지 않는다.

## 구현된 흐름

```text
Google 로그인 또는 로컬 데모
→ HOME 조건 입력
→ 상위 3개 추천과 설명
→ Outfit 상세
→ 오늘 입기
→ Wear Log 저장
→ Calendar 수정·삭제
→ Statistics 재계산
```

하단 탭:

```text
HOME · CLOSET · LOOKBOOK · FAVORITE · MORE
```

## 주요 소스

| 위치 | 역할 |
|---|---|
| `src/lib/recommendation.ts` | 설명 가능한 추천 규칙 |
| `src/data/demo-repository.ts` | 로컬 검증 저장소 |
| `src/data/supabase-repository.ts` | 실제 Supabase 저장소 |
| `src/context/AuthContext.tsx` | Google Auth·workspace membership |
| `src/context/DataContext.tsx` | 화면 공통 데이터 mutation·refresh |
| `src/pages` | Phase 1A 12개 화면 |
| `supabase/migrations` | schema·grant·RLS |
| `supabase/tests` | pgTAP 계약 |
| `scripts/extract-notion.mjs` | Notion snapshot |

## 검증 명령

```powershell
npm test
npm run typecheck
npm run build
node --check scripts/extract-notion.mjs
```

## 다음 활성화 순서

1. [완료] `mworkroom`의 Google OAuth와 redirect URL을 확인한다.
2. [완료] 실제 로그인으로 `000…0003` membership과 RLS를 확인한다.
3. [완료] Notion connection을 4개 원본에 공유하고 전체 snapshot을 만든다.
4. [완료] custom emoji 22개의 HEX를 확정한다.
5. [완료] import dry-run 수량과 relation을 대조한다.
6. [완료] Supabase Secret key를 로컬에 저장하고 시험 이전·원격 수량 대조를 진행한다.
7. Technical Alpha를 진행한다.
8. 전환 직전 Notion 추가분을 수동 이전하고 원본을 전환한다.

로컬 `.env.local`은 `mworkroom`의 publishable key와 Closet Index workspace를 사용한다. `.env.example`은 데모 모드를 안전한 기본값으로 유지한다.

원격 검증 결과:

- workspace `000…0003`: `admin` 1명, `member` 1명
- `closet_*` 테이블 12개: RLS 12개 모두 활성화
- 정책 16개: 모두 `authenticated` 전용
- 통계 View 2개: 모두 `security_invoker`
- `anon` 테이블 권한 0개, 실제 REST 읽기 HTTP 401
- Closet Index 관련 보안 advisor 경고 0개
- 복합 외래 키 미인덱스 advisor 항목 0개

Notion Connection 검증 결과:

- `Wardobe` 451개, 이름·카테고리 누락 0, Retired 87개
- `Outfits` 507개, Rating 분포 `16 / 462 / 26 / 3`, Item relation 누락 1개
- `Daily Log`의 Outfit 기록 783개, 날짜·Outfit relation 누락 0
- `Replacement Line` 53개, Item relation 누락 1개, Style Identity 누락 1개

전체 snapshot·dry-run 검증 결과:

- 차단 오류 0개, custom emoji 미매핑 0개, 잘못된 HEX 0개
- 색상 22개, Item 451개, Outfit 507개, Outfit–Item 관계 2,401개
- Place 25개, Transport 4개, Wear Log 783개
- Replacement Line 53개, Replacement Line–Item 관계 165개
- `000…0003`의 대상 테이블은 시험 이전 직전 모두 0행

Supabase 시험 이전 결과:

- import run `passed`, 완료 시각 기록 정상
- dry-run과 원격의 9개 데이터·관계 수량이 모두 일치
- Outfit–Item, Wear Log–Outfit, Replacement Line–Item 고아 관계 0개
- 원본 경고 수량도 동일: 색상 아이콘 없음 3개, Item 없는 Outfit 1개, 출발 온도 없음 154개, Item 없는 Replacement Line 1개, Style Identity 없음 1개

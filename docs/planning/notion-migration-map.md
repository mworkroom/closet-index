# Closet Index Notion Migration Map

- 조사일: 2026-07-26
- 상태: 원본 구조 조사 완료, 전체 API snapshot·HEX 확정·Supabase 적용 대기
- 원칙: Notion 읽기 → 로컬 snapshot → dry-run 검증 → 명시적 Supabase 적용

## 1. 원본

| 원본 | Notion | Data source | 조사 규모 |
|---|---|---|---:|
| Wardobe | [원본 열기](https://app.notion.com/p/349f66af29b2808caa19d4153bc0c756) | `349f66af-29b2-801a-bdd3-000b14390931` | 451 |
| Outfits | [원본 열기](https://app.notion.com/p/349f66af29b280f4a490fa5278cfba79) | `349f66af-29b2-80a6-82d1-000b2dc56ca6` | 507 |
| Daily Log | [원본 열기](https://app.notion.com/p/60a2155c1def4a08bd32b5c581cd7213) | `327010b4-b582-4f08-abb2-440ea77fbcab` | 전체 3,714 / Outfit 783 |
| Replacement Line | [원본 열기](https://app.notion.com/p/35ef66af29b2808bae07f46972c58ca3) | `35ef66af-29b2-802b-9a9c-000b03f7a7bd` | 53 |

API 추출기는 Notion API `2026-03-11`의 Data source query를 사용한다. relation이 한 페이지 응답의 25개 제한을 넘으면 Page property endpoint로 나머지를 가져온다.

## 2. 조사 결과

### Wardobe

- 전체 451
- Retired 87
- 이름 누락 0
- 카테고리 누락 0
- 색상 단서 누락 1
- 색상 단서 누락 항목: `Scarf No 1`

### Outfits

- 전체 507
- `Favorite` 16
- `OK` 462
- `Error` 26
- Rating 미입력 3
- Item relation 누락 1

Rating은 서로 배타적인 값으로 그대로 이전한다.

### Daily Log

- 전체 3,714 중 `Category = Outfits` 783개만 이전
- Outfit relation 누락 0
- `End` 누락 0
- `Temp Out` 누락 154
- `Temp Back` 누락이면서 `Temp Out` 존재 503
- 온도 범위 `-11..35°C`
- 소수 온도 0
- thermal feeling: `추움`, `OK`, `더움`
- 교통수단: `차`, `도보`, `버스`, `지하철`
- 장소 선택지 25개

착용일은 `End`를 사용한다. `Temp Out`이 없으면 착용 횟수에는 포함하지만 온도 추천 관측에서는 제외한다.

### Replacement Line

- 전체 53
- Item relation 누락 1
- Style Identity 누락 1
- 이름 누락 0

Phase 1에서는 relation만 보존하고 UI에 노출하지 않는다.

## 3. 필드 매핑

실제 Notion property 이름은 `scripts/notion-source.json`에서 조정할 수 있다. 기본값은 `scripts/notion-source.example.json`에 있다.

### Wardobe → Items

| Notion | Snapshot | Supabase | 변환 |
|---|---|---|---|
| Page ID | `notionPageId` | `id`, `notion_page_id` | 같은 UUID 사용 |
| Name | `name` | `name` | 필수 |
| Category | `category` | `category` | 필수 |
| Colors | `semanticColor` | `semantic_color` | 넓은 검색 분류 |
| Page custom emoji | `notionIconId` | `palette_id` relation | 아이콘 ID로 HEX 표 연결 |
| Seasons | `seasons` | `seasons` | text array |
| Retired | `retired` | `retired` | boolean |
| Memo | `memo` | `memo` | nullable |
| Acquired Date formula | `acquiredOn` | `acquired_on` | 구매일 또는 Knitting Projects 완성일을 계산한 nullable date |
| Page created time | `notionCreatedAt` | `notion_created_at` | 원본 추적 |

### Outfits → Outfits / Outfit Items

| Notion | Supabase | 변환 |
|---|---|---|
| Page ID | `outfits.id`, `notion_page_id` | 같은 UUID 사용 |
| Name | `display_name` | 중복 허용, 공백 허용 |
| Rating | `rating` | `Favorite → favorite`, `OK → ok`, `Error → error` |
| All Items relation | `outfit_items` | relation 순서를 `sort_order`로 저장 |
| Created time | `notion_created_at` | 원본 추적 |

Item relation이 비어 있는 1개 Outfit은 데이터 손상 상태를 보존하고 기본 Lookbook·추천에서 제외한다.

### Daily Log → Wear Logs

| Notion | Supabase | 변환 |
|---|---|---|
| Page ID | `id`, `notion_page_id` | 같은 UUID 사용 |
| Category | 필터 | `Outfits`만 포함 |
| End | `worn_on` | KST 착용 날짜 |
| 👚 Outfits relation | `outfit_id` | UUID relation |
| Temp Out | `temp_out` | 정수, 공백 유지 |
| Temp Back | `temp_back` | 공백이고 Temp Out 존재 시 같은 값 |
| Temp Back 공백 여부 | `temp_back_inferred` | 위 변환 시 `true` |
| Feeling Out | `feeling_out` | `추움→cold`, `OK→ok`, `더움→hot` |
| Feeling Back | `feeling_back` | 같은 변환 |
| Place | `place_id` | 이름별 안정 UUID를 만들어 relation |
| Transportation | `transport_mode_id` | 이름별 안정 UUID를 만들어 relation |
| Memo | `memo` | nullable |
| — | `temperature_source` | `notion` |
| Page ID 파생값 | `submission_token` | 재실행에도 같은 안정 UUID |

`날짜 + Outfit`은 고유값이 아니다. 같은 날짜·같은 Outfit 기록은 각각 원본 Page ID를 유지한다.

### Replacement Line

| Notion | Supabase |
|---|---|
| Page ID | `replacement_lines.id`, `notion_page_id` |
| Name | `name` |
| Style Identity | `style_identity` |
| Items relation | `replacement_line_items` |

## 4. 색상 커스텀 아이콘

추출 snapshot은 각 아이콘의 다음 값을 보존한다.

- custom emoji ID
- Notion 표시 이름
- 검증 당시 source URL

source URL은 런타임에 사용하지 않는다. `scripts/color-map.json`에 다음을 확정한 뒤 가져온다.

```json
{
  "custom-emoji-id": {
    "displayName": "Purple 01",
    "displayHex": "#6E347D",
    "semanticColor": "Purple"
  }
}
```

- 모든 사용 중인 custom emoji ID에 매핑이 있어야 실제 import가 열린다.
- `Scarf No 1`처럼 아이콘이 없는 항목은 중립 fallback을 사용하고 unresolved report에 남긴다.
- HEX는 `#RRGGBB` 형식만 허용한다.

## 5. 도구

### 5.1 원본 추출

```powershell
Copy-Item scripts/notion-source.example.json scripts/notion-source.json
$env:NOTION_API_KEY = "..."
npm run notion:extract
```

출력: `data/notion-snapshot.json`

snapshot은 개인 데이터와 만료 가능한 Notion URL을 포함하므로 Git에서 제외한다.

### 5.2 Supabase dry-run 이력

초기 migration 당시에는 local-only color map과 workspace ID를 사용한 dry-run으로 아래 적용 차단 항목을 검사했다.

- Item 이름·카테고리 누락
- 끊어진 Outfit–Item relation
- Wear Log 날짜·Outfit relation 누락
- 존재하지 않는 Outfit을 가리키는 Wear Log
- 매핑되지 않은 custom emoji
- 잘못된 HEX

온도 누락, Item relation 없는 Outfit 1개, Replacement Line 일부 누락은 삭제하거나 추정하지 않고 warning으로 보존한다.

### 5.3 실제 적용 이력

Notion → Supabase 일회성 migration은 2026-07-26에 project-locked URL, local-only secret key, stable UUID upsert로 완료했다. 당시 도구는 기존 행을 자동 삭제하지 않았고 relation 제거도 자동 반영하지 않았다.

2026-08-25 기준 production 데이터가 snapshot 이후 증가했으므로 stable-ID upsert 재실행은 과거 값 덮어쓰기 위험이 있다. 이에 `notion:import` package command와 `scripts/import-supabase.mjs`를 제거했으며, 이 문서의 절차는 실행 가능한 운영 runbook이 아니라 migration 이력으로만 보존한다. secret/service-role key는 브라우저 번들·Git·문서에 저장하지 않는다.

## 6. 개발 중 추가 기록과 최종 전환

```text
Notion을 실제 기록 원본으로 유지
→ 초기 snapshot과 Supabase 시험 이전
→ Technical Alpha의 Supabase Wear Log는 테스트 데이터
→ 전환 직전 Notion 추가분을 J가 수동 이전
→ 원본·Supabase 수량과 relation 대조
→ 전환 시점 선언
→ 이후 Supabase만 쓰기
→ Notion 읽기 전용 보관
```

수동 추가분도 기존 Notion Page ID를 UUID로 사용하거나, 앱에서 새 UUID로 입력한 경우 대응표를 남긴다. 같은 날짜·같은 Outfit이라는 이유로 기록을 합치지 않는다.

## 7. 적용 전 필수 대조

- Items 451, Retired 87
- Outfits 507, Rating 분포 `16 / 462 / 26 / 3`
- Wear Logs 783
- Replacement Lines 53
- Outfit relation 누락 1개가 report에 유지됨
- Wear Log Outfit relation 누락 0
- Temp Out 누락 154
- Temp Back 추론 503
- 모든 Notion Page ID가 Supabase `notion_page_id`에서 한 번만 등장
- Outfit·Item·Wear Log 통계가 원본 relation 기준과 일치
- 색상 아이콘 ID별 HEX 대응표 검토 완료

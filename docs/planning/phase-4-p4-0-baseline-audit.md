# Phase 4 P4-0 Baseline Audit

- 감사일: 2026-08-03 KST
- 범위: production Supabase, 읽기 전용 Notion 보관본
- 쓰기 여부: production 0건, Notion 0건
- 기준 문서: [Phase 4 Statistics & Replacement Lineage Plan](./phase-4-maintenance-insights-plan.md)

## 감사 방법

Notion 원본은 임시 경로에 추출하고, Supabase는 workspace 범위를 고정한 `select`만 사용한다. 생성된 스냅샷과 감사 JSON은 Git에 추가하지 않는다.

```powershell
npm.cmd run notion:extract -- --output <temporary-notion-snapshot.json>
npm.cmd run audit:phase4 -- --notion-snapshot <temporary-notion-snapshot.json> --output <temporary-audit.json>
node --test scripts/phase4-baseline-audit-core.node.mjs
```

감사 스크립트는 지정된 production project ref와 workspace만 허용하며, Notion `Replaces` self-relation을 양쪽 entry에서 하나의 정렬된 무방향 pair로 접는다. 취득일이나 Retired 상태로 방향을 추정하거나 directed edge를 만들지 않는다.

## 원격 기준선

| 대상 | Production | Notion 보관본 | 판정 |
|---|---:|---:|---|
| Item | 451 | 451 | 일치 |
| Outfit | 508 | 507 | 알려진 컷오버 이후 차이 |
| Wear Log | 783 | 783 | 총합 일치, 출처 구성은 다름 |
| 취득일 있음 / 미상 | 442 / 9 | 442 / 9 | 일치 |
| Replacement Line | 53 | 53 | 일치 |
| Line membership | 165 | 165 | 일치 |
| Line 고유 Item | 163 | 163 | 일치 |

Production Outfit 508개는 Notion 연동 505개와 앱 생성 3개로 구성된다. Notion Outfit 507개 가운데 production에 없는 것은 2개다. 하나는 Item이 없는 빈 Outfit이고 Wear Log도 없으며, 다른 하나는 Item 4개와 Wear Log 1개가 연결된 레거시 Outfit이다. 앱 생성 Outfit 3개는 2026-07-31 생성, Active, Item 4~5개, Wear Log 0개이며 누락된 Notion Outfit과 동일 Item 조합이 아니다.

Production Wear Log 783개는 Notion 연동 782개와 앱 생성 1개로 구성된다. Notion 보관본에는 production에 없는 2026-04-17 Log 1개가 있고, production에는 2026-07-30 앱 생성 Log 1개가 있어 총합만 같다. 이 차이는 삭제하거나 보정하지 않고 독립 원본 전환 이후의 알려진 기준선으로 기록한다.

## Replacement Line 품질 상태

| 항목 | 결과 |
|---|---:|
| 빈 Line | 1 |
| 단일 Item Line | 10 |
| 복수 Item Line | 42 |
| 복수 Line 소속 Item | 2 |
| Style Identity 미상 Line | 1 |
| 고아 membership | 0 |
| `Replaces` relation entry | 98 |
| reciprocal pair | 49 |
| 비대칭 entry | 0 |
| self-link | 0 |
| 깨진 Item 참조 | 0 |
| 공통 Line이 없는 pair | 0 |

98개 entry는 49개 reciprocal pair로 정확히 접힌다. 49개 pair 모두 두 Item이 최소 하나의 Replacement Line을 공유한다.

## Notion Formula와 View 결정

Notion API 2026-03-11로 Replacement Line data source의 property schema와 View를 읽었다. 확인된 View는 `View All`, `Outer`, `Top`, `Bottom`, `Bags`, `Shoes`, `멸종 관리` 7개다.

| 기존 개념 | Phase 4 결정 | 이유 |
|---|---|---|
| Name, Items, Category, Acquired Date, Style Identity | 유지 | Line 식별, membership, 그룹, 취득일 참고 정보의 직접 원본이다. |
| Outer, Top, Bottom, Bags, Shoes View | 재설계 | 별도 Notion View를 복제하지 않고 P4-2A의 category·Style Identity 필터와 그룹으로 제공한다. |
| Active Count | 개념 유지·계산 재설계 | 저장된 Rollup을 복사하지 않고 현재 Item `retired` 상태에서 직접 계산한다. |
| Newest Active Age | 재설계 | 경과 연수 Formula 대신 최근 Active Item의 정확한 취득일을 보여 준다. |
| `Replaces` self-relation | 유지 후 사람 검토 | 49개 무방향 Legacy Link로 보존하고 방향은 P4-2B에서만 확인한다. |
| Risk Threshold | Phase 6로 보류 | category별 1~5년 임계값은 재구매·교체 주기 범위이며 Phase 4에서 임의 경고를 만들지 않는다. |
| `멸종 관리` Formula와 View | Phase 6로 보류 | Active 0개 또는 age threshold 기반 경고는 현재 Phase 4 경계 밖이다. |

## 완료 판정

- P4-0의 수량과 품질 상태를 production·Notion에서 재확인했다.
- Notion과 production이 독립 원본이 된 이후의 Outfit·Wear Log 차이를 숨기지 않고 출처별 기준으로 고정했다.
- 98개 reciprocal entry를 49개 무방향 pair로 재현하는 테스트와 실행 스크립트를 추가했다.
- Formula·View의 유지, 재설계, 보류 경계를 기록했다.
- production과 Notion에는 쓰기를 수행하지 않았고 directed edge도 생성하지 않았다.

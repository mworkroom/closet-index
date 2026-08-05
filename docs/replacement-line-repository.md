# Replacement Line Repository 구조

## 목적과 비변경 경계

이 문서는 2026-08-05 B안 리팩터링 이후의 frontend source of truth를 설명한다. 목표는 Replacement Line 변경 시 여러 façade와 page를 함께 수정하던 비용을 줄이는 것이다.

이번 구조 변경으로 바꾸지 않은 계약은 다음과 같다.

- DB schema, migration과 기존 RPC의 이름·인자·반환형
- route, UI 문구와 사용자 동작
- Legacy review·edge confirmation subsystem
- Demo validation과 다섯 localStorage key·JSON 형식

`revise_closet_replacement_line_edge_details`는 DB RPC와 migration에 남아 있지만 현재 frontend public port, DataContext, Demo API와 Supabase adapter에는 노출하지 않는다.

## 현재 계층과 책임

```text
App
└─ ClosetRepository
   ├─ 일반 Closet data API
   └─ replacementLines: ReplacementLineRepository
      ├─ SupabaseReplacementLineRepository
      └─ DemoReplacementLineRepository

ReplacementLineagePage
└─ useReplacementLineage
   ├─ 세 조회 병렬 조정
   ├─ optimistic timestamp 입력 구성
   ├─ RPC 성공 결과를 snapshot·edge·start에 적용
   ├─ move·merge·delete 뒤 route 이동
   └─ 표현 컴포넌트에 view data와 intent callback 제공
```

- `ClosetRepository`: 앱의 repository 묶음이다. Replacement method를 복제하지 않고 필수 port 하나만 소유한다.
- `DataContext`: 일반 Closet data와 `replacementLines` port를 공급한다. Replacement method를 다시 감싸지 않는다.
- `ReplacementLineRepository`: Supabase와 Demo가 동일하게 구현해야 하는 기능 계약이다. DB 전용·frontend-unused RPC는 넣지 않는다.
- `useReplacementLineage`: 단순 pass-through가 아니다. load 상태, mutation 결과 적용과 navigation을 소유한다.
- 표현 컴포넌트: form 입력, 확인 단계, saving/error UI를 소유한다. repository와 DataContext를 직접 알지 않는다.

## 현재 public API 예시

```ts
export interface ClosetRepository {
  load(): Promise<AppData>
  readonly replacementLines: ReplacementLineRepository
  // Item, Outfit, Weather, Wear Log API
}

interface DataContextValue {
  data: AppData | null
  loading: boolean
  error: string | null
  refresh(): Promise<void>
  readonly replacementLines: ReplacementLineRepository
  // 일반 Closet mutation
}

export interface ReplacementLineRepository {
  load(): Promise<ReplacementLineSnapshot>
  loadEdges(): Promise<ReplacementLineEdge[]>
  loadStarts(): Promise<ReplacementLineStart[]>
  addItem(input: ReplacementLineItemAddInput): Promise<ReplacementLineRecord>
  removeItem(input: ReplacementLineItemRemoveInput): Promise<ReplacementLineRecord[]>
  // create, legacy review, edge, start, move, merge, lifecycle, metadata API
}
```

page는 port를 직접 호출하지 않고 hook이 만든 intent callback을 전달한다.

```tsx
const { lineId = '' } = useParams()
const { addItem, snapshot } = useReplacementLineage(lineId)

<LineManagementPanel
  line={line}
  lines={snapshot?.lines ?? []}
  onAddItem={addItem}
/>
```

hook의 addItem은 RPC 성공 전에는 state를 바꾸지 않는다.

```ts
const addItem = async (input: ReplacementLineItemAddInput) => {
  const savedLine = await replacementLines.addItem(input)
  setSnapshot((current) =>
    current ? applyAddedReplacementLineItem(current, input, savedLine) : current,
  )
  setStarts((current) => [
    ...(current?.filter((start) => start.itemId !== input.itemId) ?? []),
    {
      replacementLineId: savedLine.id,
      itemId: input.itemId,
      designatedAt: new Date().toISOString(),
    },
  ])
}
```

## mutation 경로

`addItem` 한 건의 경로는 다음과 같다.

1. `LineManagementPanel`이 form validation, saving 상태와 중복 submit 방지를 담당한다.
2. `useReplacementLineage.addItem`이 현재 Line의 `expectedUpdatedAt`을 포함한 input을 받는다.
3. `ReplacementLineRepository.addItem`이 환경별 adapter를 호출한다.
4. Supabase adapter는 `add_closet_replacement_line_item` RPC로 변환한다. Demo adapter는 같은 validation과 localStorage mutation을 수행한다.
5. RPC 성공 뒤 hook이 순수 helper로 snapshot membership과 Line row를 갱신하고 explicit start를 맞춘다.
6. 실패나 timestamp 충돌이면 화면 state는 적용하지 않고 기존 form의 오류 표시로 되돌린다.

## Demo 선택과 현재 역할

Demo는 `src/lib/supabase.ts`에서 `VITE_DEMO_MODE === 'true'`, Supabase URL 누락 또는 publishable key 누락 중 하나일 때 선택된다. `AuthContext`가 `demo` mode를 만들고 `App.tsx`가 `new DemoRepository()`를 DataProvider에 전달한다.

현재 Demo의 목적은 local 실행과 UI 회귀 검증을 위한 실제 fallback이다. 이번 리팩터링에서는 유지하되 Replacement 구현을 `src/data/demo/replacement-lines.ts`로 격리했다. 향후 삭제하려면 모든 실행 환경에서 Supabase 설정을 필수화하고 Demo page test fixture와 다음 저장 데이터를 함께 제거해야 한다.

- `closet-index-demo-data-v3`
- `closet-index-demo-legacy-link-reviews:v1`
- `closet-index-demo-lineage-edges:v1`
- `closet-index-demo-lineage-starts:v1`
- `closet-index-demo-replacement-lines:v1`

## Replacement 관련 DB RPC 20개

테스트 표기의 `adapter`는 `src/data/supabase/replacement-lines.test.ts`, `demo`는 `src/data/demo-repository.test.ts`, `lineage`는 `src/pages/ReplacementLineagePage.test.tsx`를 뜻한다. pgTAP 파일은 이름을 줄여 표시했다.

| RPC 이름 | Supabase adapter caller | 현재 production UI caller | Demo 대응 method | 관련 테스트 | 상태 |
|---|---|---|---|---|---|
| `create_closet_replacement_line` | `create` | `ReplacementLinesPage` 새 Line | `create` | adapter, demo, Lines page, `replacement_line_creation_contract_test.sql` | active |
| `set_closet_replacement_line_color_category` | `setColorCategory` | `LineManagementPanel` 색상 | `setColorCategory` | adapter, demo, lineage, `replacement_line_color_category_contract_test.sql` | active |
| `acknowledge_closet_replacement_line_review` | `acknowledgeReview` | `LineReviewAlert` | `acknowledgeReview` | adapter, demo, lineage, `replacement_line_management_contract_test.sql` | active |
| `update_closet_replacement_line_details` | `updateDetails` | `LineManagementPanel` 정보 수정 | `updateDetails` | adapter, demo, lineage, `replacement_line_management_contract_test.sql` | active |
| `delete_empty_closet_replacement_line` | `deleteEmpty` | `LineManagementPanel` 빈 Line 삭제 | `deleteEmpty` | adapter, demo, lineage, `replacement_line_management_contract_test.sql` | active |
| `update_closet_replacement_line_edge_connection` | `updateEdgeConnection` | `LineageGeneration` 연결 수정 | `updateEdgeConnection` | adapter, demo, lineage | active |
| `disconnect_closet_replacement_line_edge` | `disconnectEdge` | `LineageGeneration` 연결 해제 | `disconnectEdge` | adapter, demo, lineage | active |
| `reverse_closet_replacement_line_edge` | `reverseEdge` | `LineageGeneration` 방향 변경 | `reverseEdge` | adapter, demo, lineage | active |
| `set_closet_replacement_line_start` | `setStart` | `LineageGeneration`, `UnconnectedLineageItem` | `setStart` | adapter, demo, lineage | active |
| `create_closet_replacement_manual_edge` | `createManualEdge` | `UnconnectedLineageItem` | `createManualEdge` | adapter, demo, lineage | active |
| `move_closet_replacement_line_item` | `moveItem` | `UnconnectedLineageItem` | `moveItem` | adapter, demo, lineage, `replacement_line_item_membership_contract_test.sql` | active |
| `add_closet_replacement_line_item` | `addItem` | `LineManagementPanel` Item 추가 | `addItem` | adapter, demo, lineage, `replacement_line_item_membership_contract_test.sql` | active |
| `remove_closet_replacement_line_item` | `removeItem` | 계보 Item의 Line에서 빼기 | `removeItem` | adapter, demo, lineage, `replacement_line_item_membership_contract_test.sql` | active |
| `merge_closet_replacement_lines` | `mergeLines` | `LineManagementPanel` 병합 | `mergeLines` | adapter, demo, lineage | active |
| `set_closet_replacement_line_archived` | `setArchived` | `LineManagementPanel` 보관·복원 | `setArchived` | adapter, demo, lineage | active |
| `revise_closet_replacement_legacy_link` | `reviewLegacyLink` | `ReplacementLegacyLinkReviewPage`; reverse RPC 내부 간접 | `reviewLegacyLink` | adapter, demo, Legacy page, `phase4_legacy_link_revision_contract_test.sql` | legacy-active |
| `confirm_closet_replacement_line_edges` | `confirmEdges` | `ReplacementLineageEdgePreviewPage` batch 확정 | `confirmEdges` | adapter, demo, Edge preview page, `phase4_replacement_line_edge_contract_test.sql` | legacy-active |
| `revise_closet_replacement_line_edge_details` | 없음 | 없음 | 없음 | migration 보존; 전용 frontend test 없음 | frontend-unused |
| `confirm_closet_replacement_line_edge` | 없음; bulk RPC 내부 helper | 없음 | 없음 | `phase4_replacement_line_edge_contract_test.sql` | reserved |
| `review_closet_replacement_legacy_link` | 없음; revise wrapper | 없음 | 없음 | `phase4_legacy_link_review_contract_test.sql` | deletion-candidate |

## 테스트 gate

- 기존 Replacement frontend 기준선: 12개 파일·63개 테스트
- Phase 1 characterization 추가: RPC 실패, optimistic timestamp 충돌, 동일 add action 중복 실행
- Phase 3 helper 추가 뒤 Replacement gate: 13개 파일·69개 테스트
- 최종 전체 frontend gate: 59개 파일·280개 테스트, TypeScript, production build
- 로컬 pgTAP: Docker 실행 파일이 없어 이번 frontend gate에서 제외했다. DB migration·RPC·SQL 파일은 변경하지 않았다.
- baseline DB gate: commit `4514fe8`의 GitHub Actions run `30967739713`에서 workflow 지정 5개 pgTAP 파일·92개 test가 통과했다.

## 실제 변경 파일 수

baseline `4514fe8`부터 Phase 4까지 중복을 제거한 실제 frontend 변경 파일은 24개다. DB 변경 파일은 0개다. 최종 문서 변경은 devlog, `database-map.md`, 이 문서 3개다.

새 RPC가 필요한 별도 기능을 추가한다면 이 리팩터링과 무관하게 최소한 다음 DB 파일을 별도로 계산한다.

1. RPC 생성 migration 1개
2. signature, 권한, authorization, concurrency를 고정하는 SQL contract test 1개

그 뒤 실제 caller가 필요할 때만 adapter, port, Demo, hook과 frontend test 파일 수를 별도로 더한다. DB RPC 추가를 frontend 파일 수에 섞어 보고하지 않는다.

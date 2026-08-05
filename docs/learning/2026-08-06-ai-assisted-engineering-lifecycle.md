# Learning Log — AI가 싸게 만들어 주는 시대의 구조 관리

- 작성일: 2026-08-06
- 계기: Closet Index Replacement Line 구현과 Supabase 구조 점검
- 범위: 특정 구현 세부사항보다, AI와 함께 앱을 만들 때 복잡성을 통제하는 방법

## 1. 시작점

Replacement Line은 처음부터 단순한 기능은 아니었다. 같은 역할의 옷이 시간에 따라 어떻게 교체됐는지 보여주려면 Line membership, 이전 Item과 후속 Item의 관계, 시작점, 분기와 합류를 다뤄야 했다.

그런데 실제 구현은 예상보다 훨씬 커졌다. 기능 자체의 복잡성 외에도 다음이 함께 만들어졌기 때문이다.

- Notion 원본을 분석하고 자동으로 옮기는 importer
- 방향이 없는 과거 관계를 검토하는 queue
- 판단을 다시 수정할 수 있는 revision history
- 검토 결과를 directed edge로 변환하는 단계
- Demo localStorage와 Supabase에 같은 write 기능을 각각 구현하는 구조
- 기능마다 추가되는 RPC, validation, test와 문서

처음에는 이를 모두 “Replacement Line 구현”이라고 묶어 생각했다. 이번 점검을 통해 실제로는 **현재 제품 기능, 일회성 migration 도구, 과거 판단 보존 시스템, 범용 graph editor가 한꺼번에 성장한 것**임을 알게 됐다.

## 2. 가장 큰 깨달음

> AI가 구현 비용을 낮춰 주면, 무엇을 만들지보다 무엇을 만들지 않을지를 더 명확히 결정해야 한다.

Codex는 사람이 귀찮아서 생략했을 importer, review UI, revision table, rollback fixture와 범용 validation을 빠르게 만들 수 있다. 각각은 합리적으로 보이고 안전성도 높여 준다.

문제는 **한 번 만드는 비용이 싸다는 사실과 계속 보유하는 비용이 싸다는 사실은 다르다**는 점이다.

작은 table 몇 개가 사용하는 저장공간은 거의 문제가 되지 않는다. 더 큰 비용은 다음과 같다.

- 어느 table이 현재 source of truth인지 기억해야 함
- 어떤 RPC가 아직 실제 UI에서 호출되는지 확인해야 함
- 폐기한 기능이 frontend, backend, trigger와 Storage 중 어디까지 남았는지 추적해야 함
- 새 기능을 추가할 때 과거의 임시 구조까지 함께 고려해야 함
- 나중에 SQL을 공부해도 구조의 역사부터 발굴해야 함

즉 이 프로젝트에서 중요한 자원은 Database MB가 아니라 **인지 가능한 구조의 크기**다.

## 3. 처음부터 정했어야 했던 것

기능 요구사항만 정하면 충분하지 않았다. 임시 구조와 데이터의 lifecycle도 함께 정했어야 했다.

예를 들어 Notion 관계를 가져오는 작업을 시작할 때 다음을 먼저 결정할 수 있었다.

- 데이터가 적으므로 수동 입력할 것인가
- importer는 일회성 script인가, 영구 제품 기능인가
- 검토가 끝난 Legacy Link를 production에 유지할 것인가
- 판단 이력이 앱 기능에 정말 필요한가
- Demo mode가 production write 기능과 완전히 동일해야 하는가
- 작업 종료 후 제거할 table, route, RPC는 무엇인가

이 질문이 없으면 AI는 대체로 손실 가능성을 피하기 위해 보존하는 방향을 선택한다. 그 결과 임시 장비가 제품 구조에 영구적으로 편입될 수 있다.

앞으로는 새 구조를 만들 때 다음 두 항목을 기능 정의와 같은 수준으로 기록한다.

1. **존재 이유:** 왜 기존 구조로 해결할 수 없는가
2. **종료 조건:** 언제 제거하거나 핵심 구조로 승격하는가

## 4. Audit, Cleanup, Refactoring, Redesign 구분

이번 세션에서 비슷해 보이던 작업의 차이를 정리했다.

### Audit

현재 상태를 증거로 조사하는 일이다.

- 무엇이 존재하는가
- 실제로 어디에서 읽고 쓰는가
- 어떤 dependency가 있는가
- Git과 production이 일치하는가
- source of truth는 무엇인가

Audit 단계에서는 원칙적으로 동작과 데이터를 변경하지 않는다.

### Cleanup

Audit에서 불필요하다고 판정한 것을 실제로 제거하는 일이다.

- dormant UI와 backend 제거
- 일회성 importer와 staging table 제거
- 사용하지 않는 RPC, trigger와 column 제거
- 필요한 과거 데이터는 export한 뒤 live schema에서 제거

과거 migration 파일은 역사로 유지하되, 현재 사용하지 않는 live database object까지 영구 보존할 필요는 없다.

### Refactoring

현재 동작은 유지하면서 내부 구조를 변경하기 쉽게 만드는 일이다.

- 반복 validation 통합
- 단순 전달만 하는 layer 축소
- 지나치게 큰 page의 책임 분리
- Demo와 production 구현 중복 축소

Refactoring의 성공 기준은 파일 수나 추상화 개수가 아니다. **다음 변경에 필요한 파일 수와 이해해야 할 상태가 실제로 줄었는가**다.

### Redesign

제품 동작이나 data model 자체를 다시 정하는 일이다.

예를 들어 범용 DAG 대신 실제 필요한 단순 계보만 지원하기로 바꾸는 것은 refactoring이 아니라 redesign이다.

이 네 작업을 한 commit이나 한 plan에 섞으면 무엇이 왜 바뀌었는지 확인하기 어려워진다.

## 5. Codex와 웹 ChatGPT의 역할 분리

두 AI를 자동으로 대화시키는 기술보다 먼저, 서로 다른 역할을 주는 방식이 유용하다.

### Codex: 현장 조사원과 작업자

- repository 전체 검색
- production schema와 migration history 확인
- code reference와 dependency 수집
- test와 build 실행
- 승인된 변경 구현

### 웹 ChatGPT: 외부 검토자

- Codex의 보존 편향과 과잉 일반화 점검
- 개인용 앱에 비해 구조가 지나치게 범용적인지 판단
- cleanup 또는 refactoring plan의 불필요한 단계를 줄임
- 구현 결과가 사용 목적과 맞는지 검토

### J: 결정권자

AI 사이의 모든 대화를 전달하는 사람이 아니라, 증거를 보고 정책을 확정하는 역할이다.

```text
Codex → Evidence
웹 ChatGPT → Critique
J → Decision
Codex → Plan
웹 ChatGPT → Review
Codex → Implementation
웹 ChatGPT → Final Audit
```

핵심은 AI끼리 의견을 많이 주고받게 하는 것이 아니라, **한 AI가 만든 결과를 다른 AI가 독립적으로 검증하게 하는 것**이다.

## 6. 대화 대신 공유해야 할 문서

긴 채팅 전체를 relay하지 않고 다음 문서를 공용 기억으로 사용한다.

### `database-map.md`

계속 갱신되는 현재 지도다.

- table과 RPC의 역할
- source of truth 여부
- 읽고 쓰는 코드
- dependency
- lifecycle 상태

### 날짜가 있는 Audit 문서

특정 시점의 증거를 보존한다.

- row count와 size
- migration drift
- 발견된 unused 후보
- 조사 query와 근거

현재 상태가 변해도 과거 audit 결과는 수정하지 않는다.

### Cleanup 또는 Refactoring Plan

실제 변경 순서와 검증 기준을 기록한다.

- 변경 대상
- 선행 조건
- 위험
- rollback
- 완료 조건

### Decision Log

왜 유지하거나 제거하기로 했는지 기록한다. 이 문서가 없으면 다음 AI가 안전을 이유로 폐기한 구조를 다시 살릴 수 있다.

## 7. 앞으로 사용할 작업 방식

### 새 기능 전

1. 수동 처리가 충분한 일회성 데이터인지 먼저 판단한다.
2. 새 table, column, RPC가 필요한 이유를 설명하게 한다.
3. 현재 기능과 임시 migration 도구를 분리한다.
4. 임시 object에는 제거 조건을 기록한다.
5. Demo parity가 실제 필요한지 결정한다.

### Audit

1. read-only로 production과 code를 조사한다.
2. 추측이 아니라 code reference, FK, trigger와 row count를 근거로 남긴다.
3. 현재 핵심, 보조, dormant, legacy 후보로 분류한다.
4. 외부 검토를 거쳐 cleanup 대상을 결정한다.

### Refactoring

1. “코드를 개선한다”가 아니라 줄이고 싶은 변경 비용을 정의한다.
2. 현재 동작을 test로 고정한다.
3. 최소·중간·대규모 대안을 비교한다.
4. 새 abstraction이 실제 변경 지점을 줄이는지 확인한다.
5. 동작 변경, cleanup과 refactoring을 분리한다.

### Cleanup

1. dependency를 확인한다.
2. 필요한 데이터만 export한다.
3. frontend와 backend 사용 경로를 제거한다.
4. cleanup migration으로 live object를 제거한다.
5. test, build, Advisor와 production count를 검증한다.

## 8. Closet Index에 바로 적용할 순서

1. production migration history와 Git repository를 먼저 일치시킨다.
2. Database Map과 COMMENT를 추가해 현재 구조에 이름표를 붙인다.
3. core, dormant, legacy cleanup candidate를 분류한다.
4. 일회성 import 기록처럼 dependency가 작은 것부터 제거한다.
5. Outfit Preview처럼 휴면 subsystem은 유지 여부를 명시적으로 결정한다.
6. Legacy Link는 현행 edge를 독립시킨 뒤 과거 검토 subsystem을 제거할지 결정한다.
7. Cleanup이 끝난 뒤 Replacement Line의 변경 비용을 줄이는 refactoring을 별도 작업으로 진행한다.

Cleanup과 refactoring을 동시에 시작하지 않는다. 먼저 현재 기능에 불필요한 구조를 줄인 다음, 남은 핵심 구조를 더 이해하기 쉽게 정리한다.

## 9. 프로젝트 운영 원칙

- 일회성 import를 자동으로 영구 제품 기능으로 만들지 않는다.
- 사용자가 수동 입력을 선택하면 importer와 review subsystem을 추가하지 않는다.
- UI에서 폐기한 기능의 backend를 자동으로 보존하지 않는다.
- 새 table과 RPC에는 역할과 lifecycle을 기록한다.
- 임시 object에는 제거 날짜가 아니라 제거 조건을 둔다.
- 적용된 migration 파일과 현재 live schema를 구분한다.
- 삭제 요청을 archive나 dormant 상태로 임의 변경하지 않는다.
- 범용 확장성보다 현재 개인 앱의 명확성을 우선한다.
- Refactoring은 미래 변경 범위가 줄어드는지로 평가한다.
- 문서가 AI 사이의 공용 기억이 되게 하고, 채팅 전체를 기억 장치로 사용하지 않는다.

## 10. 최종 정리

이번 문제는 Replacement Line을 잘못 만든 단일 실수라기보다, AI-assisted development에서 새로 배워야 할 운영 문제였다.

과거에는 구현이 비싸서 필요 없는 구조가 자연스럽게 생략됐다. 지금은 AI가 안전하고 범용적인 구조를 빠르게 만들 수 있기 때문에, 개발자가 명시적으로 범위를 제한하지 않으면 복잡성이 조용히 축적된다.

따라서 앞으로의 핵심 능력은 코드를 직접 많이 쓰는 것이 아니라 다음에 가깝다.

> 현재 상태를 audit하고, 무엇을 유지할지 결정하고, 임시 구조의 lifecycle을 끝내며, 한 AI의 구현을 다른 AI로 검증하는 능력.

이것이 이번 Replacement Line 작업에서 얻은 가장 큰 learning이다.

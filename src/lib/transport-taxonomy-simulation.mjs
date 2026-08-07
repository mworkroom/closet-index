import { calculateTransportThermalEvidence } from './transport-thermal-evidence.mjs'
import {
  evaluateTransportThermalPolicy,
  simulateTransportThermalPolicy,
} from './transport-thermal-policy.mjs'

export const TEST_TRANSPORT_BUCKETS = Object.freeze({
  walkShort: 'walk_short',
  walkSustained: 'walk_sustained',
  walkUnclassified: 'walk_unclassified',
  car: 'car',
  other: 'other',
})

function confirmedWalkBucket(value) {
  return value === TEST_TRANSPORT_BUCKETS.walkShort ||
    value === TEST_TRANSPORT_BUCKETS.walkSustained
    ? value
    : TEST_TRANSPORT_BUCKETS.walkUnclassified
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function baselineOrder(candidates) {
  return [...candidates].sort(
    (left, right) =>
      left.baselineOrder - right.baselineOrder || compareText(left.id, right.id),
  )
}

export function remapLogsToTestTransportTaxonomy(
  logs,
  {
    historicalWalkModeId,
    carModeId,
    walkClassificationByWearLogId = {},
  },
) {
  return logs.map((log) => {
    let transportModeId = null
    if (log.transportModeId === historicalWalkModeId) {
      transportModeId = confirmedWalkBucket(
        walkClassificationByWearLogId[log.id],
      )
    } else if (log.transportModeId === carModeId) {
      transportModeId = TEST_TRANSPORT_BUCKETS.car
    } else if (log.transportModeId !== null) {
      transportModeId = TEST_TRANSPORT_BUCKETS.other
    }
    return { ...log, transportModeId }
  })
}

function inferredReturnAffected(logs, input) {
  const baseline = calculateTransportThermalEvidence(logs, input)
  const observedOnly = calculateTransportThermalEvidence(logs, input, {
    includeInferredReturnObservations: false,
  })
  const baselineDecision = evaluateTransportThermalPolicy(
    'weak-1-strong-2',
    baseline,
    input,
  )
  const observedOnlyDecision = evaluateTransportThermalPolicy(
    'weak-1-strong-2',
    observedOnly,
    input,
  )
  return (
    baselineDecision.rankAdjustment !== observedOnlyDecision.rankAdjustment ||
    baseline.overall.expandedOkRange?.min !==
      observedOnly.overall.expandedOkRange?.min ||
    baseline.overall.expandedOkRange?.max !==
      observedOnly.overall.expandedOkRange?.max ||
    baseline.currentTransport?.expandedOkRange?.min !==
      observedOnly.currentTransport?.expandedOkRange?.min ||
    baseline.currentTransport?.expandedOkRange?.max !==
      observedOnly.currentTransport?.expandedOkRange?.max
  )
}

function evidenceDetails(candidate, evidence, decision, logs, input) {
  return {
    id: candidate.id,
    rankAdjustment: decision?.rankAdjustment ?? 0,
    directlyAdjusted: Boolean(decision?.affected),
    status: decision?.status ?? 'baseline-no-policy',
    confidence: decision?.confidence ?? 'not-evaluated',
    currentTransportDistinctWearLogCount:
      evidence.currentTransport?.distinctWearLogCount ?? 0,
    exactContextDistinctWearLogCount:
      evidence.exactContext?.distinctWearLogCount ?? 0,
    overallRange: evidence.overall.expandedOkRange,
    currentTransportRange:
      evidence.currentTransport?.expandedOkRange ?? null,
    borrowedOnly: evidence.overallSupportOnlyFromOtherTransport,
    inferredReturnAffected: inferredReturnAffected(logs, input),
    matchedWearLogIds: {
      overall: evidence.overall.matchedWearLogIds,
      currentTransport: evidence.currentTransport?.matchedWearLogIds ?? [],
      exactContext: evidence.exactContext?.matchedWearLogIds ?? [],
    },
  }
}

function modelReport(candidates, input, logsFor, policyEnabled) {
  const prepared = candidates.map((candidate) => {
    const logs = logsFor(candidate)
    const evidence = calculateTransportThermalEvidence(logs, {
      ...input,
      outfitId: candidate.id,
    })
    return { ...candidate, evidence, logs }
  })
  const ordered = policyEnabled
    ? simulateTransportThermalPolicy(
        'weak-1-strong-2',
        prepared.map(({ logs: _logs, ...candidate }) => candidate),
        input,
      )
    : baselineOrder(prepared)
  const preparedById = new Map(prepared.map((candidate) => [candidate.id, candidate]))
  const details = ordered.map((candidate) => {
    const preparedCandidate = preparedById.get(candidate.id)
    const decision = policyEnabled
      ? candidate.policyDecision
      : null
    return evidenceDetails(
      candidate,
      candidate.evidence,
      decision,
      preparedCandidate.logs,
      { ...input, outfitId: candidate.id },
    )
  })
  return {
    topSixOrder: ordered.slice(0, 6).map((candidate) => candidate.id),
    fullOrder: ordered.map((candidate) => candidate.id),
    directlyAdjustedOutfitCount: details.filter((entry) => entry.directlyAdjusted)
      .length,
    candidates: details,
  }
}

export function compareTransportTaxonomyModels({
  candidates,
  input,
  splitTransportModeId,
  historicalWalkModeId,
  carModeId,
  walkClassificationByWearLogId = {},
}) {
  const unsplitInput = { ...input }
  const splitInput = {
    ...input,
    transportModeId:
      input.transportModeId === null ? null : splitTransportModeId,
  }
  const rawLogsFor = (candidate) => candidate.logs
  const splitLogsFor = (candidate) =>
    remapLogsToTestTransportTaxonomy(candidate.logs, {
      historicalWalkModeId,
      carModeId,
      walkClassificationByWearLogId,
    })

  return {
    model0: modelReport(candidates, unsplitInput, rawLogsFor, false),
    model1: modelReport(candidates, unsplitInput, rawLogsFor, true),
    model2: modelReport(candidates, splitInput, splitLogsFor, true),
  }
}

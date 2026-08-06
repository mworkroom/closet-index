import {
  calculateTransportThermalEvidence,
  transportThermalObservations,
} from '../src/lib/transport-thermal-evidence.mjs'
import {
  evaluateTransportThermalPolicy,
  TRANSPORT_THERMAL_POLICIES,
} from '../src/lib/transport-thermal-policy.mjs'

const DEFAULT_THRESHOLDS = [1, 2, 3]

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function distinctLogs(logs) {
  const byId = new Map()
  for (const log of [...logs].sort((left, right) => compareText(left.id, right.id))) {
    if (log?.id && !byId.has(log.id)) byId.set(log.id, log)
  }
  return [...byId.values()]
}

function groupBy(values, keyFor) {
  const groups = new Map()
  for (const value of values) {
    const key = keyFor(value)
    const group = groups.get(key) ?? []
    group.push(value)
    groups.set(key, group)
  }
  return groups
}

function observationsFor(logs, includeInferredReturns = true) {
  const uniqueLogs = distinctLogs(logs)
  const outfitByWearLog = new Map(
    uniqueLogs.map((log) => [log.id, log.outfitId]),
  )
  return transportThermalObservations(uniqueLogs, {
    includeInferredReturnObservations: includeInferredReturns,
  }).map((observation) => ({
    ...observation,
    outfitId: outfitByWearLog.get(observation.wearLogId),
  }))
}

function maxTemperature(observations, feeling) {
  const values = observations
    .filter((entry) => entry.feeling === feeling)
    .map((entry) => entry.temperature)
  return values.length > 0 ? Math.max(...values) : null
}

function minTemperature(observations, feeling) {
  const values = observations
    .filter((entry) => entry.feeling === feeling)
    .map((entry) => entry.temperature)
  return values.length > 0 ? Math.min(...values) : null
}

function observationsConflict(left, right) {
  if (left.feeling === right.feeling) return false
  if (left.feeling === 'ok' || right.feeling === 'ok') return true
  return (
    (left.feeling === 'cold' && right.feeling === 'hot') ||
    (left.feeling === 'hot' && right.feeling === 'cold')
  )
}

function sharedSourcePlaces(current, sources) {
  const currentPlaces = new Set(
    current.map((entry) => entry.placeId).filter(Boolean),
  )
  return [
    ...new Set(
      sources
        .map((entry) => entry.placeId)
        .filter((placeId) => placeId && currentPlaces.has(placeId)),
    ),
  ].sort(compareText)
}

function markersFor(evidence, sourceObservations) {
  const exact = evidence.exactContext?.observations ?? []
  const directConflict = exact.some((current) =>
    sourceObservations.some(
      (source) =>
        Math.abs(current.temperature - source.temperature) <= 2 &&
        observationsConflict(current, source),
    ),
  )
  const markers = []
  if (directConflict) markers.push('direct conflict')
  if (sourceObservations.some((entry) => entry.inferredReturn)) {
    markers.push('affected by inferred return temperature')
  }
  if ((evidence.exactContext?.distinctWearLogCount ?? 0) < 2) {
    markers.push('insufficient current-context evidence')
  }
  if (!directConflict) markers.push('borrowed support without conflict')
  return markers
}

function ranges(evidence) {
  return {
    overall: evidence.overall.expandedOkRange,
    currentTransport: evidence.currentTransport?.expandedOkRange ?? null,
    currentPlace: evidence.currentPlace?.expandedOkRange ?? null,
    exactContext: evidence.exactContext?.expandedOkRange ?? null,
  }
}

function scopeCounts(evidence) {
  return {
    overall: evidence.overall.distinctWearLogCount,
    currentTransport: evidence.currentTransport?.distinctWearLogCount ?? 0,
    currentPlace: evidence.currentPlace?.distinctWearLogCount ?? 0,
    exactContext: evidence.exactContext?.distinctWearLogCount ?? 0,
  }
}

function privateObservation(entry, labels) {
  return {
    transport: labels.transport.get(entry.transportModeId) ?? '알 수 없음',
    wornOn: entry.wornOn,
    endpoint: entry.endpoint,
    temperature: entry.temperature,
    feeling: entry.feeling,
    tempBackInferred: entry.inferredReturn,
  }
}

function makeCase({
  kind,
  endpoint,
  outfitId,
  placeId,
  transportModeId,
  outfitLogs,
  sourceObservations,
  labels,
  includeInferredReturns,
}) {
  const evidence = calculateTransportThermalEvidence(
    outfitLogs,
    {
      outfitId,
      tempOut: endpoint,
      tempBack: null,
      placeId,
      transportModeId,
    },
    { includeInferredReturnObservations: includeInferredReturns },
  )
  const currentEndpointObservations =
    evidence.exactContext?.observations ?? []
  const otherTransportIds = [
    ...new Set(sourceObservations.map((entry) => entry.transportModeId)),
  ].filter(Boolean).sort(compareText)

  return {
    key: [outfitId, placeId, transportModeId, kind].join('\u0000'),
    kind,
    endpoint,
    currentTransportDistinctWearLogCount:
      evidence.currentTransport?.distinctWearLogCount ?? 0,
    evidence,
    sourceObservations,
    markers: markersFor(evidence, sourceObservations),
    private: {
      outfit: labels.outfit.get(outfitId) ?? '이름 없는 Outfit',
      place: labels.place.get(placeId) ?? '알 수 없는 Place',
      currentTransport:
        labels.transport.get(transportModeId) ?? '알 수 없는 Transport',
      otherTransport: otherTransportIds
        .map((id) => labels.transport.get(id) ?? '알 수 없음')
        .join(', '),
      wornOn: [
        ...new Set(sourceObservations.map((entry) => entry.wornOn)),
      ].sort((left, right) => right.localeCompare(left)),
      rawEndpointObservations: {
        current: currentEndpointObservations.map((entry) =>
          privateObservation(entry, labels),
        ),
        borrowed: sourceObservations.map((entry) =>
          privateObservation(entry, labels),
        ),
      },
      ranges: ranges(evidence),
      borrowedEndpoint: { kind, temperature: endpoint },
      distinctWearLogCounts: scopeCounts(evidence),
      markers: markersFor(evidence, sourceObservations),
    },
  }
}

function samePlaceCases(logs, labels, includeInferredReturns = true) {
  const observations = observationsFor(logs, includeInferredReturns)
  const logsByOutfit = groupBy(logs, (log) => log.outfitId)
  const pairs = groupBy(
    observations.filter((entry) => entry.transportModeId !== null),
    (entry) => `${entry.outfitId}\u0000${entry.transportModeId}`,
  )
  const cases = []

  for (const [pairKey, currentObservations] of pairs) {
    const [outfitId, transportModeId] = pairKey.split('\u0000')
    const outfitObservations = observations.filter(
      (entry) => entry.outfitId === outfitId,
    )
    const otherObservations = outfitObservations.filter(
      (entry) =>
        entry.transportModeId !== null &&
        entry.transportModeId !== transportModeId,
    )
    const nullObservations = outfitObservations.filter(
      (entry) => entry.transportModeId === null,
    )
    const outfitLogs = logsByOutfit.get(outfitId) ?? []
    const probes = []

    const overallOkMaximum = maxTemperature(outfitObservations, 'ok')
    const currentOkMaximum = maxTemperature(currentObservations, 'ok')
    if (overallOkMaximum !== null) {
      const sources = otherObservations.filter(
        (entry) =>
          entry.feeling === 'ok' && entry.temperature === overallOkMaximum,
      )
      const nullAtEndpoint = nullObservations.some(
        (entry) =>
          entry.feeling === 'ok' && entry.temperature === overallOkMaximum,
      )
      if (
        sources.length > 0 &&
        !nullAtEndpoint &&
        (currentOkMaximum === null || currentOkMaximum < overallOkMaximum)
      ) {
        probes.push({ kind: 'high', endpoint: overallOkMaximum, sources })
      }
    }

    const overallOkMinimum = minTemperature(outfitObservations, 'ok')
    const currentOkMinimum = minTemperature(currentObservations, 'ok')
    if (overallOkMinimum !== null) {
      const sources = otherObservations.filter(
        (entry) =>
          entry.feeling === 'ok' && entry.temperature === overallOkMinimum,
      )
      const nullAtEndpoint = nullObservations.some(
        (entry) =>
          entry.feeling === 'ok' && entry.temperature === overallOkMinimum,
      )
      if (
        sources.length > 0 &&
        !nullAtEndpoint &&
        (currentOkMinimum === null || currentOkMinimum > overallOkMinimum)
      ) {
        probes.push({ kind: 'low', endpoint: overallOkMinimum, sources })
      }
    }

    const currentColdBoundary = maxTemperature(currentObservations, 'cold')
    const otherColdBoundary = maxTemperature(otherObservations, 'cold')
    const nullColdBoundary = maxTemperature(nullObservations, 'cold')
    if (
      otherColdBoundary !== null &&
      (currentColdBoundary === null || otherColdBoundary > currentColdBoundary) &&
      (nullColdBoundary === null || nullColdBoundary < otherColdBoundary)
    ) {
      probes.push({
        kind: 'cold-warning',
        endpoint: otherColdBoundary,
        sources: otherObservations.filter(
          (entry) =>
            entry.feeling === 'cold' &&
            entry.temperature === otherColdBoundary,
        ),
      })
    }

    const currentHotBoundary = minTemperature(currentObservations, 'hot')
    const otherHotBoundary = minTemperature(otherObservations, 'hot')
    const nullHotBoundary = minTemperature(nullObservations, 'hot')
    if (
      otherHotBoundary !== null &&
      (currentHotBoundary === null || otherHotBoundary < currentHotBoundary) &&
      (nullHotBoundary === null || nullHotBoundary > otherHotBoundary)
    ) {
      probes.push({
        kind: 'hot-warning',
        endpoint: otherHotBoundary,
        sources: otherObservations.filter(
          (entry) =>
            entry.feeling === 'hot' &&
            entry.temperature === otherHotBoundary,
        ),
      })
    }

    for (const probe of probes) {
      for (const placeId of sharedSourcePlaces(
        currentObservations,
        probe.sources,
      )) {
        const sourcesAtPlace = probe.sources.filter(
          (entry) => entry.placeId === placeId,
        )
        cases.push(
          makeCase({
            ...probe,
            outfitId,
            placeId,
            transportModeId,
            outfitLogs,
            sourceObservations: sourcesAtPlace,
            labels,
            includeInferredReturns,
          }),
        )
      }
    }
  }

  return [...new Map(cases.map((entry) => [entry.key, entry])).values()].sort(
    (left, right) => left.key.localeCompare(right.key),
  )
}

function thresholdCounts(cases, thresholds) {
  return thresholds.map((threshold) => {
    const qualifying = cases.filter(
      (entry) => entry.currentTransportDistinctWearLogCount >= threshold,
    )
    const countKind = (kind) =>
      qualifying.filter((entry) => entry.kind === kind).length
    return {
      threshold,
      highEndpoint: countKind('high'),
      lowEndpoint: countKind('low'),
      coldWarning: countKind('cold-warning'),
      hotWarning: countKind('hot-warning'),
      totalCases: qualifying.length,
    }
  })
}

function policySimulation(logs, labels, includeInferredReturns = true) {
  const observations = observationsFor(logs, includeInferredReturns)
  const logsByOutfit = groupBy(logs, (log) => log.outfitId)
  const contexts = groupBy(
    observations.filter(
      (entry) => entry.placeId !== null && entry.transportModeId !== null,
    ),
    (entry) =>
      `${entry.outfitId}\u0000${entry.placeId}\u0000${entry.transportModeId}`,
  )
  const affectedByPolicy = new Map(
    TRANSPORT_THERMAL_POLICIES.map((policy) => [policy, new Set()]),
  )
  let borrowedTargetScenarios = 0

  for (const [contextKey] of contexts) {
    const [outfitId, placeId, transportModeId] = contextKey.split('\u0000')
    const outfitLogs = logsByOutfit.get(outfitId) ?? []
    const probe = calculateTransportThermalEvidence(
      outfitLogs,
      {
        outfitId,
        tempOut: 0,
        tempBack: null,
        placeId,
        transportModeId,
      },
      { includeInferredReturnObservations: includeInferredReturns },
    )
    const endpoints = [
      probe.overall.rawOkMinimum,
      probe.overall.rawOkMaximum,
    ].filter((value, index, values) => value !== null && values.indexOf(value) === index)

    for (const endpoint of endpoints) {
      const evidence = calculateTransportThermalEvidence(
        outfitLogs,
        {
          outfitId,
          tempOut: endpoint,
          tempBack: null,
          placeId,
          transportModeId,
        },
        { includeInferredReturnObservations: includeInferredReturns },
      )
      if (!evidence.overallSupportOnlyFromOtherTransport) continue
      borrowedTargetScenarios += 1
      for (const policy of TRANSPORT_THERMAL_POLICIES) {
        const decision = evaluateTransportThermalPolicy(policy, evidence, {
          outfitId,
          tempOut: endpoint,
          tempBack: null,
          placeId,
          transportModeId,
        })
        if (decision.affected) affectedByPolicy.get(policy).add(contextKey)
      }
    }
  }

  return {
    definition:
      'unique Outfit + Place + Transport contexts affected at an overall raw OK endpoint supported only by another Transport',
    borrowedTargetScenarios,
    contextPairsReviewed: contexts.size,
    affectedPairCounts: Object.fromEntries(
      TRANSPORT_THERMAL_POLICIES.map((policy) => [
        policy,
        affectedByPolicy.get(policy).size,
      ]),
    ),
  }
}

function anonymousCases(cases) {
  return cases.map((entry, index) => ({
    caseId: `case-${String(index + 1).padStart(3, '0')}`,
    kind: entry.kind,
    endpoint: entry.endpoint,
    currentTransportDistinctWearLogCount:
      entry.currentTransportDistinctWearLogCount,
    ranges: ranges(entry.evidence),
    distinctWearLogCounts: scopeCounts(entry.evidence),
    markers: entry.markers,
  }))
}

function privateCases(cases) {
  return cases.map((entry, index) => ({
    caseId: `case-${String(index + 1).padStart(3, '0')}`,
    ...entry.private,
  }))
}

export function analyzeTransportThermalPolicyReview(
  wearLogs,
  labels = {},
  thresholds = DEFAULT_THRESHOLDS,
) {
  const normalizedLabels = {
    outfit: new Map(Object.entries(labels.outfit ?? {})),
    place: new Map(Object.entries(labels.place ?? {})),
    transport: new Map(Object.entries(labels.transport ?? {})),
  }
  const logs = distinctLogs(wearLogs)
  const baselineCases = samePlaceCases(logs, normalizedLabels, true)
  const higherConfidenceCases = samePlaceCases(logs, normalizedLabels, false)

  return {
    publicReport: {
      baselineCompatible: {
        samePlaceCounts: thresholdCounts(baselineCases, thresholds),
        anonymousCases: anonymousCases(baselineCases),
        policySimulation: policySimulation(logs, normalizedLabels, true),
      },
      higherConfidence: {
        samePlaceCounts: thresholdCounts(higherConfidenceCases, thresholds),
        anonymousCases: anonymousCases(higherConfidenceCases),
        policySimulation: policySimulation(logs, normalizedLabels, false),
      },
    },
    privateReview: {
      baselineCompatible: privateCases(baselineCases),
      higherConfidence: privateCases(higherConfidenceCases),
    },
  }
}

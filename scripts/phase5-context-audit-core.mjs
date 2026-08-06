import {
  calculateTransportThermalEvidence,
  transportThermalObservations,
} from '../src/lib/transport-thermal-evidence.mjs'

const DEFAULT_THRESHOLDS = [1, 2, 3]

function numericRecord(entries) {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => Number(left) - Number(right)),
  )
}

function distinctRowsById(rows) {
  const byId = new Map()
  let duplicateRows = 0

  for (const row of rows) {
    if (!row?.id) continue
    if (byId.has(row.id)) {
      duplicateRows += 1
      continue
    }
    byId.set(row.id, row)
  }

  return { rows: [...byId.values()], duplicateRows }
}

function outcomeFor(log) {
  const feelings = [log.feelingOut, log.feelingBack]
  const cold = feelings.includes('cold')
  const hot = feelings.includes('hot')
  const issue = cold || hot
  const success = !issue && feelings.includes('ok')

  return {
    cold,
    hot,
    issue,
    success,
    unknown: !issue && !success,
  }
}

function groupLogs(logs, kind) {
  const groups = new Map()

  for (const log of logs) {
    if (!log.placeId) continue
    if (kind === 'exact' && !log.transportModeId) continue

    const key =
      kind === 'exact'
        ? `${log.outfitId}\u0000${log.placeId}\u0000${log.transportModeId}`
        : `${log.outfitId}\u0000${log.placeId}`
    const group = groups.get(key) ?? {
      key,
      outfitId: log.outfitId,
      placeId: log.placeId,
      transportModeId: kind === 'exact' ? log.transportModeId : null,
      wearLogIds: new Set(),
      coldWearLogIds: new Set(),
      hotWearLogIds: new Set(),
      issueWearLogIds: new Set(),
      successWearLogIds: new Set(),
      unknownWearLogIds: new Set(),
    }
    const outcome = outcomeFor(log)

    group.wearLogIds.add(log.id)
    if (outcome.cold) group.coldWearLogIds.add(log.id)
    if (outcome.hot) group.hotWearLogIds.add(log.id)
    if (outcome.issue) group.issueWearLogIds.add(log.id)
    if (outcome.success) group.successWearLogIds.add(log.id)
    if (outcome.unknown) group.unknownWearLogIds.add(log.id)
    groups.set(key, group)
  }

  return [...groups.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  )
}

function repetitionDistribution(groups) {
  const distribution = new Map()
  for (const group of groups) {
    const count = group.wearLogIds.size
    distribution.set(count, (distribution.get(count) ?? 0) + 1)
  }
  return numericRecord(distribution.entries())
}

function thresholdSummary(groups, outfitRatings, threshold) {
  const qualifying = groups.filter(
    (group) => group.wearLogIds.size >= threshold,
  )
  const wearLogIds = new Set()
  const outfitIds = new Set()
  let groupsWithCold = 0
  let groupsWithHot = 0
  let groupsWithIssue = 0
  let groupsWithUnknown = 0
  let groupsWithErrorRatedOutfit = 0

  for (const group of qualifying) {
    group.wearLogIds.forEach((id) => wearLogIds.add(id))
    outfitIds.add(group.outfitId)
    if (group.coldWearLogIds.size > 0) groupsWithCold += 1
    if (group.hotWearLogIds.size > 0) groupsWithHot += 1
    if (group.issueWearLogIds.size > 0) groupsWithIssue += 1
    if (group.unknownWearLogIds.size > 0) groupsWithUnknown += 1
    if (outfitRatings.get(group.outfitId) === 'error') {
      groupsWithErrorRatedOutfit += 1
    }
  }

  return {
    threshold,
    groups: qualifying.length,
    distinctOutfits: outfitIds.size,
    distinctWearLogs: wearLogIds.size,
    groupsWithCold,
    groupsWithHot,
    groupsWithIssue,
    groupsWithUnknown,
    groupsWithErrorRatedOutfit,
  }
}

function repeatedOutcomeCases(groups, outfitRatings, threshold = 2) {
  return groups
    .filter((group) => {
      const error = outfitRatings.get(group.outfitId) === 'error'
      return (
        group.wearLogIds.size >= threshold &&
        (group.issueWearLogIds.size > 0 || error)
      )
    })
    .map((group, index) => ({
      caseId: `case-${String(index + 1).padStart(3, '0')}`,
      wearLogCount: group.wearLogIds.size,
      successCount: group.successWearLogIds.size,
      issueCount: group.issueWearLogIds.size,
      unknownCount: group.unknownWearLogIds.size,
      coldCount: group.coldWearLogIds.size,
      hotCount: group.hotWearLogIds.size,
      currentOutfitRatedError: outfitRatings.get(group.outfitId) === 'error',
    }))
}

function maximumGroupCountByOutfit(groups) {
  const result = new Map()
  for (const group of groups) {
    result.set(
      group.outfitId,
      Math.max(result.get(group.outfitId) ?? 0, group.wearLogIds.size),
    )
  }
  return result
}

function contextDistinctness(logs, exactGroups, outfitPlaceGroups) {
  const totalByOutfit = new Map()
  for (const log of logs) {
    totalByOutfit.set(log.outfitId, (totalByOutfit.get(log.outfitId) ?? 0) + 1)
  }

  const maxExactByOutfit = maximumGroupCountByOutfit(exactGroups)
  const maxPlaceByOutfit = maximumGroupCountByOutfit(outfitPlaceGroups)
  const exactGroupCountByOutfit = new Map()
  for (const group of exactGroups) {
    exactGroupCountByOutfit.set(
      group.outfitId,
      (exactGroupCountByOutfit.get(group.outfitId) ?? 0) + 1,
    )
  }

  const cohorts = new Map()
  for (const [outfitId, totalWearCount] of totalByOutfit) {
    const cohort = cohorts.get(totalWearCount) ?? []
    cohort.push({
      outfitId,
      maxExactCount: maxExactByOutfit.get(outfitId) ?? 0,
      maxPlaceCount: maxPlaceByOutfit.get(outfitId) ?? 0,
    })
    cohorts.set(totalWearCount, cohort)
  }

  const comparableCohorts = [...cohorts.values()].filter(
    (cohort) => cohort.length >= 2,
  )
  const cohortsWithDifferentExactCounts = comparableCohorts.filter(
    (cohort) => new Set(cohort.map((entry) => entry.maxExactCount)).size > 1,
  ).length
  const cohortsWithDifferentPlaceCounts = comparableCohorts.filter(
    (cohort) => new Set(cohort.map((entry) => entry.maxPlaceCount)).size > 1,
  ).length
  const outfitsWithMultipleExactContexts = [...exactGroupCountByOutfit.values()].filter(
    (count) => count > 1,
  ).length
  const outfitsWhereExactContextIsLessThanTotal = [...totalByOutfit].filter(
    ([outfitId, total]) =>
      (maxExactByOutfit.get(outfitId) ?? 0) > 0 &&
      (maxExactByOutfit.get(outfitId) ?? 0) < total,
  ).length

  return {
    totalWearCountCohortsWithAtLeastTwoOutfits: comparableCohorts.length,
    cohortsWithDifferentMaxExactContextCounts: cohortsWithDifferentExactCounts,
    cohortsWithDifferentMaxPlaceCounts: cohortsWithDifferentPlaceCounts,
    outfitsWithMultipleExactContexts,
    outfitsWhereMaxExactContextIsLessThanTotal:
      outfitsWhereExactContextIsLessThanTotal,
    providesInformationDistinctFromTotalWearCount:
      cohortsWithDifferentExactCounts > 0 ||
      cohortsWithDifferentPlaceCounts > 0 ||
      outfitsWithMultipleExactContexts > 0 ||
      outfitsWhereExactContextIsLessThanTotal > 0,
  }
}

function completeness(logs) {
  const count = (predicate) => logs.filter(predicate).length
  const total = logs.length
  const metric = (value) => ({
    count: value,
    percentage: total === 0 ? 0 : Number(((value / total) * 100).toFixed(2)),
  })

  return {
    placePresent: metric(count((log) => Boolean(log.placeId))),
    placeMissing: metric(count((log) => !log.placeId)),
    transportPresent: metric(count((log) => Boolean(log.transportModeId))),
    transportMissing: metric(count((log) => !log.transportModeId)),
    placeAndTransportPresent: metric(
      count((log) => Boolean(log.placeId) && Boolean(log.transportModeId)),
    ),
    placePresentTransportMissing: metric(
      count((log) => Boolean(log.placeId) && !log.transportModeId),
    ),
    placeMissingTransportPresent: metric(
      count((log) => !log.placeId && Boolean(log.transportModeId)),
    ),
    placeAndTransportMissing: metric(
      count((log) => !log.placeId && !log.transportModeId),
    ),
    tempOutMissing: metric(count((log) => log.tempOut === null)),
    tempBackMissing: metric(count((log) => log.tempBack === null)),
    tempBackInferred: metric(count((log) => log.tempBackInferred === true)),
  }
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

function distinctIds(values, idFor = (value) => value.wearLogId) {
  return new Set(values.map(idFor).filter(Boolean))
}

function countDistribution(values) {
  const distribution = new Map()
  for (const value of values) {
    distribution.set(value, (distribution.get(value) ?? 0) + 1)
  }
  return numericRecord(distribution.entries())
}

function transportGroupThresholds(groups, thresholds) {
  return thresholds.map((threshold) => {
    const qualifying = groups.filter(
      (group) => group.distinctWearLogCount >= threshold,
    )
    return {
      threshold,
      groups: qualifying.length,
      distinctOutfits: new Set(qualifying.map((group) => group.outfitId)).size,
      distinctWearLogs: distinctIds(
        qualifying.flatMap((group) => group.observations),
      ).size,
    }
  })
}

function endpointPlaceRelation(currentObservations, sourceObservations) {
  const pairs = currentObservations.flatMap((current) =>
    sourceObservations.map((source) => ({ current, source })),
  )
  if (
    pairs.some(
      ({ current, source }) =>
        current.placeId !== null && current.placeId === source.placeId,
    )
  ) {
    return 'samePlace'
  }
  if (
    pairs.length > 0 &&
    pairs.every(
      ({ current, source }) =>
        current.placeId !== null &&
        source.placeId !== null &&
        current.placeId !== source.placeId,
    )
  ) {
    return 'differentPlace'
  }
  return 'nullOrMixedPlace'
}

function differenceStats(values) {
  const finite = values.filter(Number.isFinite)
  return {
    count: finite.length,
    average:
      finite.length === 0
        ? null
        : Number(
            (finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(
              2,
            ),
          ),
    maximum: finite.length === 0 ? null : Math.max(...finite),
    distribution: countDistribution(finite),
  }
}

function rangeBorrowingSummary(pairs, threshold) {
  const qualifying = pairs.filter(
    (pair) => pair.current.distinctWearLogCount >= threshold,
  )
  const comparable = qualifying.filter(
    (pair) => pair.evidence.overall.expandedOkRange !== null,
  )
  const highBorrowed = comparable.filter(
    (pair) => pair.evidence.overallHighEndpointBorrowedFromOtherTransport,
  )
  const lowBorrowed = comparable.filter(
    (pair) => pair.evidence.overallLowEndpointBorrowedFromOtherTransport,
  )
  const expandedCoverageBeyondCurrent = comparable.filter((pair) => {
    const overall = pair.evidence.overall.expandedOkRange
    const current = pair.current.expandedOkRange
    if (!overall) return false
    if (!current) return true
    return overall.min < current.min || overall.max > current.max
  })
  const highDifferences = highBorrowed.flatMap((pair) => {
    const overall = pair.evidence.overall.rawOkMaximum
    const current = pair.current.rawOkMaximum
    return overall === null || current === null ? [] : [overall - current]
  })
  const lowDifferences = lowBorrowed.flatMap((pair) => {
    const overall = pair.evidence.overall.rawOkMinimum
    const current = pair.current.rawOkMinimum
    return overall === null || current === null ? [] : [current - overall]
  })
  const placeSupport = (borrowed, endpoint) => {
    const counts = {
      samePlace: 0,
      differentPlace: 0,
      nullOrMixedPlace: 0,
    }
    for (const pair of borrowed) {
      const endpointValue =
        endpoint === 'high'
          ? pair.evidence.overall.rawOkMaximum
          : pair.evidence.overall.rawOkMinimum
      const source = pair.evidence.otherTransports.flatMap((transport) =>
        transport.evidence.observations.filter(
          (observation) =>
            observation.feeling === 'ok' &&
            observation.temperature === endpointValue,
        ),
      )
      counts[endpointPlaceRelation(pair.current.observations, source)] += 1
    }
    return counts
  }

  return {
    threshold,
    transportPairs: qualifying.length,
    pairsWithOverallOkRange: comparable.length,
    pairsWithCurrentTransportOkRange: comparable.filter(
      (pair) => pair.current.expandedOkRange !== null,
    ).length,
    pairsWithoutCurrentTransportOkRange: comparable.filter(
      (pair) => pair.current.expandedOkRange === null,
    ).length,
    overallHighEndpointBorrowedFromOtherTransport: highBorrowed.length,
    overallLowEndpointBorrowedFromOtherTransport: lowBorrowed.length,
    overallExpandedRangeExceedsCurrentTransportRange:
      expandedCoverageBeyondCurrent.length,
    highEndpointDifferenceC: differenceStats(highDifferences),
    lowEndpointDifferenceC: differenceStats(lowDifferences),
    highEndpointPlaceSupport: placeSupport(highBorrowed, 'high'),
    lowEndpointPlaceSupport: placeSupport(lowBorrowed, 'low'),
  }
}

function maxTemperature(observations, feeling) {
  const temperatures = observations
    .filter((entry) => entry.feeling === feeling)
    .map((entry) => entry.temperature)
  return temperatures.length > 0 ? Math.max(...temperatures) : null
}

function minTemperature(observations, feeling) {
  const temperatures = observations
    .filter((entry) => entry.feeling === feeling)
    .map((entry) => entry.temperature)
  return temperatures.length > 0 ? Math.min(...temperatures) : null
}

function warningBorrowingSummary(pairs, threshold) {
  const qualifying = pairs.filter(
    (pair) => pair.current.distinctWearLogCount >= threshold,
  )
  let coldOnlyOtherTransport = 0
  let hotOnlyOtherTransport = 0

  for (const pair of qualifying) {
    const currentObservations = pair.current.observations
    const otherObservations = pair.evidence.otherTransports.flatMap(
      (transport) => transport.evidence.observations,
    )
    const nullObservations = pair.evidence.nullTransport.observations
    const currentColdBoundary = maxTemperature(currentObservations, 'cold')
    const otherColdBoundary = maxTemperature(otherObservations, 'cold')
    const nullColdBoundary = maxTemperature(nullObservations, 'cold')
    const currentHotBoundary = minTemperature(currentObservations, 'hot')
    const otherHotBoundary = minTemperature(otherObservations, 'hot')
    const nullHotBoundary = minTemperature(nullObservations, 'hot')

    if (
      otherColdBoundary !== null &&
      (currentColdBoundary === null || otherColdBoundary > currentColdBoundary) &&
      (nullColdBoundary === null || nullColdBoundary < otherColdBoundary)
    ) {
      coldOnlyOtherTransport += 1
    }
    if (
      otherHotBoundary !== null &&
      (currentHotBoundary === null || otherHotBoundary < currentHotBoundary) &&
      (nullHotBoundary === null || nullHotBoundary > otherHotBoundary)
    ) {
      hotOnlyOtherTransport += 1
    }
  }

  return {
    threshold,
    transportPairs: qualifying.length,
    coldWarningBoundaryBorrowedOnlyFromOtherTransport:
      coldOnlyOtherTransport,
    hotWarningBoundaryBorrowedOnlyFromOtherTransport: hotOnlyOtherTransport,
  }
}

function observationsConflict(left, right) {
  if (left.feeling === right.feeling) return false
  if (left.feeling === 'ok' || right.feeling === 'ok') return true
  return (
    (left.feeling === 'cold' && right.feeling === 'hot') ||
    (left.feeling === 'hot' && right.feeling === 'cold')
  )
}

function conflictPlaceRelation(left, right) {
  if (left.placeId === null || right.placeId === null) return 'nullPlace'
  return left.placeId === right.placeId ? 'samePlace' : 'differentPlace'
}

function crossTransportConflicts(observations) {
  const byOutfit = groupBy(observations, (entry) => entry.outfitId)
  const conflicts = []

  for (const outfitObservations of byOutfit.values()) {
    for (let leftIndex = 0; leftIndex < outfitObservations.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < outfitObservations.length;
        rightIndex += 1
      ) {
        const left = outfitObservations[leftIndex]
        const right = outfitObservations[rightIndex]
        if (
          left.transportModeId === null ||
          right.transportModeId === null ||
          left.transportModeId === right.transportModeId ||
          Math.abs(left.temperature - right.temperature) > 2 ||
          !observationsConflict(left, right)
        ) {
          continue
        }
        conflicts.push({
          outfitId: left.outfitId,
          wearLogPair: [left.wearLogId, right.wearLogId]
            .sort((a, b) => a.localeCompare(b))
            .join('|'),
          placeRelation: conflictPlaceRelation(left, right),
          temperatureDifference: Math.abs(
            left.temperature - right.temperature,
          ),
          outcomes: [left.feeling, right.feeling].sort().join('|'),
        })
      }
    }
  }

  const unique = new Map()
  for (const conflict of conflicts) {
    const key = [
      conflict.outfitId,
      conflict.wearLogPair,
      conflict.placeRelation,
      conflict.temperatureDifference,
      conflict.outcomes,
    ].join('\u0000')
    if (!unique.has(key)) unique.set(key, conflict)
  }
  const sorted = [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, conflict]) => conflict)
  const relationCount = (relation) =>
    sorted.filter((entry) => entry.placeRelation === relation).length

  return {
    conflictCases: sorted.length,
    distinctOutfits: new Set(sorted.map((entry) => entry.outfitId)).size,
    samePlace: relationCount('samePlace'),
    differentPlace: relationCount('differentPlace'),
    oneOrBothPlacesNull: relationCount('nullPlace'),
    anonymousExamples: sorted.slice(0, 20).map((entry, index) => ({
      caseId: `case-${String(index + 1).padStart(3, '0')}`,
      placeRelation: entry.placeRelation,
      temperatureDifference: entry.temperatureDifference,
      outcomes: entry.outcomes,
    })),
  }
}

function analyzeTransportThermalPass(logs, thresholds, includeInferredReturns) {
  const logById = new Map(logs.map((log) => [log.id, log]))
  const observations = transportThermalObservations(logs, {
    includeInferredReturnObservations: includeInferredReturns,
  }).map((observation) => ({
    ...observation,
    outfitId: logById.get(observation.wearLogId)?.outfitId,
  }))
  const observationsByOutfit = groupBy(observations, (entry) => entry.outfitId)
  const logsByOutfit = groupBy(logs, (log) => log.outfitId)
  const transportGroups = [...groupBy(
    observations.filter((entry) => entry.transportModeId !== null),
    (entry) => `${entry.outfitId}\u0000${entry.transportModeId}`,
  ).entries()].map(([key, group]) => {
    const [outfitId, transportModeId] = key.split('\u0000')
    return {
      outfitId,
      transportModeId,
      observations: group,
      distinctWearLogCount: distinctIds(group).size,
    }
  })
  const pairs = transportGroups.map((group) => {
    const evidence = calculateTransportThermalEvidence(
      logsByOutfit.get(group.outfitId) ?? [],
      {
        outfitId: group.outfitId,
        tempOut: 0,
        tempBack: null,
        transportModeId: group.transportModeId,
      },
      { includeInferredReturnObservations: includeInferredReturns },
    )
    return {
      ...group,
      evidence,
      current: evidence.currentTransport,
    }
  })
  const nullTransportObservations = observations.filter(
    (entry) => entry.transportModeId === null,
  )

  return {
    includeInferredReturnObservations: includeInferredReturns,
    dataAvailability: {
      thermalObservationCount: observations.length,
      distinctWearLogsWithThermalObservations: distinctIds(observations).size,
      outfitsWithThermalObservations: observationsByOutfit.size,
      outfitsWithTwoOrMoreNonNullTransports: [...observationsByOutfit.values()].filter(
        (entries) =>
          new Set(
            entries
              .map((entry) => entry.transportModeId)
              .filter(Boolean),
          ).size >= 2,
      ).length,
      transportSpecificGroups: transportGroups.length,
      transportGroupDistributionByDistinctWearLogCount: countDistribution(
        transportGroups.map((group) => group.distinctWearLogCount),
      ),
      transportGroupThresholds: transportGroupThresholds(
        transportGroups,
        thresholds,
      ),
      nullTransportThermalObservationCount: nullTransportObservations.length,
      nullTransportDistinctWearLogCount:
        distinctIds(nullTransportObservations).size,
    },
    rangeBorrowing: thresholds.map((threshold) =>
      rangeBorrowingSummary(pairs, threshold),
    ),
    warningBorrowing: thresholds.map((threshold) =>
      warningBorrowingSummary(pairs, threshold),
    ),
    crossTransportConflicts: crossTransportConflicts(observations),
  }
}

function passDelta(baseline, higherConfidence) {
  const baselineThreshold = (section, threshold) =>
    baseline[section].find((entry) => entry.threshold === threshold)
  const confidenceThreshold = (section, threshold) =>
    higherConfidence[section].find((entry) => entry.threshold === threshold)

  return {
    thermalObservationCount:
      higherConfidence.dataAvailability.thermalObservationCount -
      baseline.dataAvailability.thermalObservationCount,
    outfitsWithThermalObservations:
      higherConfidence.dataAvailability.outfitsWithThermalObservations -
      baseline.dataAvailability.outfitsWithThermalObservations,
    outfitsWithTwoOrMoreNonNullTransports:
      higherConfidence.dataAvailability.outfitsWithTwoOrMoreNonNullTransports -
      baseline.dataAvailability.outfitsWithTwoOrMoreNonNullTransports,
    nullTransportThermalObservationCount:
      higherConfidence.dataAvailability.nullTransportThermalObservationCount -
      baseline.dataAvailability.nullTransportThermalObservationCount,
    threshold2: {
      rangeHighBorrowed:
        confidenceThreshold('rangeBorrowing', 2)
          .overallHighEndpointBorrowedFromOtherTransport -
        baselineThreshold('rangeBorrowing', 2)
          .overallHighEndpointBorrowedFromOtherTransport,
      rangeLowBorrowed:
        confidenceThreshold('rangeBorrowing', 2)
          .overallLowEndpointBorrowedFromOtherTransport -
        baselineThreshold('rangeBorrowing', 2)
          .overallLowEndpointBorrowedFromOtherTransport,
      expandedCoverageBeyondCurrent:
        confidenceThreshold('rangeBorrowing', 2)
          .overallExpandedRangeExceedsCurrentTransportRange -
        baselineThreshold('rangeBorrowing', 2)
          .overallExpandedRangeExceedsCurrentTransportRange,
      coldWarningBorrowed:
        confidenceThreshold('warningBorrowing', 2)
          .coldWarningBoundaryBorrowedOnlyFromOtherTransport -
        baselineThreshold('warningBorrowing', 2)
          .coldWarningBoundaryBorrowedOnlyFromOtherTransport,
      hotWarningBorrowed:
        confidenceThreshold('warningBorrowing', 2)
          .hotWarningBoundaryBorrowedOnlyFromOtherTransport -
        baselineThreshold('warningBorrowing', 2)
          .hotWarningBoundaryBorrowedOnlyFromOtherTransport,
    },
    conflicts: {
      total:
        higherConfidence.crossTransportConflicts.conflictCases -
        baseline.crossTransportConflicts.conflictCases,
      samePlace:
        higherConfidence.crossTransportConflicts.samePlace -
        baseline.crossTransportConflicts.samePlace,
      differentPlace:
        higherConfidence.crossTransportConflicts.differentPlace -
        baseline.crossTransportConflicts.differentPlace,
      nullPlace:
        higherConfidence.crossTransportConflicts.oneOrBothPlacesNull -
        baseline.crossTransportConflicts.oneOrBothPlacesNull,
    },
  }
}

export function analyzeTransportThermalEvidence(
  wearLogRows,
  thresholds = DEFAULT_THRESHOLDS,
) {
  const logs = distinctRowsById(wearLogRows).rows
  const baselineCompatible = analyzeTransportThermalPass(
    logs,
    thresholds,
    true,
  )
  const higherConfidence = analyzeTransportThermalPass(
    logs,
    thresholds,
    false,
  )

  return {
    baselineCompatible,
    higherConfidence,
    higherConfidenceMinusBaseline: passDelta(
      baselineCompatible,
      higherConfidence,
    ),
  }
}

export function analyzePhase5ContextEvidence(
  wearLogRows,
  outfits = [],
  thresholds = DEFAULT_THRESHOLDS,
) {
  const deduplicated = distinctRowsById(wearLogRows)
  const logs = deduplicated.rows
  const outfitRatings = new Map(
    outfits.map((outfit) => [outfit.id, outfit.rating ?? null]),
  )
  const exactGroups = groupLogs(logs, 'exact')
  const outfitPlaceGroups = groupLogs(logs, 'place')

  return {
    guarantees: {
      distinctWearLogs: true,
      relationRowsCounted: false,
      productionWrites: false,
    },
    input: {
      sourceRows: wearLogRows.length,
      distinctWearLogs: logs.length,
      duplicateWearLogRowsIgnored: deduplicated.duplicateRows,
      outfits: new Set(logs.map((log) => log.outfitId)).size,
    },
    completeness: completeness(logs),
    exactOutfitPlaceTransport: {
      groups: exactGroups.length,
      repetitionDistribution: repetitionDistribution(exactGroups),
      thresholds: thresholds.map((threshold) =>
        thresholdSummary(exactGroups, outfitRatings, threshold),
      ),
      repeatedOutcomeCases: repeatedOutcomeCases(exactGroups, outfitRatings),
    },
    outfitPlace: {
      groups: outfitPlaceGroups.length,
      repetitionDistribution: repetitionDistribution(outfitPlaceGroups),
      thresholds: thresholds.map((threshold) =>
        thresholdSummary(outfitPlaceGroups, outfitRatings, threshold),
      ),
      repeatedOutcomeCases: repeatedOutcomeCases(
        outfitPlaceGroups,
        outfitRatings,
      ),
    },
    contextDistinctness: contextDistinctness(
      logs,
      exactGroups,
      outfitPlaceGroups,
    ),
    transportThermal: analyzeTransportThermalEvidence(logs, thresholds),
  }
}

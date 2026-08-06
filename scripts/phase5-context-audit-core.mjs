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
  }
}


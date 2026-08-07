const SUMMER_MONTHS = new Set([6, 7, 8])

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function distinctById(rows) {
  const byId = new Map()
  for (const row of [...rows].sort((left, right) => compareText(left.id, right.id))) {
    if (row?.id && !byId.has(row.id)) byId.set(row.id, row)
  }
  return [...byId.values()]
}

function countBy(values, keyFor) {
  const counts = new Map()
  for (const value of values) {
    const key = keyFor(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)))
}

function monthFor(log) {
  return Number(log.wornOn?.slice(5, 7))
}

function yearFor(log) {
  return log.wornOn?.slice(0, 4) || 'unknown'
}

function seasonFor(log) {
  const month = monthFor(log)
  if ([12, 1, 2].includes(month)) return 'winter'
  if ([3, 4, 5].includes(month)) return 'spring'
  if ([6, 7, 8].includes(month)) return 'summer'
  if ([9, 10, 11].includes(month)) return 'autumn'
  return 'unknown'
}

function temperatureBand(temperature) {
  if (temperature === null || temperature === undefined) return 'missing'
  if (temperature < 0) return '<0'
  if (temperature < 10) return '0-9'
  if (temperature < 20) return '10-19'
  if (temperature < 25) return '20-24'
  if (temperature < 28) return '25-27'
  if (temperature < 30) return '28-29'
  if (temperature < 33) return '30-32'
  return '33+'
}

function feelingOutcome(log) {
  const feelings = new Set(
    [log.feelingOut, log.feelingBack].filter(
      (feeling) => feeling === 'cold' || feeling === 'ok' || feeling === 'hot',
    ),
  )
  if (feelings.size === 0) return 'unknown'
  if (feelings.size > 1) return 'mixed'
  return [...feelings][0]
}

function isWalkName(name) {
  return /^(walk|도보|도보\s*·\s*(근거리|지속))$/iu.test(name?.trim() ?? '')
}

function isShortWalkName(name) {
  return /^도보\s*·\s*근거리$/u.test(name?.trim() ?? '')
}

function isCarName(name) {
  return /^(car|차)$/iu.test(name?.trim() ?? '')
}

function isStarbucksName(name) {
  return /(starbucks|스타벅스)/iu.test(name ?? '')
}

function isCgvName(name) {
  return /cgv/iu.test(name ?? '')
}

function groupLogs(values, keyFor) {
  const groups = new Map()
  for (const value of values) {
    const key = keyFor(value)
    const group = groups.get(key) ?? []
    group.push(value)
    groups.set(key, group)
  }
  return groups
}

function repetitionDistribution(groups) {
  return countBy([...groups.values()], (group) => String(distinctById(group).length))
}

function exactThresholds(logs, outfits, places, transports) {
  const groups = groupLogs(
    logs.filter((log) => log.placeId && log.transportModeId),
    (log) => `${log.outfitId}\u0000${log.placeId}\u0000${log.transportModeId}`,
  )
  const universeSize = outfits.length * places.length * transports.length
  const counts = [...groups.values()].map((group) => distinctById(group).length)
  return [0, 1, 2, 3].map((threshold) => ({
    threshold,
    groups:
      threshold === 0
        ? universeSize
        : counts.filter((count) => count >= threshold).length,
    zeroEvidenceGroups:
      threshold === 0 ? Math.max(0, universeSize - groups.size) : 0,
  }))
}

function existingExactGroupThresholds(logs, thresholds = [1, 2, 3]) {
  const groups = groupLogs(
    logs.filter((log) => log.placeId && log.transportModeId),
    (log) => `${log.outfitId}\u0000${log.placeId}\u0000${log.transportModeId}`,
  )
  const counts = [...groups.values()].map((group) => distinctById(group).length)
  return thresholds.map((threshold) => ({
    threshold,
    groups: counts.filter((count) => count >= threshold).length,
  }))
}

function activeTransportSummary(transports, logs) {
  return transports
    .filter((transport) => transport.active !== false)
    .sort((left, right) => compareText(left.name, right.name))
    .map((transport) => ({
      id: transport.id,
      name: transport.name,
      distinctWearLogCount: logs.filter(
        (log) => log.transportModeId === transport.id,
      ).length,
    }))
}

function privateExactGroups(logs, labels) {
  return [...groupLogs(
    logs.filter((log) => log.placeId && log.transportModeId),
    (log) => `${log.outfitId}\u0000${log.placeId}\u0000${log.transportModeId}`,
  ).values()]
    .map((group) => ({
      outfit: labels.outfit.get(group[0].outfitId) ?? '이름 없는 Outfit',
      place: labels.place.get(group[0].placeId) ?? '이름 없는 Place',
      transport:
        labels.transport.get(group[0].transportModeId) ?? '이름 없는 Transport',
      distinctWearLogCount: distinctById(group).length,
      wornOn: distinctById(group)
        .map((log) => log.wornOn)
        .sort(compareText),
    }))
    .sort(
      (left, right) =>
        right.distinctWearLogCount - left.distinctWearLogCount ||
        compareText(left.place, right.place) ||
        compareText(left.outfit, right.outfit) ||
        compareText(left.transport, right.transport),
    )
}

export function analyzeTransportTaxonomyCoverage(
  wearLogs,
  outfitRows,
  placeRows,
  transportRows,
  labelInput = {},
) {
  const logs = distinctById(wearLogs)
  const outfits = distinctById(outfitRows)
  const places = distinctById(placeRows)
  const transports = distinctById(transportRows)
  const labels = {
    outfit: new Map(Object.entries(labelInput.outfit ?? {})),
    place: new Map(
      places.map((place) => [place.id, labelInput.place?.[place.id] ?? place.name]),
    ),
    transport: new Map(
      transports.map((transport) => [
        transport.id,
        labelInput.transport?.[transport.id] ?? transport.name,
      ]),
    ),
  }
  const activeTransports = transports.filter((transport) => transport.active !== false)
  const walkIds = new Set(
    transports.filter((transport) => isWalkName(transport.name)).map((entry) => entry.id),
  )
  const shortWalkIds = new Set(
    transports
      .filter((transport) => isShortWalkName(transport.name))
      .map((entry) => entry.id),
  )
  const carIds = new Set(
    transports.filter((transport) => isCarName(transport.name)).map((entry) => entry.id),
  )
  const walkLogs = logs.filter((log) => walkIds.has(log.transportModeId))
  const walkGroups = groupLogs(
    walkLogs.filter((log) => log.placeId),
    (log) => `${log.outfitId}\u0000${log.placeId}\u0000${log.transportModeId}`,
  )
  const placeAliases = new Map(
    [...new Set(walkLogs.map((log) => log.placeId).filter(Boolean))]
      .sort(compareText)
      .map((placeId, index) => [placeId, `place-${String(index + 1).padStart(3, '0')}`]),
  )
  const walkByPlacePublic = [...groupLogs(walkLogs, (log) => log.placeId ?? 'null').entries()]
    .map(([placeId, group]) => ({
      place: placeId === 'null' ? 'null' : placeAliases.get(placeId),
      distinctWearLogCount: distinctById(group).length,
    }))
    .sort(
      (left, right) =>
        right.distinctWearLogCount - left.distinctWearLogCount ||
        compareText(left.place, right.place),
    )

  const starbucksPlaces = places.filter((place) => isStarbucksName(place.name))
  const starbucksIds = new Set(starbucksPlaces.map((place) => place.id))
  const starbucksLogs = logs.filter((log) => starbucksIds.has(log.placeId))
  const starbucksSummerLogs = starbucksLogs.filter((log) => SUMMER_MONTHS.has(monthFor(log)))
  const starbucksHotWeatherWalkLogs = walkLogs
    .filter(
      (log) =>
        starbucksIds.has(log.placeId) &&
        (SUMMER_MONTHS.has(monthFor(log)) ||
          (log.tempOut !== null && log.tempOut >= 28)),
    )
    .sort((left, right) => {
      const priorityFor = (log) => {
        const summer = SUMMER_MONTHS.has(monthFor(log))
        const hot = log.tempOut !== null && log.tempOut >= 28
        if (summer && hot) return 0
        if (hot) return 1
        return 2
      }
      return (
        priorityFor(left) - priorityFor(right) ||
        (right.tempOut ?? Number.NEGATIVE_INFINITY) -
          (left.tempOut ?? Number.NEGATIVE_INFINITY) ||
        compareText(left.wornOn, right.wornOn) ||
        compareText(left.id, right.id)
      )
    })
  const cgvPlaces = places.filter((place) => isCgvName(place.name))
  const cgvIds = new Set(cgvPlaces.map((place) => place.id))
  const cgvSummerLogs = logs.filter(
    (log) => cgvIds.has(log.placeId) && SUMMER_MONTHS.has(monthFor(log)),
  )
  const inferredWalkLogs = walkLogs.filter(
    (log) => log.tempBackInferred && log.tempBack !== null,
  )

  const privateWalkRows = walkLogs
    .map((log) => ({
      wearLogId: log.id,
      wornOn: log.wornOn,
      place: log.placeId ? labels.place.get(log.placeId) ?? '이름 없는 Place' : null,
      outfit: labels.outfit.get(log.outfitId) ?? '이름 없는 Outfit',
      tempOut: log.tempOut,
      tempBack: log.tempBack,
      tempBackInferred: Boolean(log.tempBackInferred),
      feelingOut: log.feelingOut,
      feelingBack: log.feelingBack,
      classification: 'manual-required',
    }))
    .sort(
      (left, right) =>
        compareText(left.wornOn, right.wornOn) || compareText(left.wearLogId, right.wearLogId),
    )

  return {
    publicReport: {
      querySemantics: {
        distinctWearLogs: true,
        productionWrites: false,
        historicalWalkAutoClassified: false,
      },
      activeTransportModes: activeTransportSummary(activeTransports, logs).map(
        ({ id: _id, ...entry }) => entry,
      ),
      historicalWalk: {
        matchingModeCount: walkIds.size,
        distinctWearLogCount: walkLogs.length,
        distinctOutfitCount: new Set(walkLogs.map((log) => log.outfitId)).size,
        byPlace: walkByPlacePublic,
        byYearMonth: countBy(walkLogs, (log) => log.wornOn?.slice(0, 7) || 'unknown'),
        bySeason: countBy(walkLogs, seasonFor),
        byTempOutBand: countBy(walkLogs, (log) => temperatureBand(log.tempOut)),
        byFeelingOutcome: countBy(walkLogs, feelingOutcome),
        exactOutfitPlaceWalkRepetitionDistribution:
          repetitionDistribution(walkGroups),
        nullPlaceDistinctWearLogCount: walkLogs.filter((log) => !log.placeId).length,
        inferredReturnDistinctWearLogCount: inferredWalkLogs.length,
        classifiableAsWalkShortWithoutManualReview: 0,
      },
      nearbyStarbucks: {
        plausiblePlaceCount: starbucksPlaces.length,
        distinctWearLogCount: starbucksLogs.length,
        byYear: countBy(starbucksLogs, yearFor),
        juneThroughAugustDistinctWearLogCount: starbucksSummerLogs.length,
        tempOutAtLeast28DistinctWearLogCount: starbucksLogs.filter(
          (log) => log.tempOut !== null && log.tempOut >= 28,
        ).length,
        tempOutAtLeast30DistinctWearLogCount: starbucksLogs.filter(
          (log) => log.tempOut !== null && log.tempOut >= 30,
        ).length,
        currentWalkDistinctWearLogCount: starbucksLogs.filter((log) =>
          walkIds.has(log.transportModeId),
        ).length,
        otherTransportDistinctWearLogCount: starbucksLogs.filter(
          (log) => log.transportModeId !== null && !walkIds.has(log.transportModeId),
        ).length,
        nullTransportDistinctWearLogCount: starbucksLogs.filter(
          (log) => log.transportModeId === null,
        ).length,
        exactGroupThresholds: exactThresholds(
          starbucksLogs,
          outfits,
          starbucksPlaces,
          activeTransports,
        ),
        confirmedWalkShortDistinctWearLogCount: starbucksLogs.filter((log) =>
          shortWalkIds.has(log.transportModeId),
        ).length,
      },
      cgvSummer: {
        plausiblePlaceCount: cgvPlaces.length,
        carDistinctWearLogCount: cgvSummerLogs.filter((log) =>
          carIds.has(log.transportModeId),
        ).length,
        currentWalkDistinctWearLogCount: cgvSummerLogs.filter((log) =>
          walkIds.has(log.transportModeId),
        ).length,
        otherOrNullDistinctWearLogCount: cgvSummerLogs.filter(
          (log) =>
            !carIds.has(log.transportModeId) && !walkIds.has(log.transportModeId),
        ).length,
      },
    },
    privateReview: {
      activeTransportModes: activeTransportSummary(activeTransports, logs),
      plausibleStarbucksLabels: starbucksPlaces.map((place) => place.name).sort(compareText),
      plausibleCgvLabels: cgvPlaces.map((place) => place.name).sort(compareText),
      walkByPlace: [...groupLogs(walkLogs, (log) => log.placeId ?? 'null').entries()]
        .map(([placeId, group]) => ({
          place: placeId === 'null' ? null : labels.place.get(placeId),
          distinctWearLogCount: distinctById(group).length,
          earliestWornOn: distinctById(group).map((log) => log.wornOn).sort(compareText)[0],
          latestWornOn: distinctById(group).map((log) => log.wornOn).sort(compareText).at(-1),
          summerDistinctWearLogCount: distinctById(group).filter((log) =>
            SUMMER_MONTHS.has(monthFor(log)),
          ).length,
          tempOutAtLeast28DistinctWearLogCount: distinctById(group).filter(
            (log) => log.tempOut !== null && log.tempOut >= 28,
          ).length,
          inferredReturnDistinctWearLogCount: distinctById(group).filter(
            (log) => log.tempBackInferred && log.tempBack !== null,
          ).length,
        }))
        .sort(
          (left, right) =>
            right.distinctWearLogCount - left.distinctWearLogCount ||
            compareText(left.place, right.place),
        ),
      nearbyStarbucksByPlace: starbucksPlaces.map((place) => {
        const placeLogs = starbucksLogs.filter((log) => log.placeId === place.id)
        const placeWalkLogs = placeLogs.filter((log) =>
          walkIds.has(log.transportModeId),
        )
        const wornOnValues = placeWalkLogs.map((log) => log.wornOn).sort(compareText)
        return {
          place: place.name,
          firstWornOn: wornOnValues[0] ?? null,
          lastWornOn: wornOnValues.at(-1) ?? null,
          distinctWearLogCount: placeWalkLogs.length,
          distinctOutfitCount: new Set(placeWalkLogs.map((log) => log.outfitId)).size,
          byYear: countBy(placeLogs, yearFor),
          juneThroughAugustDistinctWearLogCount: placeWalkLogs.filter((log) =>
            SUMMER_MONTHS.has(monthFor(log)),
          ).length,
          tempOutAtLeast28DistinctWearLogCount: placeWalkLogs.filter(
            (log) => log.tempOut !== null && log.tempOut >= 28,
          ).length,
          tempOutAtLeast30DistinctWearLogCount: placeWalkLogs.filter(
            (log) => log.tempOut !== null && log.tempOut >= 30,
          ).length,
          currentWalkDistinctWearLogCount: placeWalkLogs.length,
          otherTransportDistinctWearLogCount: placeLogs.filter(
            (log) => log.transportModeId !== null && !walkIds.has(log.transportModeId),
          ).length,
          exactGroupThresholds: existingExactGroupThresholds(placeWalkLogs),
          exactGroups: privateExactGroups(placeLogs, labels),
        }
      }),
      cgvSummerByPlace: cgvPlaces.map((place) => {
        const placeLogs = cgvSummerLogs.filter((log) => log.placeId === place.id)
        return {
          place: place.name,
          carDistinctWearLogCount: placeLogs.filter((log) =>
            carIds.has(log.transportModeId),
          ).length,
          currentWalkDistinctWearLogCount: placeLogs.filter((log) =>
            walkIds.has(log.transportModeId),
          ).length,
        }
      }),
      exactOutfitPlaceWalkGroups: privateExactGroups(walkLogs, labels),
      nearbyHotWeatherWalkClassificationRows: starbucksHotWeatherWalkLogs.map(
        (log) => ({
          wearLogId: log.id,
          place: labels.place.get(log.placeId) ?? '이름 없는 Place',
          wornOn: log.wornOn,
          outfit: labels.outfit.get(log.outfitId) ?? '이름 없는 Outfit',
          tempOut: log.tempOut,
          tempBack: log.tempBack,
          tempBackInferred: Boolean(log.tempBackInferred),
          feelingOut: log.feelingOut,
          feelingBack: log.feelingBack,
          currentTransport:
            labels.transport.get(log.transportModeId) ?? '이름 없는 Transport',
          decision: '',
        }),
      ),
      historicalWalkRows: privateWalkRows,
    },
  }
}

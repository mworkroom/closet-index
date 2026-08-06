export const TRANSPORT_THERMAL_RANGE_PADDING_C = 2

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function logSignature(log) {
  return JSON.stringify([
    log.id,
    log.outfitId,
    log.wornOn,
    log.tempOut,
    log.tempBack,
    log.tempBackInferred,
    log.feelingOut,
    log.feelingBack,
    log.placeId,
    log.transportModeId,
  ])
}

function distinctWearLogs(logs) {
  const sorted = [...logs].sort((left, right) => {
    const id = compareText(left.id, right.id)
    return id !== 0 ? id : logSignature(left).localeCompare(logSignature(right))
  })
  const byId = new Map()
  for (const log of sorted) {
    if (log?.id && !byId.has(log.id)) byId.set(log.id, log)
  }
  return [...byId.values()]
}

function observationKey(observation) {
  return [
    observation.wearLogId,
    observation.endpoint,
    observation.temperature,
    observation.feeling,
  ].join('|')
}

function compareObservations(left, right) {
  if (left.temperature !== right.temperature) {
    return left.temperature - right.temperature
  }
  const log = compareText(left.wearLogId, right.wearLogId)
  if (log !== 0) return log
  return compareText(left.endpoint, right.endpoint)
}

export function transportThermalObservations(
  logs,
  { includeInferredReturnObservations = true } = {},
) {
  const observations = []

  for (const log of distinctWearLogs(logs)) {
    const perLog = []
    if (log.tempOut !== null && log.feelingOut) {
      perLog.push({
        id: `${log.id}:out`,
        wearLogId: log.id,
        endpoint: 'out',
        temperature: log.tempOut,
        feeling: log.feelingOut,
        transportModeId: log.transportModeId ?? null,
        placeId: log.placeId ?? null,
        wornOn: log.wornOn,
        inferredReturn: false,
      })
    }

    if (
      log.tempBack !== null &&
      log.feelingBack &&
      (includeInferredReturnObservations || !log.tempBackInferred)
    ) {
      const duplicate = perLog.some(
        (entry) =>
          entry.temperature === log.tempBack &&
          entry.feeling === log.feelingBack,
      )
      if (!duplicate) {
        perLog.push({
          id: `${log.id}:back`,
          wearLogId: log.id,
          endpoint: 'back',
          temperature: log.tempBack,
          feeling: log.feelingBack,
          transportModeId: log.transportModeId ?? null,
          placeId: log.placeId ?? null,
          wornOn: log.wornOn,
          inferredReturn: Boolean(log.tempBackInferred),
        })
      }
    }

    observations.push(...perLog)
  }

  return observations.sort(compareObservations)
}

function summarizeObservations(observations, targetTemp) {
  const sorted = [...observations].sort(compareObservations)
  const rawOkTemperatures = sorted
    .filter((entry) => entry.feeling === 'ok')
    .map((entry) => entry.temperature)
  const coldObservationTemperatures = sorted
    .filter((entry) => entry.feeling === 'cold')
    .map((entry) => entry.temperature)
  const hotObservationTemperatures = sorted
    .filter((entry) => entry.feeling === 'hot')
    .map((entry) => entry.temperature)
  const rawOkMinimum =
    rawOkTemperatures.length > 0 ? Math.min(...rawOkTemperatures) : null
  const rawOkMaximum =
    rawOkTemperatures.length > 0 ? Math.max(...rawOkTemperatures) : null
  const matchedWearLogIds = [
    ...new Set(sorted.map((entry) => entry.wearLogId)),
  ].sort(compareText)
  const latestMatchedWornOn =
    sorted
      .map((entry) => entry.wornOn)
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  const rawOkRange =
    rawOkMinimum === null || rawOkMaximum === null
      ? null
      : { min: rawOkMinimum, max: rawOkMaximum }
  const expandedOkRange = rawOkRange
    ? {
        min: rawOkRange.min - TRANSPORT_THERMAL_RANGE_PADDING_C,
        max: rawOkRange.max + TRANSPORT_THERMAL_RANGE_PADDING_C,
      }
    : null

  return {
    observations: sorted,
    rawOkTemperatures,
    rawOkMinimum,
    rawOkMaximum,
    rawOkRange,
    expandedOkRange,
    coldObservations: sorted.filter((entry) => entry.feeling === 'cold'),
    hotObservations: sorted.filter((entry) => entry.feeling === 'hot'),
    coldObservationTemperatures,
    hotObservationTemperatures,
    matchedWearLogIds,
    observationCount: sorted.length,
    distinctWearLogCount: matchedWearLogIds.length,
    latestMatchedWornOn,
    inferredReturnEndpointCount: sorted.filter(
      (entry) => entry.inferredReturn,
    ).length,
    targetWithinRange: rangeContains(expandedOkRange, targetTemp),
    sourcePlaceIds: [
      ...new Set(sorted.map((entry) => entry.placeId).filter(Boolean)),
    ].sort(compareText),
    sourceTransportIds: [
      ...new Set(
        sorted.map((entry) => entry.transportModeId).filter(Boolean),
      ),
    ].sort(compareText),
  }
}

function rangeContains(range, temperature) {
  return Boolean(
    range && temperature >= range.min && temperature <= range.max,
  )
}

function warningSources(observations, endpointTemperatures, kind) {
  const sourceIds = new Set()
  for (const observation of observations) {
    if (observation.feeling !== kind) continue
    const matches = endpointTemperatures.some((temperature) =>
      kind === 'cold'
        ? temperature <= observation.temperature
        : temperature >= observation.temperature,
    )
    if (matches) sourceIds.add(observation.wearLogId)
  }
  return [...sourceIds].sort(compareText)
}

function warningEvidence(
  overallObservations,
  currentObservations,
  otherObservations,
  nullObservations,
  endpointTemperatures,
  kind,
) {
  const overallSourceWearLogIds = warningSources(
    overallObservations,
    endpointTemperatures,
    kind,
  )
  const currentTransportSourceWearLogIds = warningSources(
    currentObservations,
    endpointTemperatures,
    kind,
  )
  const otherTransportSourceWearLogIds = warningSources(
    otherObservations,
    endpointTemperatures,
    kind,
  )
  const nullTransportSourceWearLogIds = warningSources(
    nullObservations,
    endpointTemperatures,
    kind,
  )

  return {
    overall: overallSourceWearLogIds.length > 0,
    currentTransport: currentTransportSourceWearLogIds.length > 0,
    otherTransport: otherTransportSourceWearLogIds.length > 0,
    nullTransport: nullTransportSourceWearLogIds.length > 0,
    overallSourceWearLogIds,
    currentTransportSourceWearLogIds,
    otherTransportSourceWearLogIds,
    nullTransportSourceWearLogIds,
    onlyOtherTransport:
      overallSourceWearLogIds.length > 0 &&
      currentTransportSourceWearLogIds.length === 0 &&
      otherTransportSourceWearLogIds.length > 0 &&
      nullTransportSourceWearLogIds.length === 0,
  }
}

export function calculateTransportThermalEvidence(
  logs,
  input,
  { includeInferredReturnObservations = true } = {},
) {
  const outfitLogs = distinctWearLogs(logs).filter(
    (log) => log.outfitId === input.outfitId,
  )
  const observations = transportThermalObservations(outfitLogs, {
    includeInferredReturnObservations,
  })
  const targetTemp =
    (input.tempOut + (input.tempBack ?? input.tempOut)) / 2
  const currentTransportEnabled = input.transportModeId !== null
  const currentPlaceEnabled =
    input.placeId !== null && input.placeId !== undefined
  const currentObservations = currentTransportEnabled
    ? observations.filter(
        (entry) => entry.transportModeId === input.transportModeId,
      )
    : []
  const otherTransportIds = [
    ...new Set(
      observations
        .map((entry) => entry.transportModeId)
        .filter(
          (transportModeId) =>
            transportModeId !== null &&
            transportModeId !== input.transportModeId,
        ),
    ),
  ].sort(compareText)
  const otherTransports = otherTransportIds.map((transportModeId) => ({
    transportModeId,
    evidence: summarizeObservations(
      observations.filter(
        (entry) => entry.transportModeId === transportModeId,
      ),
      targetTemp,
    ),
  }))
  const otherObservations = otherTransports.flatMap(
    (entry) => entry.evidence.observations,
  )
  const nullObservations = observations.filter(
    (entry) => entry.transportModeId === null,
  )
  const overall = summarizeObservations(observations, targetTemp)
  const currentTransport = currentTransportEnabled
    ? summarizeObservations(currentObservations, targetTemp)
    : null
  const currentPlace = currentPlaceEnabled
    ? summarizeObservations(
        observations.filter((entry) => entry.placeId === input.placeId),
        targetTemp,
      )
    : null
  const exactContext = currentPlaceEnabled && currentTransportEnabled
    ? summarizeObservations(
        observations.filter(
          (entry) =>
            entry.placeId === input.placeId &&
            entry.transportModeId === input.transportModeId,
        ),
        targetTemp,
      )
    : null
  const nullTransport = summarizeObservations(nullObservations, targetTemp)
  const targetWithinOverallOkRange = rangeContains(
    overall.expandedOkRange,
    targetTemp,
  )
  const targetWithinCurrentTransportOkRange = currentTransport
    ? rangeContains(currentTransport.expandedOkRange, targetTemp)
    : null
  const supportingOtherTransport = otherTransports.some((entry) =>
    rangeContains(entry.evidence.expandedOkRange, targetTemp),
  )
  const supportedByNullTransport = rangeContains(
    nullTransport.expandedOkRange,
    targetTemp,
  )
  const overallHighEndpointBorrowedFromOtherTransport = Boolean(
    currentTransportEnabled &&
      overall.rawOkMaximum !== null &&
      (currentTransport?.rawOkMaximum === null ||
        currentTransport.rawOkMaximum < overall.rawOkMaximum) &&
      otherTransports.some(
        (entry) => entry.evidence.rawOkMaximum === overall.rawOkMaximum,
      ) &&
      nullTransport.rawOkMaximum !== overall.rawOkMaximum,
  )
  const overallLowEndpointBorrowedFromOtherTransport = Boolean(
    currentTransportEnabled &&
      overall.rawOkMinimum !== null &&
      (currentTransport?.rawOkMinimum === null ||
        currentTransport.rawOkMinimum > overall.rawOkMinimum) &&
      otherTransports.some(
        (entry) => entry.evidence.rawOkMinimum === overall.rawOkMinimum,
      ) &&
      nullTransport.rawOkMinimum !== overall.rawOkMinimum,
  )
  const endpointTemperatures = [input.tempOut, input.tempBack ?? input.tempOut]
  const coldWarning = warningEvidence(
    observations,
    currentObservations,
    otherObservations,
    nullObservations,
    endpointTemperatures,
    'cold',
  )
  const hotWarning = warningEvidence(
    observations,
    currentObservations,
    otherObservations,
    nullObservations,
    endpointTemperatures,
    'hot',
  )

  return {
    outfitId: input.outfitId,
    currentTransportModeId: input.transportModeId,
    includeInferredReturnObservations,
    targetTemp,
    overall,
    currentTransport,
    currentPlace,
    exactContext,
    otherTransports,
    nullTransport,
    targetWithinOverallOkRange,
    targetWithinCurrentTransportOkRange,
    overallSupportOnlyFromOtherTransport:
      currentTransportEnabled &&
      targetWithinOverallOkRange &&
      targetWithinCurrentTransportOkRange === false &&
      supportingOtherTransport &&
      !supportedByNullTransport,
    overallHighEndpointBorrowedFromOtherTransport,
    overallLowEndpointBorrowedFromOtherTransport,
    coldWarningSupportedByCurrentTransport: coldWarning.currentTransport,
    hotWarningSupportedByCurrentTransport: hotWarning.currentTransport,
    warningWouldComeOnlyFromOtherTransport:
      coldWarning.onlyOtherTransport || hotWarning.onlyOtherTransport,
    warnings: {
      cold: coldWarning,
      hot: hotWarning,
    },
  }
}

export function calculateTransportThermalSensitivity(logs, input) {
  return {
    baselineCompatible: calculateTransportThermalEvidence(logs, input, {
      includeInferredReturnObservations: true,
    }),
    higherConfidence: calculateTransportThermalEvidence(logs, input, {
      includeInferredReturnObservations: false,
    }),
  }
}

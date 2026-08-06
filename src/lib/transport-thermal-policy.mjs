export const TRANSPORT_THERMAL_POLICIES = [
  'report-only',
  'weak-1-strong-2',
  'minimum-2',
  'exact-context-only',
]

const levelRank = {
  high: 0,
  possible: 1,
  caution: 2,
}

function endpointTemperatures(input) {
  return [input.tempOut, input.tempBack ?? input.tempOut]
}

function scopeWarning(summary, input) {
  if (!summary) return false
  return summary.observations.some((observation) => {
    if (observation.feeling === 'cold') {
      return endpointTemperatures(input).some(
        (temperature) => temperature <= observation.temperature,
      )
    }
    if (observation.feeling === 'hot') {
      return endpointTemperatures(input).some(
        (temperature) => temperature >= observation.temperature,
      )
    }
    return false
  })
}

function factualStatus(evidence) {
  const currentCount = evidence.currentTransport?.distinctWearLogCount ?? 0
  if (currentCount === 0) return 'unknown'
  if (
    evidence.coldWarningSupportedByCurrentTransport ||
    evidence.hotWarningSupportedByCurrentTransport
  ) {
    return 'current-warning'
  }
  if (evidence.currentTransport?.targetWithinRange) return 'supported'
  if (evidence.overallSupportOnlyFromOtherTransport) return 'borrowed-only'
  return 'unsupported'
}

function decision(policy, evidence, input) {
  const status = factualStatus(evidence)
  const currentCount = evidence.currentTransport?.distinctWearLogCount ?? 0
  const exactCount = evidence.exactContext?.distinctWearLogCount ?? 0
  const exactSupported = Boolean(evidence.exactContext?.targetWithinRange)
  const exactWarning = scopeWarning(evidence.exactContext, input)

  if (policy === 'report-only') {
    return {
      policy,
      status,
      confidence: 'report-only',
      rankAdjustment: 0,
      affected: false,
    }
  }

  if (policy === 'weak-1-strong-2') {
    if (currentCount === 0) {
      return {
        policy,
        status: 'unknown',
        confidence: 'unknown',
        rankAdjustment: 0,
        affected: false,
      }
    }
    if (status === 'current-warning') {
      return {
        policy,
        status,
        confidence: currentCount >= 2 ? 'transport-strong' : 'transport-weak',
        rankAdjustment: 0,
        affected: false,
      }
    }
    if (status === 'borrowed-only') {
      const rankAdjustment = currentCount >= 2 ? 2 : 1
      return {
        policy,
        status,
        confidence: currentCount >= 2 ? 'transport-strong' : 'transport-weak',
        rankAdjustment,
        affected: true,
      }
    }
    if (status === 'supported' && exactCount >= 2 && exactSupported) {
      return {
        policy,
        status,
        confidence: 'exact-strong',
        rankAdjustment: 0,
        affected: false,
      }
    }
    if (status === 'supported' && currentCount >= 2) {
      return {
        policy,
        status,
        confidence: 'transport-strong',
        rankAdjustment: 0,
        affected: false,
      }
    }
    return {
      policy,
      status,
      confidence: 'transport-weak',
      rankAdjustment: 0,
      affected: false,
    }
  }

  if (policy === 'minimum-2') {
    if (currentCount < 2) {
      return {
        policy,
        status,
        confidence: currentCount === 0 ? 'unknown' : 'informational',
        rankAdjustment: 0,
        affected: false,
      }
    }
    if (status === 'borrowed-only') {
      return {
        policy,
        status,
        confidence: 'transport-strong',
        rankAdjustment: 1,
        affected: true,
      }
    }
    if (status === 'current-warning') {
      return {
        policy,
        status,
        confidence: 'transport-strong',
        rankAdjustment: 0,
        affected: false,
      }
    }
    if (status === 'supported' && exactCount >= 2 && exactSupported) {
      return {
        policy,
        status,
        confidence: 'exact-strong',
        rankAdjustment: 0,
        affected: false,
      }
    }
    if (status === 'supported') {
      return {
        policy,
        status,
        confidence: 'transport-strong',
        rankAdjustment: 0,
        affected: false,
      }
    }
    return {
      policy,
      status,
      confidence: 'transport-strong',
      rankAdjustment: 0,
      affected: false,
    }
  }

  if (exactCount < 2) {
    return {
      policy,
      status,
      confidence: exactCount === 0 ? 'unknown' : 'informational',
      rankAdjustment: 0,
      affected: false,
    }
  }
  if (exactWarning) {
    return {
      policy,
      status: 'exact-warning',
      confidence: 'exact-strong',
      rankAdjustment: 0,
      affected: false,
    }
  }
  if (exactSupported) {
    return {
      policy,
      status: 'supported',
      confidence: 'exact-strong',
      rankAdjustment: 0,
      affected: false,
    }
  }
  if (evidence.overall.targetWithinRange) {
    return {
      policy,
      status: 'borrowed-only',
      confidence: 'exact-strong',
      rankAdjustment: 1,
      affected: true,
    }
  }
  return {
    policy,
    status: 'unsupported',
    confidence: 'exact-strong',
    rankAdjustment: 0,
    affected: false,
  }
}

export function evaluateTransportThermalPolicy(policy, evidence, input) {
  if (!TRANSPORT_THERMAL_POLICIES.includes(policy)) {
    throw new Error(`Unknown Transport thermal policy: ${policy}`)
  }
  return decision(policy, evidence, input)
}

export function simulateTransportThermalPolicy(policy, candidates, input) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      warnings: [...(candidate.warnings ?? [])],
      policyDecision: evaluateTransportThermalPolicy(
        policy,
        candidate.evidence,
        input,
      ),
    }))
    .sort((left, right) => {
      const level = levelRank[left.level] - levelRank[right.level]
      if (level !== 0) return level
      const policyRank =
        left.policyDecision.rankAdjustment -
        right.policyDecision.rankAdjustment
      if (policyRank !== 0) return policyRank
      if (left.baselineOrder !== right.baselineOrder) {
        return left.baselineOrder - right.baselineOrder
      }
      return left.id.localeCompare(right.id)
    })
}

import { describe, expect, it } from 'vitest'
import {
  LEGACY_WALK_TRANSPORT_LABEL,
  WALK_SHORT_TRANSPORT_LABEL,
  WALK_SUSTAINED_TRANSPORT_LABEL,
  isLegacyWalkTransportId,
  transportOptionsForSelection,
} from './transport-options'

const modes = [
  { id: 'transport-bus', name: '버스' },
  { id: 'transport-walk-legacy', name: '도보' },
  { id: 'transport-car', name: '차' },
  { id: 'transport-walk-sustained', name: WALK_SUSTAINED_TRANSPORT_LABEL },
  { id: 'transport-subway', name: '지하철' },
  { id: 'transport-walk-short', name: WALK_SHORT_TRANSPORT_LABEL },
]

describe('Transport selection options', () => {
  it('orders the approved taxonomy before unchanged Car, Subway, and Bus options', () => {
    expect(transportOptionsForSelection(modes).map((mode) => mode.name)).toEqual([
      WALK_SHORT_TRANSPORT_LABEL,
      WALK_SUSTAINED_TRANSPORT_LABEL,
      '차',
      '지하철',
      '버스',
    ])
  })

  it('shows a legacy Walk option only while editing a record that already uses it', () => {
    expect(
      transportOptionsForSelection(modes, 'transport-walk-legacy').map(
        (mode) => [mode.id, mode.name],
      ),
    ).toContainEqual([
      'transport-walk-legacy',
      LEGACY_WALK_TRANSPORT_LABEL,
    ])
    expect(transportOptionsForSelection(modes)).not.toContainEqual(
      expect.objectContaining({ id: 'transport-walk-legacy' }),
    )
    expect(isLegacyWalkTransportId(modes, 'transport-walk-legacy')).toBe(true)
    expect(isLegacyWalkTransportId(modes, 'transport-walk-sustained')).toBe(false)
  })
})

import type { AppData, Item, Outfit, WearLog } from '../types'

const baseItem: Item = {
  id: 'item-core',
  name: '기준 코어 Item',
  category: 'Top-Shirts',
  semanticColor: 'Navy',
  displayHex: '#223047',
  seasons: ['Spring', 'Summer', 'Fall', 'Winter'],
  retired: false,
  rainOk: true,
  longWalkOk: true,
  memo: null,
  acquiredOn: null,
}

const baseBottom: Item = {
  ...baseItem,
  id: 'item-core-bottom',
  name: '기준 하의 Item',
  category: 'Bottom-Pants',
}

const baseShoes: Item = {
  ...baseItem,
  id: 'item-core-shoes',
  name: '기준 신발 Item',
  category: 'Shoes',
}

export function phase5BaselineOutfit(
  id: string,
  rating: Outfit['rating'],
): Outfit {
  return {
    id,
    displayName: id,
    rating,
    itemIds: [baseItem.id, baseBottom.id, baseShoes.id],
  }
}

export function phase5BaselineWearLog(
  id: string,
  outfitId: string,
  wornOn: string,
  overrides: Partial<WearLog> = {},
): WearLog {
  return {
    id,
    outfitId,
    wornOn,
    tempOut: 20,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: 'ok',
    feelingBack: null,
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId: 'place-a',
    transportModeId: 'transport-a',
    observedHvacMode: 'off',
    observedHvacIntensity: null,
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: `submission-${id}`,
    createdAt: `${wornOn}T12:00:00+09:00`,
    ...overrides,
  }
}

export const phase5RecommendationBaselineFixture: AppData = {
  items: [baseItem, baseBottom, baseShoes],
  outfits: [
    phase5BaselineOutfit('outfit-unrated', null),
    phase5BaselineOutfit('outfit-ok-one', 'ok'),
    phase5BaselineOutfit('outfit-ok-recent', 'ok'),
    phase5BaselineOutfit('outfit-error', 'error'),
    phase5BaselineOutfit('outfit-ok-many', 'ok'),
    phase5BaselineOutfit('outfit-favorite', 'favorite'),
  ],
  wearLogs: [
    phase5BaselineWearLog(
      'favorite-1',
      'outfit-favorite',
      '2026-01-10',
      {
        tempBack: 20,
        tempBackInferred: true,
        feelingBack: 'ok',
      },
    ),
    phase5BaselineWearLog('many-1', 'outfit-ok-many', '2026-04-01'),
    phase5BaselineWearLog('many-2', 'outfit-ok-many', '2026-03-01', {
      tempOut: null,
      feelingOut: 'ok',
      placeId: 'place-a',
      transportModeId: null,
    }),
    phase5BaselineWearLog('many-3', 'outfit-ok-many', '2026-02-01', {
      tempBack: 20,
      tempBackInferred: true,
      feelingBack: 'ok',
      placeId: null,
      transportModeId: 'transport-a',
    }),
    phase5BaselineWearLog('recent-1', 'outfit-ok-recent', '2026-06-01', {
      placeId: null,
      transportModeId: null,
    }),
    phase5BaselineWearLog('recent-2', 'outfit-ok-recent', '2026-05-01'),
    phase5BaselineWearLog('one-1', 'outfit-ok-one', '2026-07-01', {
      transportModeId: null,
    }),
    ...['04', '03', '02', '01'].map((month) =>
      phase5BaselineWearLog(
        `unrated-${month}`,
        'outfit-unrated',
        `2026-${month}-15`,
        { placeId: 'place-b', transportModeId: 'transport-b' },
      ),
    ),
    phase5BaselineWearLog('error-1', 'outfit-error', '2026-08-01'),
  ],
  places: [
    { id: 'place-a', name: '장소 A', kind: 'specific_venue' },
    { id: 'place-b', name: '장소 B', kind: 'specific_venue' },
  ],
  placeHvacProfiles: [],
  transportModes: [
    { id: 'transport-a', name: '교통 A' },
    { id: 'transport-b', name: '교통 B' },
  ],
}

export const phase5BaselineExpectedResults = [
  {
    id: 'outfit-favorite',
    level: 'high',
    reasons: [
      '18~22°C 적정 범위 · OK 1회',
      '같은 장소에서 1회 착용',
      '같은 교통수단으로 1회 착용',
      '마지막 착용 2026-01-10',
    ],
    warnings: [],
    okRange: { min: 18, max: 22 },
    okObservationCount: 1,
    wearCount: 1,
    lastWornOn: '2026-01-10',
  },
  {
    id: 'outfit-ok-many',
    level: 'high',
    reasons: [
      '18~22°C 적정 범위 · OK 2회',
      '같은 장소에서 2회 착용',
      '같은 교통수단으로 2회 착용',
      '마지막 착용 2026-04-01',
    ],
    warnings: [],
    okRange: { min: 18, max: 22 },
    okObservationCount: 2,
    wearCount: 3,
    lastWornOn: '2026-04-01',
  },
  {
    id: 'outfit-ok-recent',
    level: 'high',
    reasons: [
      '18~22°C 적정 범위 · OK 2회',
      '같은 장소에서 1회 착용',
      '같은 교통수단으로 1회 착용',
      '마지막 착용 2026-06-01',
    ],
    warnings: [],
    okRange: { min: 18, max: 22 },
    okObservationCount: 2,
    wearCount: 2,
    lastWornOn: '2026-06-01',
  },
  {
    id: 'outfit-ok-one',
    level: 'high',
    reasons: [
      '18~22°C 적정 범위 · OK 1회',
      '같은 장소에서 1회 착용',
      '마지막 착용 2026-07-01',
    ],
    warnings: [],
    okRange: { min: 18, max: 22 },
    okObservationCount: 1,
    wearCount: 1,
    lastWornOn: '2026-07-01',
  },
  {
    id: 'outfit-unrated',
    level: 'high',
    reasons: [
      '18~22°C 적정 범위 · OK 4회',
      '마지막 착용 2026-04-15',
    ],
    warnings: [],
    okRange: { min: 18, max: 22 },
    okObservationCount: 4,
    wearCount: 4,
    lastWornOn: '2026-04-15',
  },
] as const

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import type { RecommendationNavigationState } from '../lib/navigation'
import {
  LEGACY_WALK_TRANSPORT_LABEL,
  WALK_SHORT_TRANSPORT_LABEL,
  WALK_SUSTAINED_TRANSPORT_LABEL,
} from '../lib/transport-options'
import { WearLogPage } from './WearLogPage'

function renderWearLog(state: RecommendationNavigationState) {
  const repository = new DemoRepository()
  const createWearLog = vi.spyOn(repository, 'createWearLog')

  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/wear/outfit-favorite',
          state,
        },
      ]}
    >
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/wear/:outfitId" element={<WearLogPage />} />
          <Route path="/calendar" element={<div>calendar</div>} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )

  return createWearLog
}

const approvedTransportModes = [
  { id: 'transport-walk-short', name: WALK_SHORT_TRANSPORT_LABEL },
  { id: 'transport-walk-sustained', name: WALK_SUSTAINED_TRANSPORT_LABEL },
  { id: 'transport-walk', name: '도보' },
  { id: 'transport-car', name: '차' },
  { id: 'transport-subway', name: '지하철' },
  { id: 'transport-bus', name: '버스' },
]

async function repositoryWithApprovedTransportModes() {
  const repository = new DemoRepository()
  const data = await repository.load()
  data.transportModes = approvedTransportModes
  vi.spyOn(repository, 'load').mockResolvedValue(data)
  return repository
}

function renderWearLogRoute(
  repository: DemoRepository,
  pathname: string,
  state: RecommendationNavigationState = {},
) {
  render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/wear/:outfitId" element={<WearLogPage />} />
          <Route path="/records/:logId/edit" element={<WearLogPage />} />
          <Route path="/calendar" element={<div>calendar</div>} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

const recommendationInput = {
  tempOut: 24,
  tempBack: 20,
  rainCondition: 'no' as const,
  longWalkCondition: 'no' as const,
  placeId: null,
  transportModeId: null,
}

describe('WearLogPage weather provenance', () => {
  afterEach(() => {
    cleanup()
  })

  it('적용한 예보값을 수정하지 않으면 원본 예보 출처로 저장한다', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    const createWearLog = renderWearLog({
      input: recommendationInput,
      weather: {
        locationId: 'weather-location-chang-4-dong',
        issuedAt: '2026-07-29T05:00:00+09:00',
        tempOut: 24,
        tempBack: 20,
        rainCondition: 'no',
        overridden: false,
      },
    })

    expect(await screen.findByText('기상청 예보')).toBeVisible()
    expect(screen.getByText(/창4동/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({
        temperatureSource: 'weather',
        weatherLocationId: 'weather-location-chang-4-dong',
        weatherIssuedAt: '2026-07-29T05:00:00+09:00',
        weatherOverridden: false,
      }),
    )
  })

  it('예보 온도를 기록 화면에서 바꾸면 직접 수정으로 표시하고 저장한다', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    const createWearLog = renderWearLog({
      input: recommendationInput,
      weather: {
        locationId: 'weather-location-chang-4-dong',
        issuedAt: '2026-07-29T05:00:00+09:00',
        tempOut: 24,
        tempBack: 20,
        rainCondition: 'no',
        overridden: false,
      },
    })

    const departure = await screen.findByRole('spinbutton', {
      name: /출발 온도/,
    })
    await waitFor(() => expect(departure).toHaveValue(24))
    fireEvent.change(departure, { target: { value: '23' } })

    expect(screen.getByText('기상청 예보에서 직접 수정')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tempOut: 23,
        temperatureSource: 'weather',
        weatherOverridden: true,
      }),
    )
  })

  it('예보 출처가 없으면 직접 입력으로 저장한다', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    const createWearLog = renderWearLog({ input: recommendationInput })

    expect(await screen.findByText('직접 입력')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({
        temperatureSource: 'manual',
        weatherLocationId: null,
        weatherIssuedAt: null,
        weatherOverridden: false,
      }),
    )
  })
})

describe('WearLogPage Transport taxonomy', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it.each([
    ['walk_short', 'transport-walk-short', WALK_SHORT_TRANSPORT_LABEL],
    ['walk_sustained', 'transport-walk-sustained', WALK_SUSTAINED_TRANSPORT_LABEL],
  ])('new Wear Log can select %s', async (_concept, transportId, label) => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const createWearLog = vi.spyOn(repository, 'createWearLog')
    renderWearLogRoute(repository, '/wear/outfit-favorite', {
      input: recommendationInput,
    })

    const transport = await screen.findByRole('combobox', { name: '교통수단' })
    await user.selectOptions(transport, transportId)
    expect(screen.getByRole('option', { name: label })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({ transportModeId: transportId }),
    )
  })

  it('does not default a new Wear Log to legacy Walk from navigation state', async () => {
    const repository = await repositoryWithApprovedTransportModes()
    renderWearLogRoute(repository, '/wear/outfit-favorite', {
      input: { ...recommendationInput, transportModeId: 'transport-walk' },
    })

    const transport = await screen.findByRole('combobox', { name: '교통수단' })
    await waitFor(() => expect(transport).toHaveValue(''))
    expect(
      screen.queryByRole('option', { name: LEGACY_WALK_TRANSPORT_LABEL }),
    ).not.toBeInTheDocument()
  })

  it('shows legacy Walk while editing and preserves its original ID when another field changes', async () => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const updateWearLog = vi.spyOn(repository, 'updateWearLog')
    renderWearLogRoute(repository, '/records/log-3/edit')

    const transport = await screen.findByRole('combobox', { name: '교통수단' })
    await waitFor(() => expect(transport).toHaveValue('transport-walk'))
    expect(
      screen.getByRole('option', { name: LEGACY_WALK_TRANSPORT_LABEL }),
    ).toBeVisible()
    await user.type(screen.getByRole('textbox', { name: '메모' }), '확인')
    await user.click(screen.getByRole('button', { name: '수정 저장' }))

    expect(updateWearLog).toHaveBeenCalledWith(
      'log-3',
      expect.objectContaining({
        memo: '확인',
        transportModeId: 'transport-walk',
      }),
    )
  })

  it.each([
    ['short', 'transport-walk-short'],
    ['sustained', 'transport-walk-sustained'],
  ])('editing legacy Walk can convert to %s', async (_concept, transportId) => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const updateWearLog = vi.spyOn(repository, 'updateWearLog')
    renderWearLogRoute(repository, '/records/log-3/edit')

    const transport = await screen.findByRole('combobox', { name: '교통수단' })
    await user.selectOptions(transport, transportId)
    await user.click(screen.getByRole('button', { name: '수정 저장' }))

    expect(updateWearLog).toHaveBeenCalledWith(
      'log-3',
      expect.objectContaining({ transportModeId: transportId }),
    )
  })

  it('keeps longWalkCondition independent from Transport selection', async () => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const createWearLog = vi.spyOn(repository, 'createWearLog')
    renderWearLogRoute(repository, '/wear/outfit-favorite', {
      input: recommendationInput,
    })

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '교통수단' }),
      'transport-walk-short',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: '오래 걷기' }), 'yes')
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({
        transportModeId: 'transport-walk-short',
        longWalkCondition: 'yes',
      }),
    )
  })

  it.each([
    ['Car', 'transport-car'],
    ['Subway', 'transport-subway'],
    ['Bus', 'transport-bus'],
  ])('preserves existing %s create behavior', async (_label, transportId) => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const createWearLog = vi.spyOn(repository, 'createWearLog')
    renderWearLogRoute(repository, '/wear/outfit-favorite', {
      input: recommendationInput,
    })

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '교통수단' }),
      transportId,
    )
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({ transportModeId: transportId }),
    )
  })

  it.each([
    ['Car', 'transport-car'],
    ['Subway', 'transport-subway'],
    ['Bus', 'transport-bus'],
  ])('preserves existing %s edit behavior', async (_label, transportId) => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const updateWearLog = vi.spyOn(repository, 'updateWearLog')
    renderWearLogRoute(repository, '/records/log-3/edit')

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '교통수단' }),
      transportId,
    )
    await user.click(screen.getByRole('button', { name: '수정 저장' }))

    expect(updateWearLog).toHaveBeenCalledWith(
      'log-3',
      expect.objectContaining({ transportModeId: transportId }),
    )
  })
})

describe('WearLogPage HVAC observation', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('starts at off with no intensity and saves that explicit observation', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const createWearLog = vi.spyOn(repository, 'createWearLog')
    renderWearLogRoute(repository, '/wear/outfit-favorite', {
      input: recommendationInput,
    })

    const mode = await screen.findByRole('combobox', { name: '냉난방' })
    const intensity = screen.getByRole('combobox', { name: '강도' })
    expect(mode).toHaveValue('off')
    expect(intensity).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({
        observedHvacMode: 'off',
        observedHvacIntensity: null,
        observedHvacMemo: null,
      }),
    )
  })

  it('defaults cooling to normal and saves a manually selected strong observation', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const createWearLog = vi.spyOn(repository, 'createWearLog')
    renderWearLogRoute(repository, '/wear/outfit-favorite', {
      input: recommendationInput,
    })

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '냉난방' }),
      'cooling',
    )
    const intensity = screen.getByRole('combobox', { name: '강도' })
    expect(intensity).toHaveValue('normal')
    await user.selectOptions(intensity, 'strong')
    await user.type(
      screen.getByRole('textbox', { name: 'HVAC 메모' }),
      '바람이 강함',
    )
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({
        observedHvacMode: 'cooling',
        observedHvacIntensity: 'strong',
        observedHvacMemo: '바람이 강함',
      }),
    )
  })
})

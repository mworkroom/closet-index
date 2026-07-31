import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import type { RecommendationNavigationState } from '../lib/navigation'
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

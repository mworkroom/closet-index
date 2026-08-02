import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { DemoRepository } from '../data/demo-repository'
import { HomePage } from './HomePage'
import { OutfitDetailPage } from './OutfitDetailPage'
import { WearLogPage } from './WearLogPage'

describe('Phase 2 weather recommendation flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('HOME에서 적용한 예보 출처를 착장 상세과 Wear Log 저장까지 보존한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const createWearLog = vi.spyOn(repository, 'createWearLog')

    render(
      <MemoryRouter initialEntries={['/']}>
        <SeasonScopeProvider>
          <DataProvider repository={repository}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/outfits/:outfitId"
                element={<OutfitDetailPage />}
              />
              <Route path="/wear/:outfitId" element={<WearLogPage />} />
              <Route path="/calendar" element={<div>calendar</div>} />
            </Routes>
          </DataProvider>
        </SeasonScopeProvider>
      </MemoryRouter>,
    )

    await screen.findByText('창4동')
    await user.click(screen.getByRole('button', { name: '날씨로 추천 보기' }))
    expect(await screen.findByText('24°C')).toBeVisible()

    const outfitLinks = await screen.findAllByRole('link', {
      name: /착장 상세 보기/,
    })
    await user.click(outfitLinks[0])

    expect(await screen.findByRole('heading', { name: '착장 상세' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '뒤로 가기' }))

    expect(
      await screen.findByRole('spinbutton', { name: /출발 온도/ }),
    ).toHaveValue(24)
    expect(screen.getByRole('spinbutton', { name: /귀가 온도/ })).toHaveValue(20)
    expect(screen.getByRole('heading', { name: '추천 착장' })).toBeVisible()

    const restoredOutfitLinks = screen.getAllByRole('link', {
      name: /착장 상세 보기/,
    })
    await user.click(restoredOutfitLinks[0])
    await user.click(screen.getByRole('link', { name: '오늘 입기' }))

    expect(await screen.findByText('기상청 예보')).toBeVisible()
    expect(screen.getByText(/창4동/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '착용 기록 저장' }))

    expect(createWearLog).toHaveBeenCalledWith(
      expect.objectContaining({
        temperatureSource: 'weather',
        weatherLocationId: 'weather-location-chang-4-dong',
        weatherIssuedAt: expect.stringContaining('T05:00:00+09:00'),
        weatherOverridden: false,
      }),
    )
    expect(await screen.findByText('calendar')).toBeVisible()
  })

  it('날씨 API 실패 뒤에도 수동 입력으로 추천을 계속한다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    vi.spyOn(repository, 'fetchWeatherForecast').mockRejectedValue(
      new Error('날씨 API가 응답하지 않았습니다.'),
    )

    render(
      <MemoryRouter initialEntries={['/']}>
        <SeasonScopeProvider>
          <DataProvider repository={repository}>
            <Routes>
              <Route path="/" element={<HomePage />} />
            </Routes>
          </DataProvider>
        </SeasonScopeProvider>
      </MemoryRouter>,
    )

    await screen.findByText('창4동')
    await user.click(screen.getByRole('button', { name: '날씨로 추천 보기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '날씨 API가 응답하지 않았습니다.',
    )
    expect(screen.getByText('직접 입력')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '착장 찾기' }))
    expect(
      await screen.findByRole('heading', { name: '추천 착장' }),
    ).toBeVisible()
  })
})

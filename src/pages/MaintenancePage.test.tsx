import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import type { AppData, Item, WearLog } from '../lib/types'
import { ItemDetailPage } from './ItemDetailPage'
import { LaundryPage, MaintenancePage } from './MaintenancePage'
import { MorePage } from './MorePage'

function item(id: string, options: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    category: 'Top-T-shirts',
    semanticColor: null,
    displayHex: '#222222',
    seasons: [],
    retired: false,
    rainOk: true,
    longWalkOk: true,
    memo: null,
    acquiredOn: null,
    ...options,
  }
}

function wearLog(id: string, outfitId: string, wornOn: string): WearLog {
  return {
    id,
    outfitId,
    wornOn,
    tempOut: null,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: null,
    feelingBack: null,
    rainCondition: 'unknown',
    longWalkCondition: 'unknown',
    placeId: null,
    transportModeId: null,
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: id,
    createdAt: `${wornOn}T00:00:00.000Z`,
  }
}

const maintenanceData: AppData = {
  items: [
    item('오래된 미착용 Item', { acquiredOn: '2020-01-01' }),
    item('날짜 없는 미착용 Item'),
    item('착용일이 오래된 Item'),
    item('제외할 속옷', { category: 'Innerwear' }),
    item('제외할 Retired', { retired: true }),
  ],
  outfits: [
    {
      id: '오래된-착장',
      displayName: null,
      rating: 'ok',
      itemIds: ['착용일이 오래된 Item'],
    },
  ],
  wearLogs: [wearLog('오래된-기록', '오래된-착장', '2020-02-01')],
  places: [],
  transportModes: [],
}

function renderMaintenanceFlow() {
  const repository = new DemoRepository()
  vi.spyOn(repository, 'load').mockResolvedValue(
    structuredClone(maintenanceData),
  )
  return render(
    <MemoryRouter initialEntries={['/more']}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/more" element={<MorePage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/laundry" element={<LaundryPage />} />
          <Route path="/closet/:itemId" element={<ItemDetailPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
}

describe('P6-4 Maintenance flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(cleanup)

  it('More에서 점검 목록으로 진입하고 오래된 기준일 순으로 보여준다', async () => {
    const user = userEvent.setup()
    renderMaintenanceFlow()

    await user.click(
      await screen.findByRole('link', { name: /Maintenance/ }),
    )
    const section = await screen.findByRole('region', { name: '점검' })
    const links = within(section).getAllByRole('link')

    expect(within(section).getByText('3개')).toBeInTheDocument()
    expect(links).toHaveLength(3)
    expect(links[0]).toHaveAccessibleName(
      '날짜 없는 미착용 Item 점검: 착용 기록 0회, Item 상세 보기',
    )
    expect(links[1]).toHaveAccessibleName(
      '오래된 미착용 Item 점검: 착용 기록 0회, Item 상세 보기',
    )
    expect(links[2]).toHaveAccessibleName(
      /착용일이 오래된 Item 점검: 마지막 착용/,
    )
    expect(within(section).queryByText('제외할 속옷')).not.toBeInTheDocument()
    expect(within(section).queryByText('제외할 Retired')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '교체' })).toHaveTextContent('0개')
    expect(screen.queryByRole('region', { name: '손세탁' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '드라이클리닝' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Maintenance' })).toBeInTheDocument()
    expect(screen.getByText('CLOSET UPKEEP')).toBeInTheDocument()
  })

  it('Laundry를 별도 페이지로 열고 세탁 관련 영역만 보여준다', async () => {
    const user = userEvent.setup()
    renderMaintenanceFlow()

    await user.click(await screen.findByRole('link', { name: /Laundry/ }))

    expect(screen.getByRole('heading', { name: 'Laundry' })).toBeInTheDocument()
    expect(screen.getByText('GARMENT CARE')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '손세탁' })).toHaveTextContent('0개')
    expect(screen.getByRole('region', { name: '드라이클리닝' })).toHaveTextContent('0개')
    expect(screen.queryByRole('region', { name: '점검' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '교체' })).not.toBeInTheDocument()
  })

  it('점검 카드에서 Item 상세로 이동해 같은 계산 근거를 본다', async () => {
    const user = userEvent.setup()
    renderMaintenanceFlow()
    await user.click(
      await screen.findByRole('link', { name: /Maintenance/ }),
    )
    await user.click(
      await screen.findByRole('link', {
        name: /오래된 미착용 Item 점검/,
      }),
    )

    expect(
      await screen.findByRole('heading', { name: '오래된 미착용 Item' }),
    ).toBeInTheDocument()
    const reason = screen.getByRole('region', { name: '점검 근거' })
    expect(within(reason).getByText('착용 기록 0회')).toBeInTheDocument()
  })

  it('사건 조회 실패를 대상 0개로 표시하지 않고 별도 오류로 보여준다', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    vi.spyOn(repository, 'load').mockResolvedValue(structuredClone(maintenanceData))
    vi.spyOn(repository.care, 'loadForItems').mockRejectedValue(
      new Error('CareEvent 조회 실패'),
    )
    render(
      <MemoryRouter initialEntries={['/more']}>
        <DataProvider repository={repository}>
          <Routes>
            <Route path="/more" element={<MorePage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
          </Routes>
        </DataProvider>
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('link', { name: /Maintenance/ }))
    expect(
      await screen.findByText(/관리 사건을 불러오지 못했습니다: CareEvent 조회 실패/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '손세탁' })).not.toBeInTheDocument()
  })
})

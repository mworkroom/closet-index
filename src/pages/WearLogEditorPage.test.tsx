import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import {
  LEGACY_WALK_TRANSPORT_LABEL,
  WALK_SHORT_TRANSPORT_LABEL,
  WALK_SUSTAINED_TRANSPORT_LABEL,
} from '../lib/transport-options'
import { WearLogEditorPage } from './WearLogEditorPage'

function renderEditor(repository = new DemoRepository()) {
  render(
    <MemoryRouter initialEntries={['/tools/wear-log']}>
      <DataProvider repository={repository}>
        <Routes>
          <Route path="/tools/wear-log" element={<WearLogEditorPage />} />
        </Routes>
      </DataProvider>
    </MemoryRouter>,
  )
  return repository
}

async function repositoryWithApprovedTransportModes() {
  const repository = new DemoRepository()
  const data = await repository.load()
  data.transportModes = [
    { id: 'transport-walk-short', name: WALK_SHORT_TRANSPORT_LABEL },
    { id: 'transport-walk-sustained', name: WALK_SUSTAINED_TRANSPORT_LABEL },
    { id: 'transport-walk', name: '도보' },
    { id: 'transport-car', name: '차' },
    { id: 'transport-subway', name: '지하철' },
    { id: 'transport-bus', name: '버스' },
  ]
  vi.spyOn(repository, 'load').mockResolvedValue(data)
  return repository
}

describe('WearLogEditorPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('filters Walk records and marks an inline edit as pending until discarded', async () => {
    const user = userEvent.setup()
    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Wear Logs' })).toBeVisible()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Walk 필터' }), 'walk')
    expect(screen.getByText('1 / 4건')).toBeVisible()

    const transportCell = screen.getByTestId(
      'wear-log-cell-log-3-transportModeId',
    )
    const originalValue = (transportCell as HTMLSelectElement).value
    await user.selectOptions(transportCell, 'transport-car')

    expect(screen.getByText('미저장 1개 필드')).toBeVisible()
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(screen.getByText('저장하지 않은 변경을 모두 취소했습니다.')).toBeVisible()
    expect((screen.getByTestId('wear-log-cell-log-3-transportModeId') as HTMLSelectElement).value).toBe(
      originalValue,
    )
  })

  it('filters the visible rows by long-walk condition', async () => {
    const user = userEvent.setup()
    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Wear Logs' })).toBeVisible()
    await user.selectOptions(
      screen.getByRole('combobox', { name: '장거리 걷기 필터' }),
      'yes',
    )

    expect(screen.getByText('2 / 4건')).toBeVisible()
  })

  it('bulk edits selected rows and saves only the changed records', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const updateFields = vi.spyOn(repository, 'updateWearLogFields')
    renderEditor(repository)

    await screen.findByRole('heading', { name: 'Wear Logs' })
    const rowCheckboxes = screen.getAllByRole('checkbox').slice(1, 3)
    await user.click(rowCheckboxes[0])
    await user.click(rowCheckboxes[1])
    await user.selectOptions(screen.getByRole('combobox', { name: '일괄 편집 값' }), 'transport-car')
    await user.click(screen.getByRole('button', { name: '선택 행에 적용' }))

    expect(screen.getByText('미저장 2개 필드')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /변경 저장/ }))

    expect(await screen.findByText('2건 저장하고 최신 값을 다시 불러왔습니다.')).toBeVisible()
    expect(updateFields).toHaveBeenCalledTimes(2)
    expect(updateFields).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ transportModeId: 'transport-car' }),
    )
    expect(updateFields.mock.calls[0]?.[1]).not.toHaveProperty('wornOn')
    expect(updateFields.mock.calls[0]?.[1]).not.toHaveProperty('tempOut')
  })

  it('keeps a failed row pending and identifies the failed record', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    vi.spyOn(repository, 'updateWearLogFields').mockRejectedValueOnce(
      new Error('permission denied'),
    )
    renderEditor(repository)

    await screen.findByRole('heading', { name: 'Wear Logs' })
    await user.click(screen.getAllByRole('checkbox')[1])
    await user.selectOptions(screen.getByRole('combobox', { name: '일괄 편집 값' }), 'transport-car')
    await user.click(screen.getByRole('button', { name: '선택 행에 적용' }))
    await user.click(screen.getByRole('button', { name: /변경 저장/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied')
    expect(screen.getByText(/1건 실패/)).toBeVisible()
    expect(screen.getByText('미저장 1개 필드')).toBeVisible()
  })

  it('shows legacy Walk only on its existing row and does not force conversion when another field changes', async () => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const updateFields = vi.spyOn(repository, 'updateWearLogFields')
    renderEditor(repository)

    await screen.findByRole('heading', { name: 'Wear Logs' })
    const transportCell = screen.getByTestId(
      'wear-log-cell-log-3-transportModeId',
    )
    expect(transportCell).toHaveValue('transport-walk')
    expect(
      screen.getByRole('option', { name: LEGACY_WALK_TRANSPORT_LABEL }),
    ).toBeVisible()

    await user.type(screen.getByTestId('wear-log-cell-log-3-memo'), '검토')
    await user.click(screen.getByRole('button', { name: /변경 저장/ }))

    expect(updateFields).toHaveBeenCalledWith('log-3', { memo: '검토' })
    expect(updateFields.mock.calls[0]?.[1]).not.toHaveProperty('transportModeId')
  })

  it.each([
    ['short', 'transport-walk-short'],
    ['sustained', 'transport-walk-sustained'],
  ])('can convert a legacy row to %s with the selected ID', async (_concept, transportId) => {
    const user = userEvent.setup()
    const repository = await repositoryWithApprovedTransportModes()
    const updateFields = vi.spyOn(repository, 'updateWearLogFields')
    renderEditor(repository)

    await screen.findByRole('heading', { name: 'Wear Logs' })
    await user.selectOptions(
      screen.getByTestId('wear-log-cell-log-3-transportModeId'),
      transportId,
    )
    await user.click(screen.getByRole('button', { name: /변경 저장/ }))

    expect(updateFields).toHaveBeenCalledWith('log-3', {
      transportModeId: transportId,
    })
  })
})

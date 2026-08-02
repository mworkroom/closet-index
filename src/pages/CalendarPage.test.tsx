import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { SeasonScopeProvider } from '../context/SeasonScopeContext'
import { demoData } from '../data/demo-data'
import { DemoRepository } from '../data/demo-repository'
import { CalendarPage } from './CalendarPage'

function renderCalendar(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SeasonScopeProvider>
        <DataProvider repository={new DemoRepository()}>
          <Routes>
            <Route path="/calendar" element={<CalendarPage />} />
          </Routes>
        </DataProvider>
      </SeasonScopeProvider>
    </MemoryRouter>,
  )
}

describe('Phase 3.5 Calendar', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows an English Monday-first month grid and opens a single Outfit directly', async () => {
    renderCalendar('/calendar?date=2026-04-12')

    const grid = await screen.findByRole('grid', { name: 'April 2026' })
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'MON',
      'TUE',
      'WED',
      'THU',
      'FRI',
      'SAT',
      'SUN',
    ])
    expect(screen.getByLabelText('Choose month')).toHaveValue('2026-04')
    expect(
      screen.getByRole('link', { name: /for Sunday, April 12, 2026/ }),
    ).toHaveAttribute('href', '/outfits/outfit-favorite')
    expect(
      within(grid).getByRole('gridcell', { name: 'Sunday, April 12, 2026' }),
    ).toHaveClass('calendar-cell--target')
  })

  it('moves by arrow and keeps adjacent-month cells free of Outfit links', async () => {
    const user = userEvent.setup()
    renderCalendar('/calendar?month=2026-04')
    await screen.findByRole('grid', { name: 'April 2026' })

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    const mayGrid = await screen.findByRole('grid', { name: 'May 2026' })
    const aprilCell = within(mayGrid).getByRole('gridcell', {
      name: 'Thursday, April 30, 2026',
    })
    expect(aprilCell).toHaveClass('calendar-cell--outside')
    expect(within(aprilCell).queryByRole('link')).not.toBeInTheDocument()
  })

  it('opens an English chooser sheet only when a date has multiple Outfits', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(
      'closet-index-demo-data-v3',
      JSON.stringify({
        ...structuredClone(demoData),
        wearLogs: [
          ...structuredClone(demoData.wearLogs),
          {
            ...structuredClone(demoData.wearLogs[0]),
            id: 'log-second-outfit',
            outfitId: 'outfit-summer',
            submissionToken: 'calendar-multiple-test',
            createdAt: '2026-04-12T18:00:00+09:00',
          },
        ],
      }),
    )
    renderCalendar('/calendar?date=2026-04-12')

    const trigger = await screen.findByRole('button', {
      name: 'Choose from 2 outfits for Sunday, April 12, 2026',
    })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', {
      name: 'Sunday, April 12, 2026',
    })
    expect(within(dialog).getByText('2 OUTFITS')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('link')).toHaveLength(2)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

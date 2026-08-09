import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '../context/DataContext'
import { DemoRepository } from '../data/demo-repository'
import { PlaceHvacProfilesPage } from './PlaceHvacProfilesPage'

describe('PlaceHvacProfilesPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('excludes 기타 and saves a seasonal specific-venue profile', async () => {
    const user = userEvent.setup()
    const repository = new DemoRepository()
    const save = vi.spyOn(repository, 'savePlaceHvacProfile')

    render(
      <MemoryRouter>
        <DataProvider repository={repository}>
          <PlaceHvacProfilesPage />
        </DataProvider>
      </MemoryRouter>,
    )

    const place = await screen.findByRole('combobox', { name: '고유 장소' })
    expect(screen.queryByRole('option', { name: '기타' })).not.toBeInTheDocument()
    await user.selectOptions(place, 'place-store')
    await user.selectOptions(
      screen.getByRole('combobox', { name: '계절' }),
      'Summer',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: '예상 HVAC' }),
      'cooling',
    )
    expect(screen.getByRole('combobox', { name: '강도' })).toHaveValue('normal')
    await user.click(screen.getByRole('button', { name: 'Profile 저장' }))

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        placeId: 'place-store',
        season: 'Summer',
        expectedMode: 'cooling',
        expectedIntensity: 'normal',
        memo: null,
        source: 'manual',
        lastConfirmedOn: expect.any(String),
      }),
    )
  })
})

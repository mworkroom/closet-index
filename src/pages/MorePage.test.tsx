import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MorePage } from './MorePage'

afterEach(cleanup)

describe('MorePage', () => {
  it('shows Statistics and Replacement Lines as sibling destinations', () => {
    render(
      <MemoryRouter>
        <MorePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /Statistics/ })).toHaveAttribute(
      'href',
      '/statistics',
    )
    expect(
      screen.getByRole('link', { name: /Replacement Lines/ }),
    ).toHaveAttribute('href', '/replacement-lines')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { collectAllPages } from './supabase-repository'

describe('collectAllPages', () => {
  it('1,000행 제한을 넘는 관계를 마지막 페이지까지 모두 합친다', async () => {
    const source = Array.from({ length: 2401 }, (_, index) => index)
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }))

    const result = await collectAllPages(fetchPage)

    expect(result.error).toBeNull()
    expect(result.data).toEqual(source)
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('중간 페이지가 실패하면 불완전한 관계를 사용하지 않는다', async () => {
    const error = new Error('page failed')
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, index) => index),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error })

    await expect(collectAllPages<number>(fetchPage)).resolves.toEqual({
      data: null,
      error,
    })
  })
})

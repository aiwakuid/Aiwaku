import { describe, expect, it } from 'vitest'

function findUnique(names: string[], query: string) {
  const q = query.trim().toLowerCase()
  const exact = names.find(n => n.toLowerCase() === q)
  if (exact) return exact
  const matches = names.filter(n => n.toLowerCase().includes(q))
  return matches.length === 1 ? matches[0] : undefined
}

describe('product matching', () => {
  it('prefers exact matches', () => {
    expect(findUnique(['Rujak Mangga', 'Rujak Mangga Muda'], 'Rujak Mangga')).toBe('Rujak Mangga')
  })
  it('does not guess between ambiguous products', () => {
    expect(findUnique(['Rujak Mangga', 'Rujak Mangga Muda'], 'mangga')).toBeUndefined()
  })
})

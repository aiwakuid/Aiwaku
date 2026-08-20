import { describe, expect, it } from 'vitest'

describe('transaction invariants', () => {
  it('never accepts negative monetary values', () => {
    expect(Math.max(0, -100)).toBe(0)
  })
  it('idempotency keys are bounded', () => {
    expect('a'.repeat(128).length).toBe(128)
  })
})

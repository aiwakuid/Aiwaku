import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const inventory = readFileSync(new URL('../src/pages/Inventory.tsx', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260821_v57_inventory_mutation_boundary.sql', import.meta.url), 'utf8')

describe('V5.7 inventory mutation boundary', () => {
  it('routes ingredient and recipe mutations through RPCs', () => {
    expect(inventory).toContain("rpc('admin_create_ingredient'")
    expect(inventory).toContain("rpc('admin_upsert_recipe'")
    expect(inventory).toContain("rpc('admin_delete_recipe'")
    expect(inventory).not.toMatch(/from\('ingredients'\)\.(insert|update|delete)/)
    expect(inventory).not.toMatch(/from\('menu_recipes'\)\.(insert|upsert|update|delete)/)
  })

  it('defines admin authorization and cross-tenant validation', () => {
    expect(migration).toContain('is_tenant_admin(v_tenant)')
    expect(migration).toContain("m.tenant_id = v_tenant")
    expect(migration).toContain("i.tenant_id = v_tenant")
    expect(migration).toContain('revoke all on function public.admin_create_ingredient(jsonb) from public')
  })

  it('restricts inventory configuration writes to admins', () => {
    expect(migration).not.toContain('create policy ingredients_admin_write')
    expect(migration).not.toContain('create policy recipes_admin_write')
    expect(migration).toContain('create policy ingredients_member_read')
    expect(migration).toContain('create policy recipes_member_read')
  })
})

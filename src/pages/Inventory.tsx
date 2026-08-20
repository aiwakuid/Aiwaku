import { useEffect, useMemo, useState } from 'react'
import { PackagePlus, Search, Sparkles, Trash2 } from 'lucide-react'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useMenus } from '../hooks/useMenus'
import { supabase, isSupabaseEnabled } from '../lib/supabase'
import type { Menu } from '../types'

type Ingredient = { id:string; tenant_id:string; name:string; unit:string; stock:number; reorder_point:number; cost_per_unit:number; is_active:boolean }
type Recipe = { id:string; menu_id:string; ingredient_id:string; quantity:number }

export function Inventory() {
  const { tenantId } = useTenantAuth()
  const { menus } = useMenus(tenantId ?? undefined)
  const [ingredients,setIngredients] = useState<Ingredient[]>([])
  const [recipes,setRecipes] = useState<Recipe[]>([])
  const [q,setQ] = useState('')
  const [newName,setNewName] = useState('')
  const [newUnit,setNewUnit] = useState('kg')
  const [selectedMenu,setSelectedMenu] = useState<Menu | null>(null)
  const [selectedIngredient,setSelectedIngredient] = useState('')
  const [recipeQty,setRecipeQty] = useState('1')

  useEffect(()=>{
    if(!tenantId || !isSupabaseEnabled()) return
    Promise.all([
      supabase!.from('ingredients').select('*').eq('tenant_id',tenantId).order('name'),
      supabase!.from('menu_recipes').select('*').eq('tenant_id',tenantId)
    ]).then(([a,b])=>{
      if(!a.error) setIngredients((a.data||[]) as Ingredient[])
      if(!b.error) setRecipes((b.data||[]) as Recipe[])
    })
  },[tenantId])

  const low = ingredients.filter(i=>i.stock<=i.reorder_point)
  const filtered = ingredients.filter(i=>i.name.toLowerCase().includes(q.toLowerCase()))
  const menuRecipes = selectedMenu ? recipes.filter(r=>r.menu_id===selectedMenu.id) : []

  const addIngredient = async()=>{
    if(!tenantId || !newName.trim() || !isSupabaseEnabled()) return
    const {data,error}=await supabase!.rpc('admin_create_ingredient',{p_ingredient:{tenant_id:tenantId,name:newName.trim(),unit:newUnit,stock:0,reorder_point:1,cost_per_unit:0}})
    if(!error && data){ setIngredients(v=>[...v,data as Ingredient]); setNewName('') }
  }
  const restock = async(i:Ingredient)=>{
    const raw=prompt(`Tambah ${i.name} (${i.unit})`,`10`); const qty=Number(raw)
    if(!Number.isFinite(qty)||qty<=0) return
    const {data,error}=await supabase!.rpc('restock_ingredient',{p_ingredient_id:i.id,p_quantity:qty,p_note:'Restock dari Persediaan'})
    if(!error && data) setIngredients(v=>v.map(x=>x.id===i.id?{...x,stock:Number(data.stock)}:x))
  }
  const addRecipe = async()=>{
    if(!tenantId || !selectedMenu || !selectedIngredient) return
    const qty=Number(recipeQty); if(qty<=0) return
    const {data,error}=await supabase!.rpc('admin_upsert_recipe',{p_recipe:{tenant_id:tenantId,menu_id:selectedMenu.id,ingredient_id:selectedIngredient,quantity:qty}})
    if(!error && data) setRecipes(v=>[...v.filter(r=>r.id!==data.id && !(r.menu_id===data.menu_id&&r.ingredient_id===data.ingredient_id)),data as Recipe])
  }
  const removeRecipe = async(id:string)=>{ const {error}=await supabase!.rpc('admin_delete_recipe',{p_recipe_id:id}); if(!error)setRecipes(v=>v.filter(r=>r.id!==id)) }
  const cost = useMemo(()=>menuRecipes.reduce((s,r)=>{const i=ingredients.find(x=>x.id===r.ingredient_id); return s+(i?i.cost_per_unit*r.quantity:0)},0),[menuRecipes,ingredients])

  return <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
    <div className="flex items-end justify-between gap-3"><div><div className="text-[22px] font-bold">Persediaan</div><div className="text-[12px] text-slate-500 mt-1">Bahan, resep, food cost — AIWAKU mengurus hitungannya saat order.</div></div><div className="rounded-2xl bg-slate-950 text-white px-4 py-3 text-[11px]"><Sparkles size={14} className="inline mr-1"/> {low.length ? `${low.length} bahan perlu perhatian` : 'Stok bahan aman'}</div></div>
    <div className="grid md:grid-cols-3 gap-3"><div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Bahan</div><div className="text-2xl font-bold">{ingredients.length}</div></div><div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Perlu restock</div><div className="text-2xl font-bold">{low.length}</div></div><div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Resep aktif</div><div className="text-2xl font-bold">{recipes.length}</div></div></div>

    <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-4">
      <div className="bg-white rounded-[20px] border overflow-hidden"><div className="p-4 border-b flex justify-between gap-3"><div className="font-bold text-[14px]">Bahan baku</div><div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari bahan..." className="h-9 rounded-xl border pl-8 pr-3 text-[12px] w-[180px]"/></div></div><div className="p-4 border-b flex gap-2"><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nama bahan" className="h-9 rounded-xl border px-3 text-[12px] flex-1"/><select value={newUnit} onChange={e=>setNewUnit(e.target.value)} className="h-9 rounded-xl border px-2 text-[12px]"><option>kg</option><option>g</option><option>liter</option><option>ml</option><option>pcs</option></select><button onClick={addIngredient} className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[12px] font-semibold">Tambah</button></div><div className="divide-y">{filtered.map(i=><div key={i.id} className="p-4 flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-slate-100 grid place-items-center"><PackagePlus size={16}/></div><div className="flex-1"><div className="font-semibold text-[13px]">{i.name}</div><div className="text-[11px] text-slate-500">{i.stock} {i.unit} · batas aman {i.reorder_point} {i.unit}</div></div><div className={`text-[11px] font-bold ${i.stock<=i.reorder_point?'text-amber-600':'text-emerald-600'}`}>{i.stock<=i.reorder_point?'Perlu restock':'Aman'}</div><button onClick={()=>restock(i)} className="h-8 px-3 rounded-xl border text-[11px] font-semibold">Restock</button></div>)}</div></div>
      <div className="bg-white rounded-[20px] border overflow-hidden"><div className="p-4 border-b"><div className="font-bold text-[14px]">Resep & Food Cost</div><div className="text-[11px] text-slate-500 mt-1">Pilih menu untuk mengatur bahan per porsi.</div></div><div className="p-4 space-y-3"><select value={selectedMenu?.id||''} onChange={e=>setSelectedMenu(menus.find(x=>x.id===e.target.value)||null)} className="h-10 rounded-xl border px-3 text-[12px] w-full"><option value="">Pilih menu...</option>{menus.map(m=><option key={m.id} value={m.id}>{m.name} · Rp{m.price.toLocaleString('id-ID')}</option>)}</select>{selectedMenu&&<><div className="rounded-xl bg-slate-50 p-3 text-[11px] flex justify-between"><span>Estimasi food cost</span><b>Rp{cost.toLocaleString('id-ID')}</b></div><div className="flex gap-2"><select value={selectedIngredient} onChange={e=>setSelectedIngredient(e.target.value)} className="h-9 rounded-xl border px-2 text-[11px] flex-1"><option value="">Pilih bahan...</option>{ingredients.map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select><input value={recipeQty} onChange={e=>setRecipeQty(e.target.value)} type="number" min="0.001" step="0.001" className="w-20 h-9 rounded-xl border px-2 text-[11px]"/><button onClick={addRecipe} className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[11px] font-semibold">Tambah</button></div><div className="divide-y border rounded-xl">{menuRecipes.map(r=>{const i=ingredients.find(x=>x.id===r.ingredient_id);return <div key={r.id} className="p-3 flex items-center gap-2"><div className="flex-1 text-[12px]">{i?.name||'Bahan'} <span className="text-slate-400">× {r.quantity} {i?.unit}</span></div><div className="text-[11px] font-semibold">Rp{((i?.cost_per_unit||0)*r.quantity).toLocaleString('id-ID')}</div><button onClick={()=>removeRecipe(r.id)} className="text-slate-400 hover:text-red-600"><Trash2 size={14}/></button></div>})}</div></>}</div></div>
    </div>
  </div>
}

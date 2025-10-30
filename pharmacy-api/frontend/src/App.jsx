import { useEffect, useMemo, useState } from 'react'
import { api, getApiBase, setApiBase } from './api'

function useProducts() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)

  const load = async ({ page = 1, q = '', category = '' } = {}) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (page) params.set('page', String(page))
      if (q) params.set('q', q)
      if (category) params.set('category', category)
      const res = await api(`/products?${params.toString()}`)
      setItems(res.items || [])
      setPage(res.page || 1)
      setPages(res.pages || 1)
      setTotal(res.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const create = async (payload) => {
    const created = await api('/products', { method: 'POST', body: JSON.stringify(payload) })
    // reload current page to get server canonical data
    await load({ page })
    return created
  }

  const update = async (id, payload) => {
    const updated = await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
    setItems((prev) => prev.map((p) => (String(p._id) === String(id) ? updated : p)))
    return updated
  }

  const remove = async (id) => {
    await api(`/products/${id}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((p) => String(p._id) !== String(id)))
  }

  return { items, loading, error, page, pages, total, load, create, update, remove }
}

function Row({ product, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(product.name || '')
  const [brand, setBrand] = useState(product.brand || '')
  const [price, setPrice] = useState(() => {
    const v = Array.isArray(product.variants) && product.variants[0] ? Number(product.variants[0].price || 0) : 0
    return Number.isFinite(v) ? String(v) : '0'
  })
  const [stock, setStock] = useState(() => {
    const v = Array.isArray(product.variants) && product.variants[0] ? Number(product.variants[0].stock || 0) : 0
    return Number.isFinite(v) ? String(v) : '0'
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({ name: '', price: '' })

  const onSave = async () => {
    const errs = { name: '', price: '' }
    const n = name.trim()
    const pr = Number(price)
    const st = Number(stock)
    if (!n) errs.name = 'Nombre requerido'
    if (!Number.isFinite(pr) || pr < 0) errs.price = 'Precio inválido'
    setErrors(errs)
    if (errs.name || errs.price) return
    setSaving(true)
    try {
      const patch = { name: n, brand: brand.trim(), variants: [{ ...(product.variants?.[0] || {}), price: pr, stock: Number.isFinite(st) ? st : 0 }] }
      await onUpdate(product._id, patch)
      setEditing(false)
    } catch (e) {
      // parent shows toast
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td>{product._id}</td>
      <td>{product.category}</td>
      <td>
        {editing ? (
          <div className="field-with-error">
            <input className="row-edit-input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
            {errors.name && <small className="field-error">{errors.name}</small>}
          </div>
        ) : (
          <span>{product.name}</span>
        )}
      </td>
      <td>
        {editing ? (
          <input className="row-edit-input" value={brand} onChange={(e) => setBrand(e.target.value)} />
        ) : (
          <span>{product.brand || '-'}</span>
        )}
      </td>
      <td>
        {editing ? (
          <div className="field-with-error">
            <input className="row-edit-input" value={price} onChange={(e) => setPrice(e.target.value)} />
            {errors.price && <small className="field-error">{errors.price}</small>}
          </div>
        ) : (
          <span>{Array.isArray(product.variants) && product.variants[0] ? Number(product.variants[0].price).toFixed(2) : '-'}</span>
        )}
      </td>
      <td>
        {editing ? (
          <input className="row-edit-input" value={stock} onChange={(e) => setStock(e.target.value)} />
        ) : (
          <span>{Array.isArray(product.variants) && product.variants[0] ? product.variants[0].stock : '-'}</span>
        )}
      </td>
      <td className="row-actions">
        {editing ? (
          <>
            <button onClick={onSave} disabled={saving}>Guardar</button>
            <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          </>
        ) : (
          <>
            <button className="secondary" onClick={() => setEditing(true)}>Editar</button>
            <button className="danger" onClick={() => onDelete(product._id)}>Eliminar</button>
          </>
        )}
      </td>
    </tr>
  )
}

export default function App() {
  const { items, loading, error, page, pages, total, load, create, update, remove } = useProducts()
  const [apiBase, setApiBaseState] = useState(getApiBase())
  const apiLabel = useMemo(() => apiBase, [apiBase])

  // toasts
  const [toasts, setToasts] = useState([])
  const notify = (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }

  // search/filter
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [qDeb, setQDeb] = useState('')
  useEffect(() => { const id = setTimeout(() => setQDeb(q.trim()), 250); return () => clearTimeout(id) }, [q])

  useEffect(() => { load({ page: 1, q: qDeb, category: cat }) }, [qDeb, cat])
  useEffect(() => { load({ page: 1 }) }, [])

  // create form
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [sku, setSku] = useState('SKU-001')
  const [price, setPrice] = useState('0')
  const [stock, setStock] = useState('0')
  const [creating, setCreating] = useState(false)
  const [errors, setErrors] = useState({ name: '', category: '', price: '' })

  const onCreate = async (e) => {
    e.preventDefault()
    const errs = { name: '', category: '', price: '' }
    const n = name.trim()
    const c = category.trim()
    const pr = Number(price)
    if (!n) errs.name = 'Nombre requerido'
    if (!c) errs.category = 'Categoría requerida'
    if (!Number.isFinite(pr) || pr < 0) errs.price = 'Precio inválido'
    setErrors(errs)
    if (errs.name || errs.category || errs.price) return
    setCreating(true)
    try {
      const payload = {
        name: n,
        category: c,
        brand: brand.trim() || undefined,
        variants: [{ sku: sku.trim() || 'SKU-001', price: pr, stock: Number(stock) || 0 }]
      }
      await create(payload)
      setName(''); setCategory(''); setBrand(''); setSku('SKU-001'); setPrice('0'); setStock('0')
      notify('Producto creado', 'success')
    } catch (e) {
      notify('Error creando: ' + e.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (id) => {
    if (!confirm('¿Eliminar producto?')) return
    try {
      await remove(id)
      notify('Producto eliminado', 'success')
    } catch (e) {
      notify('Error eliminando: ' + e.message, 'error')
    }
  }

  const updateWithNotify = async (id, patch) => {
    try {
      await update(id, patch)
      notify('Producto actualizado', 'success')
    } catch (e) {
      notify('Error actualizando: ' + e.message, 'error')
      throw e
    }
  }

  const changePage = (dir) => {
    const next = Math.min(Math.max(1, page + dir), pages)
    if (next !== page) load({ page: next, q: qDeb, category: cat })
  }

  const onSaveBase = () => {
    try {
      const u = new URL(apiBase)
      if (!u.protocol.startsWith('http')) throw new Error('')
      setApiBase(apiBase)
      setApiBaseState(apiBase)
      alert('API Base guardada')
    } catch {
      alert('URL inválida')
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Products React</h1>
        <div className="api-config">
          <label htmlFor="apiBase">API Base URL</label>
          <input id="apiBase" value={apiBase} onChange={(e) => setApiBaseState(e.target.value)} />
          <button onClick={onSaveBase}>Guardar</button>
        </div>
      </header>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>

      <main>
        <section className="card">
          <h2>Crear producto</h2>
          <form className="grid-form" onSubmit={onCreate}>
            <div className="form-row">
              <label htmlFor="name">Nombre</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
              {errors.name && <small className="field-error">{errors.name}</small>}
            </div>
            <div className="form-row">
              <label htmlFor="category">Categoría</label>
              <input id="category" value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={!!errors.category} />
              {errors.category && <small className="field-error">{errors.category}</small>}
            </div>
            <div className="form-row">
              <label htmlFor="brand">Marca (opcional)</label>
              <input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="sku">SKU</label>
              <input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="form-row">
              <label htmlFor="price">Precio</label>
              <input id="price" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={!!errors.price} />
              {errors.price && <small className="field-error">{errors.price}</small>}
            </div>
            <div className="form-row">
              <label htmlFor="stock">Stock</label>
              <input id="stock" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <button type="submit" disabled={creating}>{creating ? 'Creando...' : 'Crear'}</button>
          </form>
        </section>

        <section className="card">
          <div className="list-header">
            <h2>Productos</h2>
            <div className="right">
              <small>API: {apiLabel}</small>
              <button onClick={() => load({ page: 1, q: qDeb, category: cat })} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
            </div>
          </div>
          <div className="list-tools">
            <input className="search-input" placeholder="Buscar por nombre..." value={q} onChange={(e) => setQ(e.target.value)} />
            <input className="search-input" placeholder="Filtrar por categoría..." value={cat} onChange={(e) => setCat(e.target.value)} />
            <small className="muted">{total} total · página {page} de {pages}</small>
          </div>
          {error && <div className="list-status error">Error: {error}</div>}
          {loading && <div className="list-status">Cargando...</div>}
          <table id="productsTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Categoría</th>
                <th>Nombre</th>
                <th>Marca</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state">No hay productos</div></td></tr>
              ) : (
                items.map((p) => (
                  <Row key={p._id} product={p} onUpdate={updateWithNotify} onDelete={onDelete} />
                ))
              )}
            </tbody>
          </table>

          <div className="list-tools">
            <button className="secondary" onClick={() => changePage(-1)} disabled={page <= 1 || loading}>Anterior</button>
            <button className="secondary" onClick={() => changePage(1)} disabled={page >= pages || loading}>Siguiente</button>
          </div>
        </section>
      </main>

      <footer>
        <small>products-react · conectado a products-api</small>
      </footer>
    </div>
  )
}

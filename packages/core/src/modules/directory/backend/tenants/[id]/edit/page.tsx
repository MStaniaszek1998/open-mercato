"use client"
import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { apiFetch } from '@open-mercato/ui/backend/utils/api'

type TenantFormValues = {
  id: string
  name: string
  isActive: boolean
}

const fields: CrudField[] = [
  { id: 'name', label: 'Name', type: 'text', required: true },
  { id: 'isActive', label: 'Active', type: 'checkbox' },
]

const groups: CrudFormGroup[] = [
  { id: 'details', title: 'Details', column: 1, fields: ['name', 'isActive'] },
]

export default function EditTenantPage({ params }: { params?: { id?: string } }) {
  const tenantId = params?.id
  const [initial, setInitial] = React.useState<TenantFormValues | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      if (!tenantId) return
      setLoading(true)
      setError(null)
      try {
        const res = await apiFetch(`/api/directory/tenants?id=${encodeURIComponent(tenantId)}`)
        if (!res.ok) throw new Error(await res.text().catch(() => 'Failed to load tenant'))
        const data = await res.json()
        const rows = Array.isArray(data?.items) ? data.items : []
        const row = rows[0]
        if (!row) throw new Error('Tenant not found')
        const values: TenantFormValues = {
          id: String(row.id),
          name: String(row.name),
          isActive: !!row.isActive,
        }
        if (!cancelled) setInitial(values)
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load tenant')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tenantId])

  if (!tenantId) return null

  if (error && !loading && !initial) {
    return (
      <Page>
        <PageBody>
          <div className="rounded border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <CrudForm<TenantFormValues>
          title="Edit Tenant"
          backHref="/backend/directory/tenants"
          fields={fields}
          groups={groups}
          initialValues={(initial || { id: tenantId, name: '', isActive: true }) as Partial<TenantFormValues>}
          isLoading={loading}
          loadingMessage="Loading tenant…"
          submitLabel="Save"
          cancelHref="/backend/directory/tenants"
          successRedirect="/backend/directory/tenants?flash=Tenant%20updated&type=success"
          onSubmit={async (values) => {
            await apiFetch('/api/directory/tenants', {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(values),
            })
          }}
          onDelete={async () => {
            await apiFetch(`/api/directory/tenants?id=${encodeURIComponent(tenantId)}`, { method: 'DELETE' })
          }}
          deleteRedirect="/backend/directory/tenants?flash=Tenant%20deleted&type=success"
        />
      </PageBody>
    </Page>
  )
}

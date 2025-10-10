"use client"
import * as React from 'react'
import { E } from '@open-mercato/core/generated/entities.ids.generated'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { apiFetch } from '@open-mercato/ui/backend/utils/api'
import { OrganizationSelect } from '@open-mercato/core/modules/directory/components/OrganizationSelect'
import { fetchRoleOptions } from '@open-mercato/core/modules/auth/backend/users/roleOptions'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type CreateUserFormValues = {
  email: string
  password: string
  organizationId: string | null
  roles: string[]
} & Record<string, unknown>

export default function CreateUserPage() {
  const [widgetCatalog, setWidgetCatalog] = React.useState<Array<{ id: string; title: string; description: string | null }>>([])
  const [widgetLoading, setWidgetLoading] = React.useState(true)
  const [widgetError, setWidgetError] = React.useState<string | null>(null)
  const [widgetMode, setWidgetMode] = React.useState<'inherit' | 'override'>('inherit')
  const [selectedWidgets, setSelectedWidgets] = React.useState<string[]>([])

  React.useEffect(() => {
    let cancelled = false
    async function loadCatalog() {
      setWidgetLoading(true)
      setWidgetError(null)
      try {
        const res = await apiFetch('/api/dashboards/widgets/catalog')
        if (!res.ok) throw new Error(`Failed with status ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          const items = Array.isArray(data.items) ? data.items : []
          setWidgetCatalog(items.map((item: any) => ({ id: String(item.id), title: String(item.title), description: item.description ?? null })))
        }
      } catch (err) {
        console.error('Failed to load dashboard widget catalog', err)
        if (!cancelled) setWidgetError('Unable to load dashboard widgets. You can configure them later from the user page.')
      } finally {
        if (!cancelled) setWidgetLoading(false)
      }
    }
    loadCatalog()
    return () => { cancelled = true }
  }, [])

  const toggleWidget = React.useCallback((id: string) => {
    setSelectedWidgets((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  }, [])

  const fields: CrudField[] = React.useMemo(() => ([
    { id: 'email', label: 'Email', type: 'text', required: true },
    { id: 'password', label: 'Password', type: 'text', required: true },
    {
      id: 'organizationId',
      label: 'Organization',
      type: 'custom',
      component: ({ id, value, setValue }) => (
        <OrganizationSelect
          id={id}
          value={typeof value === 'string' ? value : value ?? null}
          onChange={(next) => setValue(next ?? null)}
          required
          includeEmptyOption
          className="w-full h-9 rounded border px-2 text-sm"
        />
      ),
    },
    { id: 'roles', label: 'Roles', type: 'tags', loadOptions: fetchRoleOptions },
  ]), [])

  const groups: CrudFormGroup[] = [
    { id: 'details', title: 'Details', column: 1, fields: ['email', 'password', 'organizationId', 'roles'] },
    { id: 'acl', title: 'Access', column: 1, component: () => (<div className="text-sm text-muted-foreground">ACL can be edited after creating the user.</div>) },
    { id: 'custom', title: 'Custom Data', column: 2, kind: 'customFields' },
    {
      id: 'dashboardWidgets',
      title: 'Dashboard Widgets',
      column: 2,
      component: () => (
        <DashboardWidgetSelector
          catalog={widgetCatalog}
          loading={widgetLoading}
          error={widgetError}
          mode={widgetMode}
          onModeChange={setWidgetMode}
          selected={selectedWidgets}
          onToggle={toggleWidget}
        />
      ),
    },
  ]

  return (
    <Page>
      <PageBody>
        <CrudForm<CreateUserFormValues>
          title="Create User"
          backHref="/backend/users"
          fields={fields}
          groups={groups}
          entityId={E.auth.user}
          initialValues={{ email: '', password: '', organizationId: null, roles: [] }}
          submitLabel="Create"
          cancelHref="/backend/users"
          successRedirect="/backend/users?flash=User%20created&type=success"
          onSubmit={async (values) => {
            const customFields: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(values)) {
              if (key.startsWith('cf_')) customFields[key.slice(3)] = value
              else if (key.startsWith('cf:')) customFields[key.slice(3)] = value
            }
            const payload = {
              email: values.email,
              password: values.password,
              organizationId: values.organizationId ? values.organizationId : null,
              roles: Array.isArray(values.roles) ? values.roles : [],
              ...(Object.keys(customFields).length ? { customFields } : {}),
            }
            const res = await apiFetch('/api/auth/users', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
            if (!res.ok) {
              let message = 'Failed to create user'
              try {
                const data = await res.clone().json()
                if (data && typeof data.error === 'string') message = data.error
              } catch {}
              throw new Error(message)
            }
            const created = await res.json().catch(() => null)
            const newUserId = created && typeof created.id === 'string' ? created.id : null

            if (widgetMode === 'override' && newUserId) {
              const widgetRes = await apiFetch('/api/dashboards/users/widgets', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  userId: newUserId,
                  mode: 'override',
                  widgetIds: selectedWidgets,
                  organizationId: values.organizationId ? values.organizationId : null,
                }),
              })
              if (!widgetRes.ok) {
                throw new Error('Failed to assign dashboard widgets to the new user')
              }
            }
          }}
        />
      </PageBody>
    </Page>
  )
}

function DashboardWidgetSelector({
  catalog,
  loading,
  error,
  mode,
  onModeChange,
  selected,
  onToggle,
}: {
  catalog: Array<{ id: string; title: string; description: string | null }>
  loading: boolean
  error: string | null
  mode: 'inherit' | 'override'
  onModeChange: (mode: 'inherit' | 'override') => void
  selected: string[]
  onToggle: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner size="sm" /> Loading widgets…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      {!error && (
        <>
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="inherit"
                checked={mode === 'inherit'}
                onChange={() => onModeChange('inherit')}
              />
              Inherit from roles
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value="override"
                checked={mode === 'override'}
                onChange={() => onModeChange('override')}
              />
              Override for this user
            </label>
          </div>
          {mode === 'override' && (
            <div className="space-y-2">
              {catalog.map((widget) => (
                <label key={widget.id} className="flex items-start gap-3 rounded-md border px-3 py-2 hover:border-primary/40">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={selected.includes(widget.id)}
                    onChange={() => onToggle(widget.id)}
                  />
                  <div>
                    <div className="text-sm font-medium leading-none">{widget.title}</div>
                    {widget.description ? <div className="text-xs text-muted-foreground">{widget.description}</div> : null}
                  </div>
                </label>
              ))}
            </div>
          )}
          {mode === 'inherit' && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              New users inherit widgets from their assigned roles. Override to pick a custom set.
            </div>
          )}
        </>
      )}
    </div>
  )
}

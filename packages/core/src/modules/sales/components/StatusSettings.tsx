"use client"

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiFetch } from '@open-mercato/ui/backend/utils/api'
import { useOrganizationScopeVersion } from '@/lib/frontend/useOrganizationScope'
import { useT } from '@/lib/i18n/context'
import { ICON_SUGGESTIONS } from '@open-mercato/core/modules/dictionaries/components/dictionaryAppearance'
import {
  DictionaryForm,
  type DictionaryFormValues,
} from '@open-mercato/core/modules/dictionaries/components/DictionaryForm'
import {
  DictionaryTable,
  type DictionaryTableEntry,
} from '@open-mercato/core/modules/dictionaries/components/DictionaryTable'

type SalesStatusKind = 'order-statuses' | 'order-line-statuses'

type SectionDefinition = {
  kind: SalesStatusKind
  title: string
  description: string
}

type DialogState =
  | { mode: 'create'; kind: SalesStatusKind }
  | { mode: 'edit'; kind: SalesStatusKind; entry: DictionaryTableEntry }

const DEFAULT_FORM_VALUES: DictionaryFormValues = {
  value: '',
  label: '',
  color: null,
  icon: null,
}

export function StatusSettings() {
  const t = useT()
  const translate = React.useCallback((key: string, fallback: string) => {
    const value = t(key)
    return value === key ? fallback : value
  }, [t])

  const sections = React.useMemo<SectionDefinition[]>(() => [
    {
      kind: 'order-statuses',
      title: translate('sales.config.statuses.orders.title', 'Order statuses'),
      description: translate('sales.config.statuses.orders.description', 'Configure the status values available for sales orders.'),
    },
    {
      kind: 'order-line-statuses',
      title: translate('sales.config.statuses.lines.title', 'Order line statuses'),
      description: translate('sales.config.statuses.lines.description', 'Configure the status values available for sales order lines.'),
    },
  ], [translate])

  const [entriesByKind, setEntriesByKind] = React.useState<Record<SalesStatusKind, DictionaryTableEntry[]>>({
    'order-statuses': [],
    'order-line-statuses': [],
  })
  const [loadingKind, setLoadingKind] = React.useState<Record<SalesStatusKind, boolean>>({
    'order-statuses': false,
    'order-line-statuses': false,
  })
  const [dialog, setDialog] = React.useState<DialogState | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const scopeVersion = useOrganizationScopeVersion()

  const apiPaths = React.useMemo<Record<SalesStatusKind, string>>(
    () => ({
      'order-statuses': '/api/sales/order-statuses',
      'order-line-statuses': '/api/sales/order-line-statuses',
    }),
    []
  )

  const loadEntries = React.useCallback(async (kind: SalesStatusKind) => {
    setLoadingKind((prev) => ({ ...prev, [kind]: true }))
    try {
      const res = await apiFetch(apiPaths[kind])
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data || typeof data !== 'object' || !Array.isArray((data as any).items)) {
        throw new Error('Failed to load dictionary entries.')
      }
      const items: DictionaryTableEntry[] = (data as { items: any[] }).items.map((item) => ({
        id: String(item.id),
        value: String(item.value ?? ''),
        label: typeof item.label === 'string' ? item.label : '',
        color: typeof item.color === 'string' ? item.color : null,
        icon: typeof item.icon === 'string' ? item.icon : null,
        organizationId: typeof item.organizationId === 'string' ? item.organizationId : null,
        tenantId: typeof item.tenantId === 'string' ? item.tenantId : null,
        isInherited: false,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
      }))
      setEntriesByKind((prev) => ({ ...prev, [kind]: items }))
    } catch (err) {
      console.error('sales.statuses.list failed', err)
      flash(translate('sales.config.statuses.error.load', 'Failed to load status entries.'), 'error')
    } finally {
      setLoadingKind((prev) => ({ ...prev, [kind]: false }))
    }
  }, [apiPaths, translate])

  React.useEffect(() => {
    void loadEntries('order-statuses')
    void loadEntries('order-line-statuses')
  }, [loadEntries, scopeVersion])

  const closeDialog = React.useCallback(() => {
    setDialog(null)
  }, [])

  const tableTranslations = React.useMemo(() => ({
    valueColumn: translate('sales.config.statuses.columns.value', 'Value'),
    labelColumn: translate('sales.config.statuses.columns.label', 'Label'),
    appearanceColumn: translate('sales.config.statuses.columns.appearance', 'Appearance'),
    addLabel: translate('sales.config.statuses.actions.add', 'Add status'),
    editLabel: translate('sales.config.statuses.actions.edit', 'Edit'),
    deleteLabel: translate('sales.config.statuses.actions.delete', 'Delete'),
    refreshLabel: translate('sales.config.statuses.actions.refresh', 'Refresh'),
    inheritedLabel: '',
    inheritedTooltip: '',
    emptyLabel: translate('sales.config.statuses.empty', 'No statuses yet.'),
    searchPlaceholder: translate('sales.config.statuses.search', 'Search statuses…'),
  }), [translate])

  const formTranslations = React.useMemo(() => ({
    createTitle: translate('sales.config.statuses.dialog.addTitle', 'Add status'),
    editTitle: translate('sales.config.statuses.dialog.editTitle', 'Edit status'),
    valueLabel: translate('sales.config.statuses.dialog.valueLabel', 'Value'),
    labelLabel: translate('sales.config.statuses.dialog.labelLabel', 'Label'),
    saveLabel: translate('sales.config.statuses.dialog.save', 'Save'),
    cancelLabel: translate('sales.config.statuses.dialog.cancel', 'Cancel'),
    appearance: {
      colorLabel: translate('sales.config.statuses.dialog.colorLabel', 'Color'),
      colorHelp: translate('sales.config.statuses.dialog.colorHelp', 'Pick a highlight color for this status.'),
      colorClearLabel: translate('sales.config.statuses.dialog.colorClear', 'Remove color'),
      iconLabel: translate('sales.config.statuses.dialog.iconLabel', 'Icon'),
      iconPlaceholder: translate('sales.config.statuses.dialog.iconPlaceholder', 'Type an emoji or pick one of the suggestions.'),
      iconPickerTriggerLabel: translate('sales.config.statuses.dialog.iconBrowse', 'Browse icons and emojis'),
      iconSearchPlaceholder: translate('sales.config.statuses.dialog.iconSearchPlaceholder', 'Search icons or emojis…'),
      iconSearchEmptyLabel: translate('sales.config.statuses.dialog.iconSearchEmpty', 'No icons match your search.'),
      iconSuggestionsLabel: translate('sales.config.statuses.dialog.iconSuggestions', 'Suggestions'),
      iconClearLabel: translate('sales.config.statuses.dialog.iconClear', 'Remove icon'),
      previewEmptyLabel: translate('sales.config.statuses.appearance.empty', 'None'),
    },
  }), [translate])

  const startCreate = React.useCallback((kind: SalesStatusKind) => {
    setDialog({ mode: 'create', kind })
  }, [])

  const startEdit = React.useCallback((kind: SalesStatusKind, entry: DictionaryTableEntry) => {
    setDialog({ mode: 'edit', kind, entry })
  }, [])

  const deleteEntry = React.useCallback(async (kind: SalesStatusKind, entry: DictionaryTableEntry) => {
    const message = translate('sales.config.statuses.deleteConfirm', 'Delete status "{{value}}"?').replace('{{value}}', entry.label || entry.value)
    if (!window.confirm(message)) return
    try {
      const res = await apiFetch(apiPaths[kind], {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        const msg = typeof payload?.error === 'string' ? payload.error : translate('sales.config.statuses.error.delete', 'Failed to delete status.')
        throw new Error(msg)
      }
      flash(translate('sales.config.statuses.success.delete', 'Status deleted.'), 'success')
      await loadEntries(kind)
    } catch (err) {
      console.error('sales.statuses.delete failed', err)
      const message = err instanceof Error ? err.message : translate('sales.config.statuses.error.delete', 'Failed to delete status.')
      flash(message, 'error')
    }
  }, [apiPaths, loadEntries, translate])

  const submitForm = React.useCallback(async (values: DictionaryFormValues) => {
    if (!dialog) return
    const path = apiPaths[dialog.kind]
    setSubmitting(true)
    try {
      if (dialog.mode === 'create') {
        const res = await apiFetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(values),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = typeof payload?.error === 'string' ? payload.error : translate('sales.config.statuses.error.save', 'Failed to save status.')
          throw new Error(msg)
        }
        flash(translate('sales.config.statuses.success.save', 'Status saved.'), 'success')
      } else if (dialog.mode === 'edit') {
        const entry = dialog.entry
        const body: Record<string, unknown> = { id: entry.id }
        if (values.value !== entry.value) body.value = values.value
        if (values.label !== entry.label) body.label = values.label
        const nextColor = values.color ?? null
        if (nextColor !== (entry.color ?? null)) body.color = nextColor
        const nextIcon = values.icon ?? null
        if (nextIcon !== (entry.icon ?? null)) body.icon = nextIcon
        const res = await apiFetch(path, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = typeof payload?.error === 'string' ? payload.error : translate('sales.config.statuses.error.save', 'Failed to save status.')
          throw new Error(msg)
        }
        flash(translate('sales.config.statuses.success.save', 'Status saved.'), 'success')
      }
      closeDialog()
      await loadEntries(dialog.kind)
    } catch (err) {
      console.error('sales.statuses.submit failed', err)
      const message = err instanceof Error ? err.message : translate('sales.config.statuses.error.save', 'Failed to save status.')
      flash(message, 'error')
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setSubmitting(false)
    }
  }, [apiPaths, closeDialog, dialog, loadEntries, translate])

  const currentValues = React.useMemo<DictionaryFormValues>(() => {
    if (dialog && dialog.mode === 'edit') {
      return {
        value: dialog.entry.value,
        label: dialog.entry.label,
        color: dialog.entry.color,
        icon: dialog.entry.icon,
      }
    }
    return DEFAULT_FORM_VALUES
  }, [dialog])

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const items = entriesByKind[section.kind] ?? []
        const loading = loadingKind[section.kind] ?? false
        return (
          <section key={section.kind} className="rounded border bg-card text-card-foreground shadow-sm">
            <div className="border-b px-6 py-4 space-y-1">
              <h2 className="text-lg font-medium">{section.title}</h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="px-2 py-4 sm:px-4">
              <DictionaryTable
                entries={items}
                loading={loading}
                canManage
                onCreate={() => startCreate(section.kind)}
                onEdit={(entry) => startEdit(section.kind, entry)}
                onDelete={(entry) => deleteEntry(section.kind, entry)}
                onRefresh={() => loadEntries(section.kind)}
                translations={{ ...tableTranslations, title: section.title }}
              />
            </div>
          </section>
        )
      })}

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'edit' ? formTranslations.editTitle : formTranslations.createTitle}
            </DialogTitle>
          </DialogHeader>
          <DictionaryForm
            mode={dialog?.mode === 'edit' ? 'edit' : 'create'}
            initialValues={currentValues}
            onSubmit={submitForm}
            onCancel={closeDialog}
            submitting={submitting}
            translations={{
              title: dialog?.mode === 'edit' ? formTranslations.editTitle : formTranslations.createTitle,
              valueLabel: formTranslations.valueLabel,
              labelLabel: formTranslations.labelLabel,
              saveLabel: formTranslations.saveLabel,
              cancelLabel: formTranslations.cancelLabel,
              appearance: formTranslations.appearance,
            }}
            iconSuggestions={ICON_SUGGESTIONS}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

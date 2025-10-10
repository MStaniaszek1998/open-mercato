"use client"

import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { DEFAULT_SETTINGS, hydrateNotesSettings, type NotesSettings } from './config'

const NotesWidgetClient: React.FC<DashboardWidgetComponentProps<NotesSettings>> = ({ mode, settings, onSettingsChange }) => {
  const value = React.useMemo(() => hydrateNotesSettings(settings), [settings])

  if (mode === 'settings') {
    return (
      <div className="space-y-1.5">
        <label htmlFor="dashboard-notes" className="text-xs font-medium uppercase text-muted-foreground">
          Notes
        </label>
        <textarea
          id="dashboard-notes"
          className="min-h-[160px] w-full resize-y rounded-md border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          value={value.text}
          onChange={(event) => onSettingsChange({ text: event.target.value })}
          placeholder="Write quick notes you want to keep handy."
        />
      </div>
    )
  }

  if (!value.text.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        No notes yet. Switch to settings to add your text.
      </p>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-6">
      {value.text}
    </div>
  )
}

export default NotesWidgetClient

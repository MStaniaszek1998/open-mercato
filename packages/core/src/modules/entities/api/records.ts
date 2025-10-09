import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import type { QueryEngine, QueryOptions, Where, Sort } from '@open-mercato/shared/lib/query/types'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { resolveOrganizationScope, getSelectedOrganizationFromRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { setRecordCustomFields } from '../lib/helpers'
import { CustomFieldValue } from '../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['entities.records.view'] },
  POST: { requireAuth: true, requireFeatures: ['entities.records.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['entities.records.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['entities.records.manage'] },
}

function parseBool(v: string | null, d = false) {
  if (v == null) return d
  const s = String(v).toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const entityId = url.searchParams.get('entityId') || ''
  if (!entityId) return NextResponse.json({ error: 'entityId is required' }, { status: 400 })

  const auth = getAuthFromRequest(req)
  if (!auth || !auth.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = (url.searchParams.get('format') || '').toLowerCase()
  const exportAll = parseBool(url.searchParams.get('all'), false)
  const page = exportAll ? 1 : Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1)
  const pageSize = exportAll ? 100000 : Math.min(Math.max(parseInt(url.searchParams.get('pageSize') || '50', 10) || 50, 1), 100)
  const sortField = url.searchParams.get('sortField') || 'id'
  const sortDir = (url.searchParams.get('sortDir') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
  const withDeleted = parseBool(url.searchParams.get('withDeleted'), false)

  const qpEntries: Array<[string, string]> = []
  for (const [key, val] of url.searchParams.entries()) {
    if (['entityId','page','pageSize','sortField','sortDir','withDeleted','format'].includes(key)) continue
    qpEntries.push([key, val])
  }

  try {
    const { resolve } = await createRequestContainer()
    const qe = resolve('queryEngine') as QueryEngine
    const em = resolve('em') as any
    const rbac = resolve('rbacService') as RbacService
    const scope = await resolveOrganizationScope({ em, rbac, auth, selectedId: getSelectedOrganizationFromRequest(req) })
    let organizationIds: string[] | null = scope.filterIds
    let isCustomEntity = false
    try {
      const { CustomEntity } = await import('../data/entities')
      const found = await em.findOne(CustomEntity as any, { entityId, isActive: true })
      isCustomEntity = !!found
    } catch {}
    if (organizationIds && organizationIds.length === 0) {
      return NextResponse.json({ items: [], total: 0, page, pageSize, totalPages: 0 })
    }
    // Build filters with awareness of custom-entity mode
    const filtersObj: Where<any> = {}
    const buildFilter = (key: string, val: string, allowAnyKey: boolean) => {
      if (key.startsWith('cf_')) {
        if (key.endsWith('In')) {
          const base = key.slice(0, -2)
          const values = val.split(',').map((s) => s.trim()).filter(Boolean)
          ;(filtersObj as any)[base] = { $in: values }
        } else {
          if (val.includes(',')) {
            const values = val.split(',').map((s) => s.trim()).filter(Boolean)
            ;(filtersObj as any)[key] = { $in: values }
          } else if (val === 'true' || val === 'false') {
            ;(filtersObj as any)[key] = (val === 'true')
          } else {
            ;(filtersObj as any)[key] = val
          }
        }
      } else if (allowAnyKey) {
        if (val.includes(',')) {
          const values = val.split(',').map((s) => s.trim()).filter(Boolean)
          ;(filtersObj as any)[key] = { $in: values }
        } else if (val === 'true' || val === 'false') {
          ;(filtersObj as any)[key] = (val === 'true')
        } else {
          ;(filtersObj as any)[key] = val
        }
      } else {
        if (['id', 'created_at', 'updated_at', 'deleted_at', 'name', 'title', 'email'].includes(key)) {
          ;(filtersObj as any)[key] = val
        }
      }
    }

    if (organizationIds && organizationIds.length) {
      (filtersObj as any).organization_id = { $in: organizationIds }
    }
    const qopts: QueryOptions = {
      tenantId: auth.tenantId!,
      includeCustomFields: true,
      page: { page, pageSize },
      sort: [{ field: sortField as any, dir: sortDir as any }] as Sort[],
      filters: filtersObj as any,
      withDeleted,
    }
    if (organizationIds && organizationIds.length) {
      qopts.organizationIds = organizationIds
    }
    for (const [k, v] of qpEntries) buildFilter(k, v, isCustomEntity)
    const res = await qe.query(entityId as any, qopts)

    const payload = {
      items: (res.items || []).map((row: any) => {
        if (!isCustomEntity || !row || typeof row !== 'object') return row
        const out: any = {}
        for (const [k, v] of Object.entries(row)) {
          if (k.startsWith('cf_')) out[k.replace(/^cf_/, '')] = v
          else out[k] = v
        }
        return out
      }),
      total: res.total || 0,
      page: res.page || page,
      pageSize: res.pageSize || pageSize,
      totalPages: Math.ceil((res.total || 0) / (res.pageSize || pageSize)),
    }

    if (format === 'csv') {
      const items = payload.items as any[]
      const headers = Array.from(new Set(items.flatMap((it) => Object.keys(it || {}))))
      const esc = (s: any) => {
        const str = Array.isArray(s) ? s.join('; ') : (s == null ? '' : String(s))
        return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str
      }
      const lines = [headers.join(','), ...items.map((it) => headers.map((h) => esc((it as any)[h])).join(','))]
      return new Response(lines.join('\n'), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${(entityId || 'records').replace(/[^a-z0-9_\-]/gi, '_')}.csv"`,
        },
      })
    }

    if (format === 'json') {
      const body = JSON.stringify(payload.items || [])
      return new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${(entityId || 'records').replace(/[^a-z0-9_\-]/gi, '_')}.json"`,
        },
      })
    }

    if (format === 'xml') {
      const items = (payload.items || []) as any[]
      const escapeXml = (s: any) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
      const toXml = (obj: Record<string, any>) => {
        const parts: string[] = []
        for (const [k, v] of Object.entries(obj)) {
          const tag = k.replace(/[^a-zA-Z0-9_:-]/g, '_')
          if (Array.isArray(v)) {
            for (const vv of v) parts.push(`<${tag}>${escapeXml(vv)}</${tag}>`)
          } else if (v != null && typeof v === 'object') {
            parts.push(`<${tag}>${toXml(v)}</${tag}>`)
          } else {
            parts.push(`<${tag}>${escapeXml(v)}</${tag}>`)
          }
        }
        return parts.join('')
      }
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<records>${items.map((it) => `<record>${toXml(it || {})}</record>`).join('')}</records>`
      return new Response(xml, {
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'content-disposition': `attachment; filename="${(entityId || 'records').replace(/[^a-z0-9_\-]/gi, '_')}.xml"`,
        },
      })
    }

    return NextResponse.json(payload)
  } catch (e) {
    try { console.error('[entities.records.GET] Error', e) } catch {}
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const postBodySchema = z.object({
  entityId: z.string().min(1),
  recordId: z.string().min(1).optional(),
  values: z.record(z.string(), z.any()).default({}),
})

export async function POST(req: Request) {
  const auth = getAuthFromRequest(req)
  if (!auth || !auth.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = postBodySchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  const { entityId } = parsed.data
  let { recordId, values } = parsed.data as { recordId?: string; values: Record<string, any> }

  try {
    const { resolve } = await createRequestContainer()
    const de = resolve('dataEngine') as any
    const em = resolve('em') as any
    const rbac = resolve('rbacService') as RbacService
    const scope = await resolveOrganizationScope({ em, rbac, auth, selectedId: getSelectedOrganizationFromRequest(req) })
    const targetOrgId = scope.selectedId ?? auth.orgId
    if (!targetOrgId) return NextResponse.json({ error: 'Organization context is required' }, { status: 400 })
    const norm = normalizeValues(values)

    // Validate against custom field definitions
    try {
      const { validateCustomFieldValuesServer } = await import('../lib/validation')
      const check = await validateCustomFieldValuesServer(em, { entityId, organizationId: targetOrgId, tenantId: auth.tenantId!, values: norm })
      if (!check.ok) return NextResponse.json({ error: 'Validation failed', fields: check.fieldErrors }, { status: 400 })
    } catch { /* ignore if helper missing */ }

    const normalizedRecordId = (() => {
      const raw = String(recordId || '').trim()
      if (!raw) return undefined
      const low = raw.toLowerCase()
      if (low === 'create' || low === 'new' || low === 'null' || low === 'undefined') return undefined
      // Enforce UUID only; any non-uuid is ignored so we generate one in the DE
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      return uuid.test(raw) ? raw : undefined
    })()
    const { id } = await de.createCustomEntityRecord({
      entityId,
      recordId: normalizedRecordId,
      organizationId: targetOrgId,
      tenantId: auth.tenantId!,
      values: norm,
    })

    return NextResponse.json({ ok: true, item: { entityId, recordId: id } })
  } catch (e) {
    try { console.error('[entities.records.POST] Error', e) } catch {}
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Avoid zod here to prevent runtime import issues in some environments
function parsePutBody(json: any): { ok: true; data: { entityId: string; recordId: string; values: Record<string, any> } } | { ok: false; error: string } {
  if (!json || typeof json !== 'object') return { ok: false, error: 'Invalid JSON' }
  const entityId = typeof json.entityId === 'string' && json.entityId.length ? json.entityId : ''
  const recordId = typeof json.recordId === 'string' && json.recordId.length ? json.recordId : ''
  const values = (json.values && typeof json.values === 'object') ? json.values as Record<string, any> : {}
  if (!entityId || !recordId) return { ok: false, error: 'entityId and recordId are required' }
  return { ok: true, data: { entityId, recordId, values } }
}

export async function PUT(req: Request) {
  const auth = getAuthFromRequest(req)
  if (!auth || !auth.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let json: any
  try { json = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = parsePutBody(json)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { entityId, recordId, values } = parsed.data

  try {
    const { resolve } = await createRequestContainer()
    const de = resolve('dataEngine') as any
    const em = resolve('em') as any
    const rbac = resolve('rbacService') as RbacService
    const scope = await resolveOrganizationScope({ em, rbac, auth, selectedId: getSelectedOrganizationFromRequest(req) })
    const targetOrgId = scope.selectedId ?? auth.orgId
    if (!targetOrgId) return NextResponse.json({ error: 'Organization context is required' }, { status: 400 })
    const norm = normalizeValues(values)


    // Validate against custom field definitions
    try {
      const { validateCustomFieldValuesServer } = await import('../lib/validation')
      const check = await validateCustomFieldValuesServer(em, { entityId, organizationId: targetOrgId, tenantId: auth.tenantId!, values: norm })
      if (!check.ok) return NextResponse.json({ error: 'Validation failed', fields: check.fieldErrors }, { status: 400 })
    } catch { /* ignore if helper missing */ }

    // Normalize recordId: if blank/sentinel/non-uuid => create instead of update
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const rid = String(recordId || '').trim()
    const low = rid.toLowerCase()
    const isSentinel = !rid || low === 'create' || low === 'new' || low === 'null' || low === 'undefined'
    const isUuid = uuidRe.test(rid)
    if (isSentinel || !isUuid) {
      const created = await de.createCustomEntityRecord({
        entityId,
        recordId: undefined,
        organizationId: targetOrgId,
        tenantId: auth.tenantId!,
        values: norm,
      })
      return NextResponse.json({ ok: true, item: { entityId, recordId: created.id } })
    }

    await de.updateCustomEntityRecord({
      entityId,
      recordId: rid,
      organizationId: targetOrgId,
      tenantId: auth.tenantId!,
      values: norm,
    })
    return NextResponse.json({ ok: true, item: { entityId, recordId: rid } })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const deleteBodySchema = z.object({
  entityId: z.string().min(1),
  recordId: z.string().min(1),
})

export async function DELETE(req: Request) {
  const auth = getAuthFromRequest(req)
  if (!auth || !auth.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const qpEntityId = url.searchParams.get('entityId')
  const qpRecordId = url.searchParams.get('recordId')
  let payload: any = qpEntityId && qpRecordId ? { entityId: qpEntityId, recordId: qpRecordId } : null
  if (!payload) {
    try { payload = await req.json() } catch { payload = null }
  }
  const parsed = deleteBodySchema.safeParse(payload)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  const { entityId, recordId } = parsed.data

  try {
    const { resolve } = await createRequestContainer()
    const de = resolve('dataEngine') as any
    const em = resolve('em') as any
    const rbac = resolve('rbacService') as RbacService
    const scope = await resolveOrganizationScope({ em, rbac, auth, selectedId: getSelectedOrganizationFromRequest(req) })
    const targetOrgId = scope.selectedId ?? auth.orgId
    if (!targetOrgId) return NextResponse.json({ error: 'Organization context is required' }, { status: 400 })
    await de.deleteCustomEntityRecord({ entityId, recordId, organizationId: targetOrgId, tenantId: auth.tenantId!, soft: true })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function normalizeValues(input: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(input || {})) {
    const key = k.startsWith('cf_') ? k.replace(/^cf_/, '') : k
    out[key] = v
  }
  return out
}

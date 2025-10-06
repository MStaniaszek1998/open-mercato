import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@/lib/auth/server'
import { createRequestContainer } from '@/lib/di/container'

export const metadata = {
  POST: { requireAuth: true, requireRoles: ['admin'] as const, requireFeatures: ['query_index.reindex'] },
}

export async function POST(req: Request) {
  const auth = getAuthFromRequest(req)
  if (!auth || !auth.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as any
  const entityType = String(body?.entityType || '')
  if (!entityType) return NextResponse.json({ error: 'Missing entityType' }, { status: 400 })
  const force = Boolean(body?.force)

  const { resolve } = await createRequestContainer()
  const bus = resolve('eventBus') as any
  await bus.emitEvent('query_index.reindex', { entityType, organizationId: auth.orgId, tenantId: auth.tenantId, force }, { persistent: true })
  return NextResponse.json({ ok: true })
}


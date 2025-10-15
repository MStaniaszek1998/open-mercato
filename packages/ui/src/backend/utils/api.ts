"use client"
// Simple fetch wrapper that redirects to session refresh on 401 (Unauthorized)
// Used across UI data utilities to avoid duplication.
import { flash } from '../FlashMessages'
import { deserializeOperationMetadata } from '@open-mercato/shared/lib/commands/operationMetadata'
import { pushOperation } from '../operations/store'
export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export function redirectToSessionRefresh() {
  if (typeof window === 'undefined') return
  const current = window.location.pathname + window.location.search
  // Avoid redirect loops if already on an auth/session route
  if (window.location.pathname.startsWith('/api/auth')) return
  try {
    flash('Session expired. Redirecting to sign in…', 'warning')
    setTimeout(() => {
      window.location.href = `/api/auth/session/refresh?redirect=${encodeURIComponent(current)}`
    }, 20)
  } catch {
    // no-op
  }
}

export class ForbiddenError extends Error {
  readonly status = 403
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

let DEFAULT_FORBIDDEN_ROLES: string[] = ['admin']

export function setAuthRedirectConfig(cfg: { defaultForbiddenRoles?: readonly string[] }) {
  if (cfg?.defaultForbiddenRoles && cfg.defaultForbiddenRoles.length) {
    DEFAULT_FORBIDDEN_ROLES = [...cfg.defaultForbiddenRoles].map(String)
  }
}

export function redirectToForbiddenLogin(options?: { requiredRoles?: string[] | null; requiredFeatures?: string[] | null }) {
  if (typeof window === 'undefined') return
  // We don't know required roles from the API response; use a generic hint.
  if (window.location.pathname.startsWith('/login')) return
  try {
    const current = window.location.pathname + window.location.search
    const features = options?.requiredFeatures?.filter(Boolean) ?? []
    const roles = options?.requiredRoles?.filter(Boolean) ?? []
    const query = features.length
      ? `requireFeature=${encodeURIComponent(features.join(','))}`
      : `requireRole=${encodeURIComponent((roles.length ? roles : DEFAULT_FORBIDDEN_ROLES).map(String).join(','))}`
    const url = `/login?${query}&redirect=${encodeURIComponent(current)}`
    flash('Insufficient permissions. Redirecting to login…', 'warning')
    setTimeout(() => { window.location.href = url }, 60)
  } catch {
    // no-op
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  type FetchType = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  const baseFetch: FetchType = (typeof window !== 'undefined' && (window as any).__omOriginalFetch)
    ? ((window as any).__omOriginalFetch as FetchType)
    : fetch;
  const res = await baseFetch(input, init);
  const onLoginPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/login')
  if (res.status === 401) {
    // Trigger same redirect flow as protected pages
    if (!onLoginPage) {
      redirectToSessionRefresh()
      // Throw a typed error for callers that might still handle it
      throw new UnauthorizedError(await res.text().catch(() => 'Unauthorized'))
    }
    return res
  }
  if (res.status === 403) {
    // Try to read requiredRoles from JSON body; ignore if not JSON
    let roles: string[] | null = null
    let features: string[] | null = null
    try {
      const clone = res.clone()
      const data = await clone.json()
      if (Array.isArray(data?.requiredRoles)) roles = data.requiredRoles.map((r: any) => String(r))
      if (Array.isArray(data?.requiredFeatures)) features = data.requiredFeatures.map((f: any) => String(f))
    } catch {}
    // Only redirect if not already on login page
    if (!onLoginPage) {
      redirectToForbiddenLogin({ requiredRoles: roles, requiredFeatures: features })
      const msg = await res.text().catch(() => 'Forbidden')
      throw new ForbiddenError(msg)
    }
    // If already on login, just return the response for the caller to handle
  }
  try {
    const header = res.headers.get('x-om-operation')
    const metadata = deserializeOperationMetadata(header)
    if (metadata) pushOperation(metadata)
  } catch {
    // ignore malformed headers
  }
  return res
}

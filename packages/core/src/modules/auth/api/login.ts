import { NextResponse } from 'next/server'
import { userLoginSchema } from '@open-mercato/core/modules/auth/data/validators'
import { createRequestContainer } from '@/lib/di/container'
import { AuthService } from '@open-mercato/core/modules/auth/services/authService'
import { signJwt } from '@/lib/auth/jwt'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

// validation comes from userLoginSchema

export async function POST(req: Request) {
  const { translate } = await resolveTranslations()
  const form = await req.formData()
  const email = String(form.get('email') ?? '')
  const password = String(form.get('password') ?? '')
  const remember = String(form.get('remember') ?? '').toLowerCase() === 'on' || String(form.get('remember') ?? '') === '1' || String(form.get('remember') ?? '') === 'true'
  const requireRoleRaw = (String(form.get('requireRole') ?? form.get('role') ?? '')).trim()
  const requiredRoles = requireRoleRaw ? requireRoleRaw.split(',').map((s) => s.trim()).filter(Boolean) : []
  const parsed = userLoginSchema.pick({ email: true, password: true }).safeParse({ email, password })
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: translate('auth.login.errors.invalidCredentials', 'Invalid credentials') }, { status: 400 })
  }
  const container = await createRequestContainer()
  const auth = container.resolve<AuthService>('authService')
  const user = await auth.findUserByEmail(parsed.data.email)
  if (!user || !user.passwordHash) {
    return NextResponse.json({ ok: false, error: translate('auth.login.errors.invalidCredentials', 'Invalid email or password') }, { status: 401 })
  }
  const ok = await auth.verifyPassword(user, parsed.data.password)
  if (!ok) {
    return NextResponse.json({ ok: false, error: translate('auth.login.errors.invalidCredentials', 'Invalid email or password') }, { status: 401 })
  }
  // Optional role requirement
  if (requiredRoles.length) {
    const userRoleNames = await auth.getUserRoles(user)
    const authorized = requiredRoles.some(r => userRoleNames.includes(r))
    if (!authorized) {
      return NextResponse.json({ ok: false, error: translate('auth.login.errors.permissionDenied', 'Not authorized for this area') }, { status: 403 })
    }
  }
  await auth.updateLastLoginAt(user)
  const userRoleNames = await auth.getUserRoles(user)
  const token = signJwt({ 
    sub: String(user.id), 
    tenantId: user.tenantId ? String(user.tenantId) : null, 
    orgId: user.organizationId ? String(user.organizationId) : null, 
    email: user.email, 
    roles: userRoleNames 
  })
  const res = NextResponse.json({ ok: true, token, redirect: '/backend' })
  res.cookies.set('auth_token', token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 8 })
  if (remember) {
    const days = Number(process.env.REMEMBER_ME_DAYS || '30')
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const sess = await auth.createSession(user, expiresAt)
    res.cookies.set('session_token', sess.token, { httpOnly: true, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', expires: expiresAt })
  }
  return res
}

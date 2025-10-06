export const metadata = {
  requireAuth: true,
  requireRoles: ['admin'] as const,
  requireFeatures: ['entities.records.view'],
  pageTitle: 'Entity Records',
  pageGroup: 'Data designer',
  pageOrder: 60,
}

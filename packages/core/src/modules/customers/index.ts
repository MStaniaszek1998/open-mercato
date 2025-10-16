import type { ModuleInfo } from '@/modules/registry'

export const metadata: ModuleInfo = {
  name: 'customers',
  title: 'Customer Relationship Management',
  version: '0.1.0',
  description: 'Core CRM capabilities for people, companies, deals, and activities.',
  author: 'Open Mercato Team',
  license: 'Proprietary',
}

export { features } from './acl'

import type { ModuleInfo } from '@/modules/registry'
import './commands'

export const metadata: ModuleInfo = {
  name: 'sales',
  title: 'Sales Management',
  version: '0.1.0',
  description:
    'Quoting, ordering, fulfillment, and billing capabilities built on modular pricing and tax pipelines.',
  author: 'Open Mercato Team',
  license: 'Proprietary',
  requires: ['catalog', 'customers', 'dictionaries'],
}

export { features } from './acl'

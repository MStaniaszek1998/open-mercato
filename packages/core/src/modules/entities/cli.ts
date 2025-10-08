import type { ModuleCli } from '@/modules/registry'
import { modules } from '@/generated/modules.generated'
import { createRequestContainer } from '@/lib/di/container'
import { upsertCustomEntity } from '@open-mercato/core/modules/entities/lib/register'
import { E as GeneratedEntities } from '@/generated/entities.ids.generated'
import { CustomFieldDef } from '@open-mercato/core/modules/entities/data/entities'
import { ensureCustomFieldDefinitions, type FieldSetInput } from './lib/field-definitions'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const SYSTEM_ENTITY_IDS: Set<string> = (() => {
  const ids = new Set<string>()
  for (const moduleEntities of Object.values(GeneratedEntities)) {
    for (const id of Object.values(moduleEntities as Record<string, string>)) {
      ids.add(id)
    }
  }
  return ids
})()

function parseArgs(rest: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (!a) continue
    if (a.startsWith('--')) {
      const [k, v] = a.replace(/^--/, '').split('=')
      if (v !== undefined) args[k] = v
      else if (rest[i + 1] && !rest[i + 1]!.startsWith('--')) { args[k] = rest[i + 1]!; i++ }
      else args[k] = true
    }
  }
  return args
}

const seedDefs: ModuleCli = {
  command: 'install',
  async run(rest) {
    const args = parseArgs(rest)
    const orgIdArg = (args.org as string) || (args.organizationId as string)
    const tenantIdArg = (args.tenant as string) || (args.tenantId as string)
    const globalFlag = Boolean(args.global)
    const dry = Boolean(args['dry-run'] || args.dry)
    if (!globalFlag && !orgIdArg) {
      console.error('Usage: mercato entities install [--global] [--org <id>] [--tenant <id>] [--dry-run]')
      return
    }
    const targetOrgId = globalFlag ? null : (orgIdArg as string)
    const targetTenantId = globalFlag ? null : (tenantIdArg as string)
    const { resolve } = await createRequestContainer()
    const em = resolve('em') as any

    // 1) Ensure declared custom entities exist (global scope only for now)
    {
      const { modules } = await import('@/generated/modules.generated')
      let created = 0
      for (const m of modules) {
        const entities = (m as any).customEntities as Array<{ id: string; label?: string; description?: string; showInSidebar?: boolean; registerEntity?: boolean }> | undefined
        if (!entities?.length) continue
        for (const ce of entities) {
          if (SYSTEM_ENTITY_IDS.has(ce.id)) continue
          if (ce.registerEntity === false) continue
          await upsertCustomEntity(em as any, ce.id, { label: ce.label || ce.id, description: ce.description || null, organizationId: null, tenantId: null, showInSidebar: !!ce.showInSidebar })
          created++
        }
      }
      if (created > 0) console.log(`Custom entities ensured: ${created}`)
    }

    // 2) Collect all declared fieldSets from enabled modules
    const sets: FieldSetInput[] = []
    for (const m of modules) {
      const fieldSets = (m as any).customFieldSets as any[] | undefined
      if (!fieldSets?.length) continue
      for (const s of fieldSets) sets.push({ entity: s.entity, fields: s.fields, source: s.source ?? m.id })
    }
    if (!sets.length) { console.log('No fieldSets declared by modules. Nothing to seed.'); return }

    const { created, updated } = await ensureCustomFieldDefinitions(em as any, sets, { organizationId: targetOrgId, tenantId: targetTenantId, dryRun: dry })
    console.log(`Field definitions ensured: created=${created}, updated=${updated}${dry ? ' (dry-run)' : ''}`)
  },
}

// Reinstall: remove existing definitions for target scope and re-seed from modules
const reinstallDefs: ModuleCli = {
  command: 'reinstall',
  async run(rest) {
    const args = parseArgs(rest)
    const orgIdArg = (args.org as string) || (args.organizationId as string)
    const tenantIdArg = (args.tenant as string) || (args.tenantId as string)
    const globalFlag = Boolean(args.global)
    const dry = Boolean(args['dry-run'] || args.dry)
    if (!globalFlag && !orgIdArg) {
      console.error('Usage: mercato entities reinstall [--global] [--org <id>] [--tenant <id>] [--dry-run]')
      return
    }
    const targetOrgId = globalFlag ? null : (orgIdArg as string)
    const targetTenantId = globalFlag ? null : (tenantIdArg as string)

    const { resolve } = await createRequestContainer()
    const em = resolve('em') as any

    // Collect all declared fieldSets from enabled modules to know which entities to reset
    const { modules } = await import('@/generated/modules.generated')
    const sets: Array<{ entity: string; fields: any[] }> = []
    for (const m of modules) {
      const fieldSets = (m as any).customFieldSets as any[] | undefined
      if (!fieldSets?.length) continue
      for (const s of fieldSets) sets.push({ entity: s.entity, fields: s.fields })
    }
    if (!sets.length) { console.log('No fieldSets declared by modules. Nothing to reinstall.'); return }

    const entityIds = Array.from(new Set(sets.map((s) => s.entity)))

    // Delete current definitions for those entities in the exact target scope
    const whereBase: any = { entityId: { $in: entityIds }, isActive: true }
    if (targetOrgId == null) whereBase.organizationId = null
    else whereBase.organizationId = targetOrgId
    if (targetTenantId == null) whereBase.tenantId = null
    else whereBase.tenantId = targetTenantId

    const existingCount = await em.count(CustomFieldDef, whereBase)
    if (dry) {
      console.log(`Would delete ${existingCount} definition(s) for scope ${targetOrgId ?? 'GLOBAL'} / ${targetTenantId ?? 'GLOBAL'}`)
    } else if (existingCount > 0) {
      await em.nativeDelete(CustomFieldDef, whereBase)
      console.log(`Deleted ${existingCount} old definition(s) in scope ${targetOrgId ?? 'GLOBAL'} / ${targetTenantId ?? 'GLOBAL'}`)
    }

    // Re-seed like install
    const { created, updated } = await ensureCustomFieldDefinitions(em as any, sets, { organizationId: targetOrgId, tenantId: targetTenantId, dryRun: dry })
    console.log(`Field definitions reinstalled: created=${created}, updated=${updated}${dry ? ' (dry-run)' : ''}`)
  },
}

// Interactive: add a single custom field definition
const addField: ModuleCli = {
  command: 'add-field',
  async run(rest) {
    const args = parseArgs(rest)
    const rl = readline.createInterface({ input, output })
    const ask = async (q: string, d?: string) => {
      const a = (await rl.question(d ? `${q} [${d}]: ` : `${q}: `)).trim()
      return a || (d ?? '')
    }
    const askBool = async (q: string, d = false) => {
      const a = (await ask(q, d ? 'y' : 'n')).toLowerCase()
      return a === 'y' || a === 'yes' || a === 'true'
    }

    try {
      const { resolve } = await createRequestContainer()
      const em = resolve('em') as any

      const entityId = (args.entity as string) || (args.e as string) || await ask('Entity ID (e.g., example:todo)')
      const isGlobal = args.global ? true : await askBool('Global (no organization)?', false)
      const orgId = isGlobal ? null : ((args.org as string) || (args.organizationId as string) || await ask('Organization ID'))
      const tenantId = isGlobal ? null : ((args.tenant as string) || (args.tenantId as string) || await ask('Tenant ID'))
      const key = (args.key as string) || await ask('Field key (snake_case)')
      let kind = (args.kind as string) || await ask("Kind (text|multiline|integer|float|boolean|select|relation|attachment)", 'text')
      kind = kind.toLowerCase()
      if (!['text','multiline','integer','float','boolean','select','relation','attachment'].includes(kind)) throw new Error('Invalid kind')
      const label = (args.label as string) || (await ask('Label', key))
      const description = (args.description as string) || ''
      const required = args.required !== undefined ? Boolean(args.required) : await askBool('Required?', false)
      const multi = args.multi !== undefined ? Boolean(args.multi) : await askBool('Allow multiple?', false)
      let options: string[] | undefined
      if (kind === 'select') {
        const raw = (args.options as string) || await ask('Options (comma-separated)', 'low,medium,high')
        options = raw.split(',').map((s) => s.trim()).filter(Boolean)
      }
      let defaultValue: any = undefined
      const defRaw = (args.default as string) ?? (args.defaultValue as string)
      const needDefault = defRaw !== undefined ? defRaw : await ask('Default value (leave empty for none)', '')
      if (needDefault !== '') {
        switch (kind) {
          case 'integer': defaultValue = Number(needDefault); break
          case 'float': defaultValue = Number(needDefault); break
          case 'boolean': defaultValue = ['y','yes','true','1'].includes(String(needDefault).toLowerCase()); break
          default: defaultValue = String(needDefault)
        }
      }
      const filterable = args.filterable !== undefined ? Boolean(args.filterable) : await askBool('Filterable?', true)
      const listVisible = args.listVisible !== undefined ? Boolean(args.listVisible) : await askBool('Visible in list?', true)
      const formEditable = args.formEditable !== undefined ? Boolean(args.formEditable) : await askBool('Editable in forms?', true)
      const indexed = args.indexed !== undefined ? Boolean(args.indexed) : await askBool('Indexed?', false)

      const where = { entityId, organizationId: orgId, tenantId: tenantId, key }
      const existing = await em.findOne(CustomFieldDef, where)
      const configJson: any = {}
      if (options) configJson.options = options
      if (defaultValue !== undefined) configJson.defaultValue = defaultValue
      if (required !== undefined) configJson.required = required
      if (multi !== undefined) configJson.multi = multi
      if (filterable !== undefined) configJson.filterable = filterable
      if (indexed !== undefined) configJson.indexed = indexed
      if (listVisible !== undefined) configJson.listVisible = listVisible
      if (formEditable !== undefined) configJson.formEditable = formEditable
      if (label !== undefined) configJson.label = label
      if (description !== undefined) configJson.description = description

      if (!existing) {
        await em.persistAndFlush(em.create(CustomFieldDef, {
          entityId,
          organizationId: orgId,
          tenantId: tenantId,
          key,
          kind,
          configJson,
          isActive: true,
        }))
        console.log(`Created custom field: ${entityId}.${key} (${kind})${orgId == null ? ' [global]' : ` [org=${orgId}, tenant=${tenantId}]`}`)
      } else {
        existing.kind = kind as any
        existing.configJson = configJson
        existing.isActive = true
        await em.flush()
        console.log(`Updated custom field: ${entityId}.${key} (${kind})${orgId == null ? ' [global]' : ` [org=${orgId}, tenant=${tenantId}]`}`)
      }
    } catch (e: any) {
      console.error('Failed:', e?.message || e)
    } finally {
      await rl.close()
    }
  },
}

// Keep default export stable (install first for help listing)
export default [seedDefs, reinstallDefs, addField]

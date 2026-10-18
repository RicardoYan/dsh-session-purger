/**
 * dsh-session-purger — browser half.
 *
 * Adds one danger row to the sidebar session menu. The first click asks the
 * Host how many subagent sessions belong to the conversation; the row then
 * names that number and a second click removes the whole tree. An unanswered
 * confirmation falls back to the idle label after a few seconds.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ClientBundleRegistration } from '@deepseek-ai/dsh-client-modules/client'
import type * as Primitives from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

const NS = 'dsh-session-purger'
const ENDPOINT = '/api/dsh-session-purger/purge'
const REVERT_MS = 5000

/** The locale dictionary keys this bundle owns. */
type DictKey =
  | 'menu.delete'
  | 'menu.checking'
  | 'menu.confirm'
  | 'menu.confirmTree'
  | 'menu.deleting'
  | 'menu.leftover'
  | 'menu.failed'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-menu copy for this plugin. */
    'dsh-session-purger': DictKey
  }
}

declare global {
  interface Window {
    /**
     * Installed by DSH before any plugin bundle runs (the loader boots first).
     * Declared required so the call below stays a plain `load`: a missing loader
     * is a broken page, and failing loudly beats a silently inert plugin.
     */
    __ModuleLoader__: { load(registration: ClientBundleRegistration): void }
  }
}

const en: Record<DictKey, string> = {
  'menu.delete': 'Delete session',
  'menu.checking': 'Checking…',
  'menu.confirm': 'Delete permanently? This cannot be undone',
  'menu.confirmTree': 'Delete permanently, with {n} subagent sessions?',
  'menu.deleting': 'Deleting…',
  'menu.leftover': 'Deleted; files still in use are removed on next start',
  'menu.failed': 'Delete failed: {reason}',
}
const zh: Record<DictKey, string> = {
  'menu.delete': '删除会话',
  'menu.checking': '检查中…',
  'menu.confirm': '永久删除？此操作不可撤销',
  'menu.confirmTree': '永久删除？将连同 {n} 个子代理会话一起删除',
  'menu.deleting': '删除中…',
  'menu.leftover': '已删除；仍被占用的文件将在下次启动时清除',
  'menu.failed': '删除失败：{reason}',
}

/** The slice of the Host's answer this row reads. */
interface PurgeBody {
  sessionId: string
  dryRun?: boolean
}

interface PurgeAnswer {
  ok?: boolean
  reason?: string
  message?: string
  subagents?: number
  removed?: string[]
  leftover?: string[]
}

window.__ModuleLoader__.load({
  id: NS,
  factory: (require) => {
    const React = require('react') as typeof import('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives') as typeof Primitives
    const { MenuItemButton, IconTrashOutlineRegular } = primitives
    const { useEffect, useRef, useState } = React
    const h = React.createElement

    async function purge(body: PurgeBody): Promise<{ ok: boolean; data: PurgeAnswer; status: number }> {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dsh-session-purger': '1' },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => ({}))) as PurgeAnswer
      return { ok: response.ok && data.ok === true, data, status: response.status }
    }

    /** Drop this browser's remembered per-session UI state for the removed ids. */
    function forgetLocalState(ids: string[]): void {
      try {
        const doomed: string[] = []
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index)
          if (key === null) continue
          const value = localStorage.getItem(key) ?? ''
          if (ids.some((id) => key.includes(id) || value.includes(id))) doomed.push(key)
        }
        doomed.forEach((key) => localStorage.removeItem(key))
      } catch {
        /* storage unavailable */
      }
    }

    /** The row's own state: a step, plus the notice text some steps carry. */
    type RowState =
      | { step: 'idle' }
      | { step: 'checking' }
      | { step: 'deleting' }
      | { step: 'confirm'; text: string }
      | { step: 'notice'; text: string }

    /**
     * The row's props: the slot's owner share + the `useMenuOpenState` hook
     * (declared by that slot's injection compartment) + the injected business
     * face + the locale `t` seat of this bundle's namespace.
     *
     * `EntryKey` must stay a `string`: this slot is a list, so its key domain
     * is the open string set. Narrowing it to something non-string makes
     * `ComposedProps` fail its constraint and silently degrade to `any` —
     * every prop check in this file would then quietly pass.
     */
    type RowProps = ComposedProps<
      'sidebar.workspaces.session.menu.item',
      string,
      never,
      undefined,
      { sessions: { refresh?: () => void } | undefined },
      never,
      typeof NS
    >

    function DeleteSessionItem({ sessionId, useMenuOpenState, sessions, t }: RowProps) {
      const [, setMenuOpen] = useMenuOpenState()
      const [state, setState] = useState<RowState>({ step: 'idle' })
      const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

      useEffect(() => () => clearTimeout(timer.current), [])

      const settle = (next: RowState): void => {
        clearTimeout(timer.current)
        setState(next)
        timer.current = setTimeout(() => setState({ step: 'idle' }), REVERT_MS)
      }
      const failed = (reason: string): void => settle({ step: 'notice', text: t('menu.failed', { reason }) })

      const askFirst = async (): Promise<void> => {
        setState({ step: 'checking' })
        try {
          const { ok, data, status } = await purge({ sessionId, dryRun: true })
          if (!ok) return failed(data.message ?? data.reason ?? String(status))
          const n = data.subagents ?? 0
          settle({ step: 'confirm', text: n > 0 ? t('menu.confirmTree', { n }) : t('menu.confirm') })
        } catch (error) {
          failed(String((error as { message?: unknown } | undefined)?.message ?? error))
        }
      }

      const remove = async (): Promise<void> => {
        clearTimeout(timer.current)
        setState({ step: 'deleting' })
        try {
          const { ok, data, status } = await purge({ sessionId })
          if (!ok && data.reason !== 'not-found') return failed(data.message ?? data.reason ?? String(status))
          forgetLocalState([sessionId, ...(data.removed ?? []), ...(data.leftover ?? [])])
          try {
            sessions?.refresh?.()
          } catch {
            /* the next list pull converges */
          }
          if ((data.leftover ?? []).length > 0) return settle({ step: 'notice', text: t('menu.leftover') })
          setMenuOpen(false)
        } catch (error) {
          failed(String((error as { message?: unknown } | undefined)?.message ?? error))
        }
      }

      const idleLabel: Partial<Record<RowState['step'], string>> = {
        idle: t('menu.delete'),
        checking: t('menu.checking'),
        deleting: t('menu.deleting'),
      }
      const label = idleLabel[state.step] ?? ('text' in state ? state.text : '')

      return h(MenuItemButton, {
        danger: true,
        disabled: state.step === 'checking' || state.step === 'deleting',
        icon: h(IconTrashOutlineRegular, { size: 14 }),
        onSelect: () => (state.step === 'confirm' ? remove() : askFirst()),
        children: label,
      })
    }

    return {
      name: 'dsh-session-purger-ui',
      inject: ['slots', 'locale'],
      apply(ctx: Context) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-purger: dictionaries')
        ctx.slots.inject('sidebar.workspaces.session.menu.item', function* () {
          yield ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'dsh-session-purger',
              order: 900,
              locale: NS,
              inject: () => ({ sessions: ctx.get('sessions') as { refresh?: () => void } | undefined }),
            },
            DeleteSessionItem,
          )
        })
      },
    }
  },
})

/**
 * dsh-session-purger — browser half.
 *
 * Two seats work together, mirroring how DSH's own archive action is built:
 *
 * - a `contextMenus` entry in the session menu, ordered INSIDE the archive
 *   group so it renders below it. The menu renders ordinary entries, then the
 *   `sidebar.workspaces.session.menu.item` slot rows, then the `afterContent`
 *   entries (archive). A slot row can therefore never sit below archive, which
 *   is why this one is a menu-registry entry with `afterContent: true` instead;
 * - a `shell.overlay` dialog that owns the confirmation and the whole delete
 *   flow. Clicking the entry only records the target session and opens it.
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

/** The locale dictionary keys this bundle owns. */
type DictKey =
  | 'menu.delete'
  | 'dialog.title'
  | 'dialog.body'
  | 'dialog.bodyTree'
  | 'dialog.checking'
  | 'dialog.deleting'
  | 'dialog.cancel'
  | 'dialog.action'
  | 'dialog.leftover'
  | 'dialog.failed'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-menu and confirm-dialog copy for this plugin. */
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
  'dialog.title': 'Delete this session permanently?',
  'dialog.body': 'This removes the conversation and its stored log. It cannot be undone.',
  'dialog.bodyTree': 'This removes the conversation and the {n} subagent sessions under it. It cannot be undone.',
  'dialog.checking': 'Checking for subagent sessions…',
  'dialog.deleting': 'Deleting…',
  'dialog.cancel': 'Cancel',
  'dialog.action': 'Delete permanently',
  'dialog.leftover': 'Deleted. Files still in use are removed the next time DSH starts.',
  'dialog.failed': 'Delete failed: {reason}',
}
const zh: Record<DictKey, string> = {
  'menu.delete': '删除会话',
  'dialog.title': '永久删除这个会话？',
  'dialog.body': '会话和它的日志都会被删除，此操作不可撤销。',
  'dialog.bodyTree': '会话和它下面的 {n} 个子代理会话都会被删除，此操作不可撤销。',
  'dialog.checking': '正在检查子代理会话…',
  'dialog.deleting': '删除中…',
  'dialog.cancel': '取消',
  'dialog.action': '永久删除',
  'dialog.leftover': '已删除。仍被占用的文件会在下次启动 DSH 时清除。',
  'dialog.failed': '删除失败：{reason}',
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
    const { useEffect, useState } = React
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

    /** Which session the open dialog is for, or `null` when nothing is pending. */
    type Pending = { sessionId: string; displayTitle: string } | null

    /** The dialog's own progress, separate from the pending target so it resets per opening. */
    type Stage =
      | { step: 'checking' }
      | { step: 'idle' }
      | { step: 'deleting' }
      | { step: 'notice'; text: string }

    /**
     * The pending target is shared by the menu entry (which only sets it) and
     * the overlay dialog (which reads it). A plain snapshot store keeps the two
     * seats in sync without either owning React state the other cannot see.
     */
    interface PendingStore {
      get(): Pending
      set(next: Pending): void
      subscribe(listener: () => void): () => void
    }

    function createPendingStore(): PendingStore {
      let value: Pending = null
      const listeners = new Set<() => void>()
      return {
        get: () => value,
        set(next) {
          value = next
          listeners.forEach((listener) => listener())
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    /**
     * The dialog's props: the overlay slot's owner share, the injected business
     * face, and this bundle's locale seat.
     *
     * `EntryKey` stays `string` for the same reason the menu slot did: a
     * non-string key domain degrades `ComposedProps` to `any` and every prop
     * check in this file would silently pass.
     */
    type DialogProps = ComposedProps<
      'shell.overlay',
      string,
      never,
      undefined,
      {
        sessions: { refresh?: () => void } | undefined
        store: PendingStore
      },
      never,
      typeof NS
    >

    function DeleteSessionDialog({ sessions, store, t }: DialogProps) {
      const { Modal, Button } = primitives
      const target = React.useSyncExternalStore(store.subscribe, store.get, store.get)
      const [stage, setStage] = useState<Stage>({ step: 'checking' })
      const [count, setCount] = useState(0)

      // A new target starts a fresh check; closing resets so a reopen re-checks.
      useEffect(() => {
        if (target === null) return undefined
        let live = true
        setStage({ step: 'checking' })
        void (async () => {
          try {
            const { ok, data, status } = await purge({ sessionId: target.sessionId, dryRun: true })
            if (!live) return
            if (!ok) {
              setStage({ step: 'notice', text: t('dialog.failed', { reason: data.message ?? data.reason ?? String(status) }) })
              return
            }
            setStage({ step: 'idle' })
            setCount(data.subagents ?? 0)
          } catch (error) {
            if (!live) return
            setStage({
              step: 'notice',
              text: t('dialog.failed', {
                reason: String((error as { message?: unknown } | undefined)?.message ?? error),
              }),
            })
          }
        })()
        return () => {
          live = false
        }
      }, [target, t])

      if (target === null) return null

      const busy = stage.step === 'checking' || stage.step === 'deleting'
      const close = (): void => {
        if (busy) return
        store.set(null)
      }

      const confirm = async (): Promise<void> => {
        setStage({ step: 'deleting' })
        try {
          const { ok, data, status } = await purge({ sessionId: target.sessionId })
          if (!ok && data.reason !== 'not-found') {
            setStage({ step: 'notice', text: t('dialog.failed', { reason: data.message ?? data.reason ?? String(status) }) })
            return
          }
          forgetLocalState([target.sessionId, ...(data.removed ?? []), ...(data.leftover ?? [])])
          try {
            sessions?.refresh?.()
          } catch {
            /* the next list pull converges */
          }
          if ((data.leftover ?? []).length > 0) {
            setStage({ step: 'notice', text: t('dialog.leftover') })
            return
          }
          store.set(null)
        } catch (error) {
          setStage({
            step: 'notice',
            text: t('dialog.failed', {
              reason: String((error as { message?: unknown } | undefined)?.message ?? error),
            }),
          })
        }
      }

      const body =
        stage.step === 'checking'
          ? t('dialog.checking')
          : stage.step === 'deleting'
            ? t('dialog.deleting')
            : stage.step === 'notice'
              ? stage.text
              : count > 0
                ? t('dialog.bodyTree', { n: count })
                : t('dialog.body')

      return h(Modal, {
        open: true,
        onClose: close,
        closeLabel: t('dialog.cancel'),
        title: t('dialog.title'),
        description: body,
        footer: h(
          React.Fragment,
          null,
          h(Button, { variant: 'outline', disabled: busy, onClick: close, children: t('dialog.cancel') }),
          h(Button, {
            variant: 'outline',
            disabled: busy || stage.step === 'notice',
            onClick: () => void confirm(),
            children: t('dialog.action'),
          }),
        ),
      })
    }

    /**
     * One session-menu contribution as the `contextMenus` service takes it.
     *
     * Declared here rather than imported: `@deepseek-ai/dsh-client-ui-context-menu`
     * is not a dependency of this package (the service is looked up through the
     * client context), so there is no declaration file to import from. The shape
     * mirrors what `dsh-client-ui-workspace` passes for its own archive row.
     */
    interface SessionMenuEntry {
      id: string
      label: string
      icon?: { key: string }
      danger?: boolean
      afterContent?: boolean
      commandId?: string
      disabled?: boolean
      run: () => void
    }

    interface ContextMenusService {
      register(input: {
        id: string
        target: 'session'
        order: number
        observe?: (target: { sessionId: string }) => unknown[]
        resolve: (target: { sessionId: string; displayTitle?: string }) => SessionMenuEntry[]
      }): () => void
    }

    return {
      name: 'dsh-session-purger-ui',
      inject: ['slots', 'locale'],
      apply(ctx: Context) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-purger: dictionaries')
        const store = createPendingStore()
        const sessions = ctx.get('sessions') as { refresh?: () => void } | undefined

        // The menu entry only records the target. `afterContent` puts it in the
        // menu's footer list beside archive, which is the only way to render
        // below that row: ordinary slot rows always sit above `afterContent`.
        ctx.inject(['contextMenus'], (c) => {
          const menus = c.contextMenus as unknown as ContextMenusService
          if (menus === undefined || typeof menus.register !== 'function') {
            ctx.logger?.warn?.(`${NS}: ctx.contextMenus missing; delete row not added to the session menu`)
            return
          }
          menus.register({
            id: 'dsh-session-purger.delete',
            target: 'session',
            // Archive is 600; 601 sorts directly beneath it.
            order: 601,
            resolve: (target) => [
              {
                id: 'delete',
                label: String(ctx.locale.bind(NS)('menu.delete')),
                icon: { key: 'workspace.delete' },
                danger: true,
                // `afterContent` belongs on the ACTION, not on `register`: the
                // registry keeps only id/target/order/observe/resolve and the
                // menu splits actions into body vs footer by this flag. Archive
                // sets it too, which is why it always renders last.
                afterContent: true,
                run: () => {
                  store.set({ sessionId: target.sessionId, displayTitle: target.displayTitle ?? '' })
                },
              },
            ],
          })
        })

        ctx.slots.inject('shell.overlay', function* () {
          yield ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-session-purger.confirm',
              locale: NS,
              inject: () => ({ sessions, store }),
            },
            DeleteSessionDialog,
          )
        })
      },
    }
  },
})

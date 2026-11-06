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
 * - a `shell.overlay` dialog that owns the confirmation. Clicking the entry
 *   only records the target session and opens it; confirming closes the dialog
 *   at once and hands the purge to a one-at-a-time queue;
 * - a `shell.overlay` Toast that reports what the closed dialog can no longer
 *   say: a refused purge, or one that left files behind.
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
  'dialog.cancel': '取消',
  'dialog.action': '永久删除',
  'dialog.leftover': '已删除。仍被占用的文件会在下次启动 DSH 时清除。',
  'dialog.failed': '删除失败：{reason}',
}

// DSH 0.2.2 ships eight UI languages. `ctx.locale.register` takes a dictionary
// per locale id, so the remaining six are plain objects here; a language DSH
// gains later simply falls back to the built-in English dictionary.
const de: Record<DictKey, string> = {
  'menu.delete': 'Sitzung löschen',
  'dialog.title': 'Diese Sitzung endgültig löschen?',
  'dialog.body': 'Der Verlauf und sein Protokoll werden entfernt. Das lässt sich nicht rückgängig machen.',
  'dialog.bodyTree':
    'Der Verlauf und die {n} Subagenten-Sitzungen darunter werden entfernt. Das lässt sich nicht rückgängig machen.',
  'dialog.checking': 'Subagenten-Sitzungen werden geprüft…',
  'dialog.cancel': 'Abbrechen',
  'dialog.action': 'Endgültig löschen',
  'dialog.leftover': 'Gelöscht. Noch verwendete Dateien werden beim nächsten Start von DSH entfernt.',
  'dialog.failed': 'Löschen fehlgeschlagen: {reason}',
}
const es: Record<DictKey, string> = {
  'menu.delete': 'Eliminar sesión',
  'dialog.title': '¿Eliminar esta sesión de forma permanente?',
  'dialog.body': 'Se eliminarán la conversación y su registro. Esta acción no se puede deshacer.',
  'dialog.bodyTree':
    'Se eliminarán la conversación y las {n} sesiones de subagentes que dependen de ella. Esta acción no se puede deshacer.',
  'dialog.checking': 'Comprobando sesiones de subagentes…',
  'dialog.cancel': 'Cancelar',
  'dialog.action': 'Eliminar permanentemente',
  'dialog.leftover': 'Eliminado. Los archivos aún en uso se borrarán la próxima vez que se inicie DSH.',
  'dialog.failed': 'Error al eliminar: {reason}',
}
const fr: Record<DictKey, string> = {
  'menu.delete': 'Supprimer la session',
  'dialog.title': 'Supprimer définitivement cette session ?',
  'dialog.body': 'La conversation et son journal seront supprimés. Cette action est irréversible.',
  'dialog.bodyTree':
    'La conversation et les {n} sessions de sous-agents qu\'elle contient seront supprimées. Cette action est irréversible.',
  'dialog.checking': 'Recherche des sessions de sous-agents…',
  'dialog.cancel': 'Annuler',
  'dialog.action': 'Supprimer définitivement',
  'dialog.leftover': 'Supprimé. Les fichiers encore utilisés seront effacés au prochain démarrage de DSH.',
  'dialog.failed': 'Échec de la suppression : {reason}',
}
const ja: Record<DictKey, string> = {
  'menu.delete': 'セッションを削除',
  'dialog.title': 'このセッションを完全に削除しますか？',
  'dialog.body': '会話とそのログが削除されます。この操作は取り消せません。',
  'dialog.bodyTree': '会話と、その下にある {n} 個のサブエージェントセッションが削除されます。この操作は取り消せません。',
  'dialog.checking': 'サブエージェントセッションを確認しています…',
  'dialog.cancel': 'キャンセル',
  'dialog.action': '完全に削除',
  'dialog.leftover': '削除しました。使用中のファイルは次回 DSH の起動時に削除されます。',
  'dialog.failed': '削除に失敗しました：{reason}',
}
const pt: Record<DictKey, string> = {
  'menu.delete': 'Excluir sessão',
  'dialog.title': 'Excluir esta sessão permanentemente?',
  'dialog.body': 'A conversa e o registro serão removidos. Esta ação não pode ser desfeita.',
  'dialog.bodyTree':
    'A conversa e as {n} sessões de subagentes abaixo dela serão removidas. Esta ação não pode ser desfeita.',
  'dialog.checking': 'Verificando sessões de subagentes…',
  'dialog.cancel': 'Cancelar',
  'dialog.action': 'Excluir permanentemente',
  'dialog.leftover': 'Excluído. Os arquivos ainda em uso serão removidos na próxima vez que o DSH iniciar.',
  'dialog.failed': 'Falha ao excluir: {reason}',
}
const ru: Record<DictKey, string> = {
  'menu.delete': 'Удалить сеанс',
  'dialog.title': 'Удалить этот сеанс безвозвратно?',
  'dialog.body': 'Разговор и его журнал будут удалены. Это действие нельзя отменить.',
  'dialog.bodyTree':
    'Разговор и {n} сеансов субагентов под ним будут удалены. Это действие нельзя отменить.',
  'dialog.checking': 'Проверяем сеансы субагентов…',
  'dialog.cancel': 'Отмена',
  'dialog.action': 'Удалить безвозвратно',
  'dialog.leftover': 'Удалено. Файлы, которые ещё используются, будут удалены при следующем запуске DSH.',
  'dialog.failed': 'Не удалось удалить: {reason}',
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

    /**
     * The dialog's own progress, separate from the pending target so it resets
     * per opening. Confirming closes the dialog and hands the work to the
     * queue, so there is no in-dialog "deleting" stage.
     */
    type Stage = { step: 'checking' } | { step: 'idle' } | { step: 'notice'; text: string }

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
     * A purge still in flight. The store runs one request at a time: the Host's
     * leftovers file is a read-modify-write, so two overlapping purges that
     * both leave files behind can lose one of the two entries.
     */
    interface TaskQueue {
      push(task: () => Promise<void>): void
    }

    function createTaskQueue(): TaskQueue {
      const pending: Array<() => Promise<void>> = []
      let running = false
      const pump = async (): Promise<void> => {
        if (running) return
        running = true
        try {
          for (let task = pending.shift(); task !== undefined; task = pending.shift()) {
            try {
              await task()
            } catch {
              /* one failed purge must not stall the ones queued behind it */
            }
          }
        } finally {
          running = false
        }
      }
      return {
        push(task) {
          pending.push(task)
          void pump()
        },
      }
    }

    /** One transient notice for the Toast seat: a new `seq` remounts it. */
    type Notice = { text: string; seq: number } | null

    interface NoticeStore {
      get(): Notice
      show(text: string): void
      dismiss(): void
      subscribe(listener: () => void): () => void
    }

    function createNoticeStore(): NoticeStore {
      let value: Notice = null
      let seq = 0
      const listeners = new Set<() => void>()
      const publish = (next: Notice): void => {
        value = next
        listeners.forEach((listener) => listener())
      }
      return {
        get: () => value,
        show: (text) => publish({ text, seq: (seq += 1) }),
        dismiss: () => publish(null),
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
        queue: TaskQueue
        notice: NoticeStore
      },
      never,
      typeof NS
    >

    function DeleteSessionDialog({ sessions, store, queue, notice, t }: DialogProps) {
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

      const close = (): void => {
        store.set(null)
      }

      // Close first, then let the queue report the outcome through the Toast
      // seat: waiting here would freeze the dialog for the Host's settle delay
      // plus up to four file-removal retries.
      const confirm = (): void => {
        const sessionId = target.sessionId
        store.set(null)
        queue.push(async () => {
          try {
            const { ok, data, status } = await purge({ sessionId })
            if (!ok && data.reason !== 'not-found') {
              notice.show(t('dialog.failed', { reason: data.message ?? data.reason ?? String(status) }))
              return
            }
            forgetLocalState([sessionId, ...(data.removed ?? []), ...(data.leftover ?? [])])
            try {
              sessions?.refresh?.()
            } catch {
              /* the next list pull converges */
            }
            if ((data.leftover ?? []).length > 0) notice.show(t('dialog.leftover'))
          } catch (error) {
            notice.show(
              t('dialog.failed', {
                reason: String((error as { message?: unknown } | undefined)?.message ?? error),
              }),
            )
          }
        })
      }

      const body =
        stage.step === 'checking'
          ? t('dialog.checking')
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
          h(Button, { variant: 'outline', onClick: close, children: t('dialog.cancel') }),
          h(Button, {
            variant: 'outline',
            disabled: stage.step === 'checking' || stage.step === 'notice',
            onClick: confirm,
            children: t('dialog.action'),
          }),
        ),
      })
    }

    /**
     * The Toast seat: a failed purge, or one that left files behind, is
     * reported here after the dialog has already closed. The copy arrives
     * already translated, so this seat owns no locale namespace.
     */
    type ToastProps = ComposedProps<
      'shell.overlay',
      string,
      never,
      undefined,
      { notice: NoticeStore }
    >

    function PurgeToast({ notice }: ToastProps) {
      const { Toast } = primitives
      const current = React.useSyncExternalStore(notice.subscribe, notice.get, notice.get)
      if (current === null) return null
      return h(Toast, {
        key: current.seq,
        text: current.text,
        icon: h(primitives.IconWarningOutlineRegular, null),
        // Failures name what broke, so they get longer than the default hold.
        holdMs: 6000,
        onDone: notice.dismiss,
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
        ctx.effect(() => ctx.locale.register(NS, { zh, en, de, es, fr, ja, pt, ru }), 'dsh-session-purger: dictionaries')
        const store = createPendingStore()
        const queue = createTaskQueue()
        const notice = createNoticeStore()
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
              inject: () => ({ sessions, store, queue, notice }),
            },
            DeleteSessionDialog,
          )
          yield ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-session-purger.notice',
              inject: () => ({ notice }),
            },
            PurgeToast,
          )
        })
      },
    }
  },
})

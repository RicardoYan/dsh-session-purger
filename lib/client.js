(() => {
const NS = 'dsh-session-purger';
const ENDPOINT = '/api/dsh-session-purger/purge';
const en = {
    'menu.delete': 'Delete session',
    'dialog.title': 'Delete this session permanently?',
    'dialog.body': 'This removes the conversation and its stored log. It cannot be undone.',
    'dialog.bodyTree': 'This removes the conversation and the {n} subagent sessions under it. It cannot be undone.',
    'dialog.checking': 'Checking for subagent sessions…',
    'dialog.cancel': 'Cancel',
    'dialog.action': 'Delete permanently',
    'dialog.leftover': 'Deleted. Files still in use are removed the next time DSH starts.',
    'dialog.failed': 'Delete failed: {reason}',
};
const zh = {
    'menu.delete': '删除会话',
    'dialog.title': '永久删除这个会话？',
    'dialog.body': '会话和它的日志都会被删除，此操作不可撤销。',
    'dialog.bodyTree': '会话和它下面的 {n} 个子代理会话都会被删除，此操作不可撤销。',
    'dialog.checking': '正在检查子代理会话…',
    'dialog.cancel': '取消',
    'dialog.action': '永久删除',
    'dialog.leftover': '已删除。仍被占用的文件会在下次启动 DSH 时清除。',
    'dialog.failed': '删除失败：{reason}',
};
// DSH 0.2.2 ships eight UI languages. `ctx.locale.register` takes a dictionary
// per locale id, so the remaining six are plain objects here; a language DSH
// gains later simply falls back to the built-in English dictionary.
const de = {
    'menu.delete': 'Sitzung löschen',
    'dialog.title': 'Diese Sitzung endgültig löschen?',
    'dialog.body': 'Der Verlauf und sein Protokoll werden entfernt. Das lässt sich nicht rückgängig machen.',
    'dialog.bodyTree': 'Der Verlauf und die {n} Subagenten-Sitzungen darunter werden entfernt. Das lässt sich nicht rückgängig machen.',
    'dialog.checking': 'Subagenten-Sitzungen werden geprüft…',
    'dialog.cancel': 'Abbrechen',
    'dialog.action': 'Endgültig löschen',
    'dialog.leftover': 'Gelöscht. Noch verwendete Dateien werden beim nächsten Start von DSH entfernt.',
    'dialog.failed': 'Löschen fehlgeschlagen: {reason}',
};
const es = {
    'menu.delete': 'Eliminar sesión',
    'dialog.title': '¿Eliminar esta sesión de forma permanente?',
    'dialog.body': 'Se eliminarán la conversación y su registro. Esta acción no se puede deshacer.',
    'dialog.bodyTree': 'Se eliminarán la conversación y las {n} sesiones de subagentes que dependen de ella. Esta acción no se puede deshacer.',
    'dialog.checking': 'Comprobando sesiones de subagentes…',
    'dialog.cancel': 'Cancelar',
    'dialog.action': 'Eliminar permanentemente',
    'dialog.leftover': 'Eliminado. Los archivos aún en uso se borrarán la próxima vez que se inicie DSH.',
    'dialog.failed': 'Error al eliminar: {reason}',
};
const fr = {
    'menu.delete': 'Supprimer la session',
    'dialog.title': 'Supprimer définitivement cette session ?',
    'dialog.body': 'La conversation et son journal seront supprimés. Cette action est irréversible.',
    'dialog.bodyTree': 'La conversation et les {n} sessions de sous-agents qu\'elle contient seront supprimées. Cette action est irréversible.',
    'dialog.checking': 'Recherche des sessions de sous-agents…',
    'dialog.cancel': 'Annuler',
    'dialog.action': 'Supprimer définitivement',
    'dialog.leftover': 'Supprimé. Les fichiers encore utilisés seront effacés au prochain démarrage de DSH.',
    'dialog.failed': 'Échec de la suppression : {reason}',
};
const ja = {
    'menu.delete': 'セッションを削除',
    'dialog.title': 'このセッションを完全に削除しますか？',
    'dialog.body': '会話とそのログが削除されます。この操作は取り消せません。',
    'dialog.bodyTree': '会話と、その下にある {n} 個のサブエージェントセッションが削除されます。この操作は取り消せません。',
    'dialog.checking': 'サブエージェントセッションを確認しています…',
    'dialog.cancel': 'キャンセル',
    'dialog.action': '完全に削除',
    'dialog.leftover': '削除しました。使用中のファイルは次回 DSH の起動時に削除されます。',
    'dialog.failed': '削除に失敗しました：{reason}',
};
const pt = {
    'menu.delete': 'Excluir sessão',
    'dialog.title': 'Excluir esta sessão permanentemente?',
    'dialog.body': 'A conversa e o registro serão removidos. Esta ação não pode ser desfeita.',
    'dialog.bodyTree': 'A conversa e as {n} sessões de subagentes abaixo dela serão removidas. Esta ação não pode ser desfeita.',
    'dialog.checking': 'Verificando sessões de subagentes…',
    'dialog.cancel': 'Cancelar',
    'dialog.action': 'Excluir permanentemente',
    'dialog.leftover': 'Excluído. Os arquivos ainda em uso serão removidos na próxima vez que o DSH iniciar.',
    'dialog.failed': 'Falha ao excluir: {reason}',
};
const ru = {
    'menu.delete': 'Удалить сеанс',
    'dialog.title': 'Удалить этот сеанс безвозвратно?',
    'dialog.body': 'Разговор и его журнал будут удалены. Это действие нельзя отменить.',
    'dialog.bodyTree': 'Разговор и {n} сеансов субагентов под ним будут удалены. Это действие нельзя отменить.',
    'dialog.checking': 'Проверяем сеансы субагентов…',
    'dialog.cancel': 'Отмена',
    'dialog.action': 'Удалить безвозвратно',
    'dialog.leftover': 'Удалено. Файлы, которые ещё используются, будут удалены при следующем запуске DSH.',
    'dialog.failed': 'Не удалось удалить: {reason}',
};
window.__ModuleLoader__.load({
    id: NS,
    factory: (require) => {
        const React = require('react');
        const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
        const { useEffect, useState } = React;
        const h = React.createElement;
        async function purge(body) {
            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-dsh-session-purger': '1' },
                body: JSON.stringify(body),
            });
            const data = (await response.json().catch(() => ({})));
            return { ok: response.ok && data.ok === true, data, status: response.status };
        }
        /** Drop this browser's remembered per-session UI state for the removed ids. */
        function forgetLocalState(ids) {
            try {
                const doomed = [];
                for (let index = 0; index < localStorage.length; index += 1) {
                    const key = localStorage.key(index);
                    if (key === null)
                        continue;
                    const value = localStorage.getItem(key) ?? '';
                    if (ids.some((id) => key.includes(id) || value.includes(id)))
                        doomed.push(key);
                }
                doomed.forEach((key) => localStorage.removeItem(key));
            }
            catch {
                /* storage unavailable */
            }
        }
        function createPendingStore() {
            let value = null;
            const listeners = new Set();
            return {
                get: () => value,
                set(next) {
                    value = next;
                    listeners.forEach((listener) => listener());
                },
                subscribe(listener) {
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
            };
        }
        function createTaskQueue() {
            const pending = [];
            let running = false;
            const pump = async () => {
                if (running)
                    return;
                running = true;
                try {
                    for (let task = pending.shift(); task !== undefined; task = pending.shift()) {
                        try {
                            await task();
                        }
                        catch {
                            /* one failed purge must not stall the ones queued behind it */
                        }
                    }
                }
                finally {
                    running = false;
                }
            };
            return {
                push(task) {
                    pending.push(task);
                    void pump();
                },
            };
        }
        function createNoticeStore() {
            let value = null;
            let seq = 0;
            const listeners = new Set();
            const publish = (next) => {
                value = next;
                listeners.forEach((listener) => listener());
            };
            return {
                get: () => value,
                show: (text) => publish({ text, seq: (seq += 1) }),
                dismiss: () => publish(null),
                subscribe(listener) {
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
            };
        }
        function DeleteSessionDialog({ sessions, store, queue, notice, t }) {
            const { Modal, Button } = primitives;
            const target = React.useSyncExternalStore(store.subscribe, store.get, store.get);
            const [stage, setStage] = useState({ step: 'checking' });
            const [count, setCount] = useState(0);
            // A new target starts a fresh check; closing resets so a reopen re-checks.
            useEffect(() => {
                if (target === null)
                    return undefined;
                let live = true;
                setStage({ step: 'checking' });
                void (async () => {
                    try {
                        const { ok, data, status } = await purge({ sessionId: target.sessionId, dryRun: true });
                        if (!live)
                            return;
                        if (!ok) {
                            setStage({ step: 'notice', text: t('dialog.failed', { reason: data.message ?? data.reason ?? String(status) }) });
                            return;
                        }
                        setStage({ step: 'idle' });
                        setCount(data.subagents ?? 0);
                    }
                    catch (error) {
                        if (!live)
                            return;
                        setStage({
                            step: 'notice',
                            text: t('dialog.failed', {
                                reason: String(error?.message ?? error),
                            }),
                        });
                    }
                })();
                return () => {
                    live = false;
                };
            }, [target, t]);
            if (target === null)
                return null;
            const close = () => {
                store.set(null);
            };
            // Close first, then let the queue report the outcome through the Toast
            // seat: waiting here would freeze the dialog for the Host's settle delay
            // plus up to four file-removal retries.
            const confirm = () => {
                const sessionId = target.sessionId;
                store.set(null);
                queue.push(async () => {
                    try {
                        const { ok, data, status } = await purge({ sessionId });
                        if (!ok && data.reason !== 'not-found') {
                            notice.show(t('dialog.failed', { reason: data.message ?? data.reason ?? String(status) }));
                            return;
                        }
                        forgetLocalState([sessionId, ...(data.removed ?? []), ...(data.leftover ?? [])]);
                        try {
                            sessions?.refresh?.();
                        }
                        catch {
                            /* the next list pull converges */
                        }
                        if ((data.leftover ?? []).length > 0)
                            notice.show(t('dialog.leftover'));
                    }
                    catch (error) {
                        notice.show(t('dialog.failed', {
                            reason: String(error?.message ?? error),
                        }));
                    }
                });
            };
            const body = stage.step === 'checking'
                ? t('dialog.checking')
                : stage.step === 'notice'
                    ? stage.text
                    : count > 0
                        ? t('dialog.bodyTree', { n: count })
                        : t('dialog.body');
            return h(Modal, {
                open: true,
                onClose: close,
                closeLabel: t('dialog.cancel'),
                title: t('dialog.title'),
                description: body,
                footer: h(React.Fragment, null, h(Button, { variant: 'outline', onClick: close, children: t('dialog.cancel') }), h(Button, {
                    variant: 'outline',
                    disabled: stage.step === 'checking' || stage.step === 'notice',
                    onClick: confirm,
                    children: t('dialog.action'),
                })),
            });
        }
        function PurgeToast({ notice }) {
            const { Toast } = primitives;
            const current = React.useSyncExternalStore(notice.subscribe, notice.get, notice.get);
            if (current === null)
                return null;
            return h(Toast, {
                key: current.seq,
                text: current.text,
                icon: h(primitives.IconWarningOutlineRegular, null),
                // Failures name what broke, so they get longer than the default hold.
                holdMs: 6000,
                onDone: notice.dismiss,
            });
        }
        return {
            name: 'dsh-session-purger-ui',
            inject: ['slots', 'locale'],
            apply(ctx) {
                ctx.effect(() => ctx.locale.register(NS, { zh, en, de, es, fr, ja, pt, ru }), 'dsh-session-purger: dictionaries');
                const store = createPendingStore();
                const queue = createTaskQueue();
                const notice = createNoticeStore();
                const sessions = ctx.get('sessions');
                // The menu entry only records the target. `afterContent` puts it in the
                // menu's footer list beside archive, which is the only way to render
                // below that row: ordinary slot rows always sit above `afterContent`.
                ctx.inject(['contextMenus'], (c) => {
                    const menus = c.contextMenus;
                    if (menus === undefined || typeof menus.register !== 'function') {
                        ctx.logger?.warn?.(`${NS}: ctx.contextMenus missing; delete row not added to the session menu`);
                        return;
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
                                    store.set({ sessionId: target.sessionId, displayTitle: target.displayTitle ?? '' });
                                },
                            },
                        ],
                    });
                });
                ctx.slots.inject('shell.overlay', function* () {
                    yield ctx.slots.register({
                        name: 'shell.overlay',
                        id: 'dsh-session-purger.confirm',
                        locale: NS,
                        inject: () => ({ sessions, store, queue, notice }),
                    }, DeleteSessionDialog);
                    yield ctx.slots.register({
                        name: 'shell.overlay',
                        id: 'dsh-session-purger.notice',
                        inject: () => ({ notice }),
                    }, PurgeToast);
                });
            },
        };
    },
});
})();

// Guards the type chain this plugin's browser half depends on.
//
// `ComposedProps` builds a real object type only while every module its shares
// import is reachable. On 2026-10-18 `@deepseek-ai/dsh-client-store` — a type
// dependency of `@deepseek-ai/dsh-client-ui-slots`, not a runtime one — was
// never installed, and `PropsStore` degraded the whole intersection into an
// open type: every prop and locale-key check in `client.ts` then passed
// without checking anything, silently.
//
// A "is it `any`" probe does NOT catch that: the degraded type is not literally
// `any`, it just accepts any key. So the assertions below check the observable
// consequence — that an unknown key and an unknown dictionary key are both
// rejected — and fail to compile whenever that stops being true.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-modules/client'
import type {} from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ComposedProps, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** The slot this plugin's row registers into. */
export type ROW_SLOT = 'sidebar.workspaces.session.menu.item'

/** The composed props of that row, exactly as `client.ts` declares them. */
export type RowProps = ComposedProps<
  ROW_SLOT,
  string,
  never,
  undefined,
  { sessions: unknown },
  never,
  'dsh-session-purger'
>

/** `'ACCEPTED'` when a key the owner never supplies still passes: the props type degraded. */
type UnknownKeyVerdict<T, K extends string> = K extends keyof T ? 'ACCEPTED' : 'REJECTED'
/** `'ACCEPTED'` when an unknown dictionary key passes: the locale share degraded. */
type UnknownDictKeyVerdict<K extends string> = K extends TranslateNS<'dsh-session-purger'> ? 'ACCEPTED' : 'REJECTED'

// Both must stay rejected. A degraded props type accepts any key, so either
// line becoming 'ACCEPTED' fails this compile.
export const unknownPropRejected: UnknownKeyVerdict<RowProps, '__not_a_real_prop__'> = 'REJECTED'
export const unknownLocaleKeyRejected: UnknownDictKeyVerdict<'__not_a_real_key__'> = 'REJECTED'

// The real owner share must still be readable, so a wholly broken chain fails
// here too rather than passing an over-strict assertion.
export const realOwnerKey: keyof RowProps = 'displayTitle'
export const realLocaleKey: keyof RowProps = 't'

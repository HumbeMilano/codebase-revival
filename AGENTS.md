<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Application and state

- This is a functional household application, not a device preview. Use responsive layouts and real household data. Do not restore demo PINs, fixed weather, fixed calendar dates or fictitious agenda entries.
- Use the shared finance visibility predicate for every financial UI surface; financial tables also require server-side authorization through `db()`.
- Dashboard gestures use deliberate holds, pointer cancellation, keyboard alternatives and reduced-motion transitions. Preserve saved layouts when expanding the widget catalogue.
- `public/widgets-lab.html` is the owner's standalone widget review prototype. Keep its clearly labeled example data, annotations and preferences isolated from household APIs and production layouts. The lab permits one widget of each type, supports two-finger scrolling while editing, and exports feedback; do not imply annotations reach the chat automatically. Prototype approval and production integration are separate steps.
- Shopping lists are independent household records, not product categories. The original list keeps the household UUID so pre-update outboxes still target it. Preserve durable list/product queues, caller-bound receipts and revision conflicts; archiving must retain products.
- Dashboard layouts contain widget types, instance keys, sizes and optional member/note/list reference IDs only; never cache names, note text or financial data in preferences. Load legacy versions 1 and 2 into version 3, retaining the first instance of each widget type and its choices. Keep old local storage intact. Version 3 allows one widget of each type. Personal accounts save their own RLS-scoped preferences with revision checks; shared-tablet PIN members keep separate local layouts and must never query personal account preferences. A layout cannot grant financial access.
- Calendar bills derive from finance records and monthly overrides; never copy financial amounts into shared events. Use the same finance authorization for calendar and dashboard bill/member widgets. Events and completable reminders persist separately from bills.
- Calendar and notes persist in household tables. Keep date-only values local, and put overflow navigation in the mobile More menu so navigation never scrolls horizontally. On tablets and desktops, keep the main navigation in the compact sidebar so the dashboard can use the full height; position the widget editor beside it.
- Use native-keyboard focus shortcuts for optional dictation. Browsers cannot start the keyboard microphone directly. Do not add web microphone capture, speech recognition, speech models or audio processing dependencies; never put these shortcuts in the PIN keypad.
- Resolve authentication into a snapshot before committing household/member state. Ignore stale resolutions before they can mutate shared context. Bind queued writes to their original household and client; a later login must not redirect them.
- Keep member data reactive across settings, selectors, roles and the tablet kiosk. Invalidate it after member operations and revalidate it between devices.
- Evaluate collection updates outside replayable React state updaters. Separate confirmed and optimistic data, serialize dependent writes, and reconcile failures. Do not announce a successful save before confirmation or promise offline persistence without a durable implementation.

## Backend and security

- Household data lives in the owner's Supabase project; context comes from `my_context()`. Always query household data through `db()` so paired tablets send the device token header. The app is a static Vite/TanStack Router SPA, independent of Lovable runtime services.
- Tablet pairing shows an application QR on the tablet and asks a signed-in adult to approve with a fresh passkey on the phone. Keep approval and claim secrets independent; never expose the claim secret in links. The application QR does not prove Bluetooth proximity. The anonymous request gateway requires its own private server key and rate limit.
- The owner removed the guided tour. Do not restore coachmarks, tour progress or a replay control.
- Do not add explanatory household captions about routine behavior, including offline storage, automatic payments or task archiving. Shopping must work quietly; show actual errors and the actions needed to resolve them.
- PIN verification stays in Postgres. All PIN authorization paths, including finance authorization, must share server-side attempt limits. Never introduce client PIN checks or server-function PIN lookups against a potentially different backend URL.
- Every household table is RLS-scoped. Suspension must also be checked by privileged RPCs; `SECURITY DEFINER` bypasses RLS and therefore needs its own authorization checks.
- Household/invitation/pairing/device/member mutations use reviewed RPCs. Revalidate authorization under the household lock when changing roles or members; concurrent calls must not remove the last adult.
- Finance authorization is a memory-only secret with server-enforced expiry, caller binding and revocation. Revoke on logout, and never treat a client boolean or role as database authorization.
- Save a bill, its splits and monthly overrides atomically with optimistic concurrency. Monetary allocations must conserve cents and reference members of the same household.
- Personal profiles contain private avatar paths and preferences only; roles remain in protected household members. Restrict avatar storage to the owner's UUID folder and keep the bucket private.
- Preserve invitation codes through confirmation redirects. Recovery has its own public route. Distinguish denied access, expired authorization, suspension and connection failures in the UI.
- Business payments and Stripe sandbox events are separate from family finances. Never grant paid entitlements or count revenue from sandbox events. Checkout prices come from protected configuration, not browser input; verify webhook HMAC over the original bytes, deduplicate events, keep secrets server-side and leave live charges disabled until separately implemented and verified.
- `/admin` uses only `admin_*` RPCs gated by a protected `platform_admin` role. Provision the first platform administrator through an owner-controlled backend operation; never expose a first-user claim flow.
- The private `platform_owners` allowlist may provision only addresses verified by Supabase Auth. Clients must never modify that list or use editable metadata to obtain roles.

## Migrations and verification

- Do not edit applied SQL migrations. The legacy migration history is `drizzle/migrations/0000`–`0010`; subsequent changes belong in new timestamped `supabase/migrations` files.
- `drizzle/schema.ts` and legacy snapshots are not a declarative copy of the live schema. Do not run a generated schema push/diff from those empty files against a real database.
- Test database changes in an isolated disposable database, including permissions, conflicts and concurrency. Inspect the target project's actual schema before applying new migrations.
- Use Bun 1.4.3 with `bun.lock` and frozen installs. Run typecheck, tests, lint, format checks and build; browser smoke tests use a synthetic local backend.
- Do not infer production verification from local tests. Record any live flows that still require confirmation in the deployed environment.
- Production hosting and backend resources must stay on Free plans under the user's $0 infrastructure budget. Static Cloudflare assets must stay below 25 MiB per file.

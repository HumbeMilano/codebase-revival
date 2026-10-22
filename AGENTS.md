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

- Use the shared finance visibility predicate for every financial UI surface; financial tables additionally require adult account membership or a server-issued, caller-bound authorization token through db().
- Calendar and notes share session-only prototype state with the dashboard; keep date-only values local and put overflow sections in the mobile More menu so navigation never scrolls horizontally. Real persistence requires Lovable Cloud.
- Dictation runs multilingual Whisper only in a lazily created, session-reused browser Web Worker with single-thread WASM and explicitly resampled 16 kHz audio; never send audio to Cloud or an AI API, keeping inference local and the UI usable.

## Backend (Fase 2)
- Household data lives in Lovable Cloud tables; household id comes from my_context() at startup, and MEMBERS/HOUSEHOLD are mutated in place after load. Collection updates use usePersistedCollection outside replayable React state updaters, with a shared write queue and revision-guarded refreshes so StrictMode and realtime cannot duplicate or overwrite pending edits.
- PIN login is verified by the Postgres function public.verify_pin (SECURITY DEFINER, sha256 via pgcrypto); members.pin_hash is not readable by anon. Do not reintroduce client-side PIN checks or server-fn PIN lookups (server-side Supabase URL in the sandbox points at a different backend than the browser).

## SaaS isolation (Fase 3)
- Every household table is RLS-scoped through public.current_household_ids(): signed-in accounts via household_accounts, paired tablets via an x-device-token header hashed against devices; always query household data through db() in src/lib/db.ts so the device header is sent.
- Households, invites, tablet pairing and device revocation go only through SECURITY DEFINER RPCs (create_household, create_invite, redeem_invite, create_pairing_code, pair_device, list_devices, revoke_device); the backing tables have no client grants.
- Paired tablets get no realtime (no JWT), so useHubState polls in device mode.
- Adult PIN financial authorization uses a memory-only secret backed by finance_sessions, bound to the account auth session or paired device; revoke before logout and never trust a client role or boolean as database authorization.
- Personal profiles store only owner-scoped private avatar paths and view/time preferences; roles stay in protected household members, never in editable profiles. A signup trigger provisions profiles, and private storage is restricted to the owner's UUID folder.
- Registration preserves invitation codes through confirmation redirects; recovery has its own public route. Auth resolution revalidates with getUser and ignores stale results before rendering household content.

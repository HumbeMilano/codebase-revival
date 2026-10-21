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

- Use the shared finance visibility predicate for every financial UI surface in the PIN prototype so child visibility is consistent; this is presentation gating, not production security.
- Calendar and notes share session-only prototype state with the dashboard; keep date-only values local and put overflow sections in the mobile More menu so navigation never scrolls horizontally. Real persistence requires Lovable Cloud.
- Dictation runs multilingual Whisper only in a lazily created, session-reused browser Web Worker with single-thread WASM and explicitly resampled 16 kHz audio; never send audio to Cloud or an AI API, keeping inference local and the UI usable.

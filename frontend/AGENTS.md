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

- Mock data hooks live in src/services/mneme.ts; swap their bodies for real FastAPI calls without changing component contracts.
- Each study view is its own route wrapped in AppShell (src/components/mneme); the tutor chat is a drawer inside AppShell, not a route.

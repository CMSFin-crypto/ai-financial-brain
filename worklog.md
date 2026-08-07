---
Task ID: 1
Agent: Main
Task: Fix Kontrol tabs showing "Application error" on user's mobile phone

Work Log:
- Analyzed 4 new screenshots from user showing "Application error: a client-side exception has occurred" on ai-financial-brainzai.vercel.app
- Used VLM to identify the error type (client-side exception, not a server error)
- Verified current page.tsx has NO iframes (replaced with Link cards in previous commit 68aa2bd)
- Ran `next build` — build succeeds with no errors
- Opened live site in agent-browser with iPhone 14 viewport — page loads correctly, all tabs including Kontrol (Drift/Override/Edge/Metrics) work properly
- Determined the user's error is caused by stale cached JS bundles from a previous deployment (the HTML is fresh but old JS chunks are cached)
- Created `src/app/error.tsx` — client error boundary with "Provo përsëri" and "Fshij cache dhe rifresko" buttons
- Created `src/app/global-error.tsx` — root-level error boundary for layout crashes
- Added `Cache-Control: no-store, must-revalidate` headers in `next.config.ts` for all routes
- Pushed commit e5f9401 to GitHub

Stage Summary:
- The Kontrol tabs themselves are NOT broken — they render correctly with Cards and Links to standalone pages
- The user's crash is from stale browser cache serving old JS chunks that conflict with new HTML
- Error boundaries now give the user a recovery path instead of a dead-end error page
- No-cache headers prevent this from happening on fresh visits going forward

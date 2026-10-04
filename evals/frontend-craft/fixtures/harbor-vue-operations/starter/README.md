# Harbor dispatch board

Vue 3 Composition API with TypeScript and Vite. All dispatch data is local and fictional.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`. Validate compilation with `npm run build`.

If all packages have already been cached, `npm ci --offline --ignore-scripts --no-audit --no-fund` works without network access. Versions and the dependency graph are pinned by `package-lock.json`.

Brand tokens live in `src/styles.css`. Search matches a job's ID, customer, or destination. Status filters combine with search; due-time sort can be reversed. Selecting a job reveals its handoff details. This view does not change production data.

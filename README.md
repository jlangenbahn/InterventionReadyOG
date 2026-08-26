# InterventionReadyOG

Instructor web app for Orton-Gillingham reading intervention (ReadyOG).
React (Vite) frontend with an AWS Amplify Gen 2 backend (Cognito, AppSync, DynamoDB, Bedrock Lambdas).

## Local setup

```bash
npm install
npx ampx sandbox
npm run dev
```

`npx ampx sandbox` deploys a personal cloud sandbox and writes `amplify_outputs.json` (gitignored). Run that before `npm run dev`.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — production frontend build
- `npm run preview` — preview the production build
- `npx ampx sandbox` — deploy/watch the Amplify Gen 2 backend

## How the app is structured

Instructors sign in with email, then land on **Schedule**. The left nav switches between Schedule, Students, and Groups. Selecting a student opens four tabs: Lesson Plan, Scope & Sequence, Content, and Data.

```
amplify/                 Gen 2 backend (TypeScript)
  backend.ts             Auth + data + Lambda wiring, Bedrock IAM
  auth/                  Cognito email sign-in
  data/                  AppSync schema (Student, Lesson, List, …)
  functions/             Ask Andrea: generate text + pick focus words

src/
  main.jsx               Vite entry (configures Amplify, then mounts App)
  App.jsx                Authenticator + light/dark theme
  configureAmplify.js    Amplify.configure() — import before Data clients
  theme.js               MUI / Amplify color tokens
  components/
    app/                 Signed-in shell, left nav, color mode
    schedule/            Instructor calendar
    groups/              Named student bundles
    scope/               Per-student concept inventory
    lesson-plan/         Create, print, score, share, publish lessons
    content/             Word lists, sentences, passages, concept catalog
    data/                Practice reporting
    shared/              Dialogs, help tips, charts, Ask Andrea button
  lib/                   Data access and domain helpers (no UI)
    amplifyClient.js     Lazy AppSync client (user-pool auth)
    fetchStudentLessonPlan.js
                         Primary student/lesson/list loaders
    crudRecords.js       Deletes and updates
    scopeAndSequence.js  Inventory parse/serialize
    schedule.js          Calendar math + scheduled lessons

docs/                    Design mocks (not used at runtime)
scripts/                 One-off data migration (not used at runtime)
```

Each source file starts with a short comment describing what it is for. Start in `src/App.jsx` → `src/components/app/AppShell.jsx`, then open the feature folder that matches the screen you are changing.

## Production

Pushing to `master` deploys Amplify Hosting (`amplify.yml`). The hosted app is InterventionReadyOG in `us-east-2`.

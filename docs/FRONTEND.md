# Frontend Architecture

This document describes the design and organization of the frontend in this repository ("MGX Clone"). It explains the high-level architecture, folder structure, component design patterns, data flow, styling conventions, testing pointers.

## Overview

- Framework: Next.js (app directory) using React and TypeScript.
- Rendering: Server components (app directory) mixed with client components where needed.
- Styling: Tailwind CSS utility classes and global CSS in `src/styles` / `src/app/globals.css`.
- State & data fetching: Prefer server components and server-side data fetching for initial page renders; use client-side hooks for interactions and streaming where necessary.
- APIs: Backend FastAPI server under `backend/app` exposes routes consumed by the frontend via fetch/Edge functions under `src/app/api`.

## Goals and Principles

- Incremental static & server rendering where appropriate to balance performance and UX.
- Small focused components with clear props and minimal side effects.
- Reusable UI primitives (see `src/components/ui`) that implement accessible patterns.
- Prefers composition over inheritance: small building blocks compose into pages and containers.
- Type-safe public interfaces using TypeScript types and inferred return types for API clients.

## Folder Structure (frontend-relevant)

- `src/app/` — Next.js app routes, layouts and global CSS. Prefer server components here.
- `src/components/` — App-specific components (sidebar, panels, viewers).
- `src/components/ui/` — Design-system primitives and shared UI building blocks (buttons, inputs, dialogs).
- `src/hooks/` — Reusable React hooks (e.g., `use-generation-session.ts`, `use-mobile.ts`).
- `src/lib/` — Utilities, API clients, auth helpers (e.g., `auth-client.ts`, `db.ts`, `utils.ts`).
- `src/styles/` — Global and design-system styles. Tailwind config sits in project root (not in this doc).

## Component Design

- Server vs Client: Default to server components in `app` routes. Add `'use client'` at the top when component needs browser APIs, state, or effects.
- Props: Keep props minimal and well-typed. Avoid passing entire global objects — prefer IDs and callbacks.
- Event handlers: Keep handlers in client components or lift them into hooks for reuse.
- Accessibility: Follow WAI-ARIA patterns and prefer semantic HTML. The `ui` components wrap common accessible primitives.
- Storybook: Not currently included, but `src/components/ui` is organized to be storybook-friendly.

## Data fetching & API usage

- Server components can call backend APIs directly (via server-side fetch or using API client wrappers) to render initial HTML.
- Client components should call `/api/*` endpoints under `src/app/api` or call the backend directly when the endpoint requires credentials or web socket upgrades.
- Use standard fetch with explicit caching/revalidation options (`cache: 'no-store'` or `revalidate`) when calling from server components.
- For streaming or long-running generation tasks, use WebSocket or Server-Sent Events (SSE). The backend contains a `ws` route for real-time sessions.

## Hooks

- Custom hooks live in `src/hooks/`. They should follow the rules of hooks and be prefixed with `use`.
- Examples in this repo:
  - `use-generation-session.ts` — manages generation sessions and lifecycle.
  - `use-mobile.ts` — responsive detection for mobile layouts.
  - `use-toast.ts` — lightweight toast notifications wrapper.

## Styling

- Tailwind CSS is the primary styling method. Use utility classes for layout and quick styling.
- `src/components/ui/` contains higher-level styled components (e.g., `button.tsx`) that consolidate common patterns and tokens.
- Global tokens and variables should live in `src/styles/globals.css` and Tailwind config.

## Routing and Layouts

- App-level routing uses the Next.js `app` router. Layouts can be nested using `layout.tsx` files in route folders.
- Keep `src/app/layout.tsx` minimal: global providers, theme provider, and top-level layouts.

## Authentication & Authorization

- Auth helpers live in `src/lib/auth.*` and `src/lib/auth-client.ts` to abstract the authentication flow.
- Protected pages should check auth server-side when possible (server components) and fall back to client-side checks for interactive flows.

## Testing

- Unit tests can be placed under `src/__tests__` or alongside components using `.test.tsx` naming.
- Prefer React Testing Library and Vitest/Jest depending on project config. (Project currently uses Next default test runner if present.)

## Performance

- Leverage server components for faster first paint and smaller client bundles.
- Keep client-only code minimal; convert to server components when interactivity is not required.
- Use code-splitting by route and lazy-load heavy components.

## TypeScript and Linting

- Keep TypeScript `strict` mode enabled. Type public props and API responses explicitly when helpful.
- Follow ESLint rules and Prettier formatting present in the repo (if configured).

## Adding a new component

1. Add the component under `src/components/` or `src/components/ui/` depending on scope.
2. Add a minimal test file for important logic.
3. Export the component from an index file if it should be part of the public surface.
4. If the component needs styles, prefer Tailwind utilities or add a small module-level CSS file.

## Developer experience

- `pnpm` is used for package management (see `package.json` and `pnpm-lock.yaml`).
- Use the Next.js dev server (`pnpm dev`) for local development.
- For frontend-backend integration, run the backend FastAPI service concurrently (see `backend/README` or `docs/BACKEND.md`).

## Common patterns and conventions

- Prefer composition: small `ui` primitives compose into larger view components.
- Keep data-fetching logic close to pages/routes for clarity and caching control.
- Centralize heavy side effects (analytics, long-running tasks) in dedicated hooks or services.

## FAQ

Q: Where do I put a utility used by both frontend and backend?
A: Prefer `src/lib/` for frontend utilities. If it must be shared across Python backend and TypeScript frontend, keep separate implementations in each repo or extract to a dedicated shared package.

Q: How do I add a new API route?
A: Add a route under `src/app/api/` for frontend-edge logic or modify the backend `backend/app/routes` for server logic. Prefer backend for business logic and use the frontend API routes for adapters or auth proxies.

## Further reading

- Next.js App Router docs: https://nextjs.org/docs/app
- React Server Components: https://react.dev/reference/react-server-components
- Tailwind CSS: https://tailwindcss.com/docs

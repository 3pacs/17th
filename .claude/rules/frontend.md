# Frontend Rules

These rules apply when working on the React PWA in `grid/pwa/`.

## Stack

- React 18 with functional components and hooks
- Zustand for state management — keep stores focused and minimal
- Lucide React for icons
- Vite for bundling — dev server on port 5173, proxies `/api` to backend

## Patterns

- Components go in `pwa/src/` following existing structure
- Use the existing Zustand store pattern — don't introduce Redux or Context API
- API calls should go through a centralized fetch wrapper
- Handle loading and error states for all async operations
- The PWA is served from FastAPI in production — ensure builds work with `npm run build`

## Commands

```bash
cd grid/pwa && npm install    # Install dependencies
cd grid/pwa && npm run dev    # Dev server
cd grid/pwa && npm run build  # Production build
```

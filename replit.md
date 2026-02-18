# Tattoo Shop

## Overview

Tattoo Shop is a production-grade mobile application that allows users to upload tattoo designs (PNG/SVG), capture or import body photos, place/scale/rotate the design on the body, and export a realistic tattoo preview. The app features AI-powered placement suggestions, comprehensive safety gates, privacy controls, and queue-based premium processing.

The project is a monorepo with three main parts:
- **Mobile App**: Expo React Native (TypeScript) with file-based routing via expo-router
- **Backend API**: Express.js (TypeScript) server handling file uploads, AI proxy calls, moderation, job queue, and session management
- **Shared Package**: Zod schemas and TypeScript types shared between client and server

Key design principles:
- AI features are **advisory, not required**. The local compositor works deterministically and offline.
- **Safety-first**: Content moderation, minor detection, hate symbol blocking, consent enforcement.
- **Privacy-first**: EXIF stripping, signed URLs with 15-min TTL, ephemeral-by-default processing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo React Native)

- **Routing**: expo-router with file-based routing. Screens in `app/`:
  - `index.tsx` — Home/session list
  - `new-session.tsx` — Create session with consent gate (3 checkboxes: age, content consent, face-free)
  - `editor.tsx` — Tattoo placement editor with fresh/healed toggle, pin mode, premium job submission
  - `session-detail.tsx` — Export/share with job progress polling and ephemeral/save toggle
- **State Management**: React Context (`lib/session-context.tsx`) for session data, persisted to AsyncStorage. TanStack React Query for server data fetching and job status polling.
- **UI Framework**: Custom components with dark theme (gold accent `#D4A853` on dark background `#0D0D0D`). Inter font family. Colors in `constants/colors.ts`.
- **Gesture Handling**: react-native-gesture-handler + react-native-reanimated for pan/pinch/rotate gestures. Pin mode disables pan for precision placement.
- **Image Handling**: expo-image for display, expo-image-picker for selection, expo-media-library for gallery save, expo-sharing for sharing exports.
- **API Communication**: `lib/query-client.ts` provides `apiRequest()` helper. The mobile app never stores API keys.

### Backend (Express.js)

- **Entry Point**: `server/index.ts` sets up Express with helmet security, CORS (Replit domains), and registers routes.
- **Routes** (`server/routes.ts`): All API endpoints under `/api/v1/`:
  - `GET /health` — Health check with AI provider status
  - `GET /usage` — Feature flags and limits
  - `POST /moderate/content` — Content moderation via Gemini Vision
  - `POST /moderate/design` — Design moderation (hate symbols, NSFW)
  - `POST /ai/placement-suggest` — AI placement suggestions (Gemini primary, OpenAI fallback, safe defaults)
  - `POST /ai/design-remix` — AI realism suggestions
  - `POST /upload/design` — Design upload with EXIF strip + signed URL
  - `POST /upload/body-image` — Body image upload with EXIF strip + signed URL
  - `POST /upload/video` — Video upload with signed URL
  - `POST /jobs/submit` — Submit premium still or video render jobs
  - `GET /jobs/:jobId` — Poll job status/progress
  - `GET /jobs/session/:sessionId` — Get all jobs for a session
  - `POST /jobs/:jobId/cancel` — Cancel a job
  - `POST /session/:sessionId/save` — Cancel ephemeral cleanup, preserve session
  - `POST /session/:sessionId/ephemeral` — Schedule ephemeral cleanup
  - `DELETE /session/:sessionId` — Delete session files
  - `GET /files/:token` — Serve files via signed URL tokens
- **Safety & Policy Gate** (`server/policy-gate.ts`): Gemini Vision-based content moderation with minor detection, hate symbol blocking, self-harm content blocking, nudity checks. Consent validation with comprehensive ConsentPayload schema.
- **Privacy Pipeline** (`server/privacy.ts`): EXIF stripping via sharp, HMAC-SHA256 signed URLs with 15-min TTL, in-memory token mapping, ephemeral cleanup scheduling with cancelable timers.
- **Job Queue** (`server/job-queue.ts`): FIFO in-memory queue with:
  - Premium still worker (~2 min simulated pipeline: segmentation → warp → lighting → blend → enhance)
  - Video render worker (~5 min simulated pipeline: anchor → track → warp → composite → encode)
  - Progress polling, cancellation, 1-hour auto-expiry for completed jobs
- **AI Services**: 
  - Primary: Google Gemini (`server/gemini.ts`) for placement, remix, and face detection
  - Fallback: OpenAI GPT (`server/openai-backup.ts`) if Gemini fails
  - Safe defaults returned if both are unavailable
- **File Storage** (`server/storage.ts`): Upload directory with per-session subdirectories, 24-hour TTL cleanup via node-cron.
- **File Server** (`server/file-server.ts`): Signed URL token validation and file serving.

### Shared Package (`shared/schema.ts`)

- Zod schemas for: `Placement`, `TattooSession`, `ApprovalPacket`, `ConsentPayload`, `ModerationResult`, `ModerationFlag`, `JobStatus`, AI response types
- File type constants and size limits
- Type exports used across the entire codebase

### Database

- **Drizzle ORM** with PostgreSQL configured via `drizzle.config.ts`. Schema defined in `shared/schema.ts`.
- Connection string from `DATABASE_URL` environment variable.
- Migrations output to `./migrations/`.
- Push schema with `npm run db:push`.

### Build & Deployment

- **Development**: Two processes — `expo:dev` (port 8081) for mobile bundler, `server:dev` (port 5000) for Express backend.
- **Production**: `server:build` uses esbuild to bundle the server, `server:prod` runs it.
- **Replit-specific**: CORS and domain handling configured for Replit's dev/deployment domains.

## Recent Changes

- **2026-02-18**: Added comprehensive safety/moderation endpoints, privacy pipeline (EXIF strip + signed URLs), queue-based job system with premium still and video render workers
- **2026-02-18**: Updated editor with fresh/healed toggle, pin mode, premium job submission; new-session with 3-checkbox consent gate; session-detail with job progress polling and ephemeral/save toggle

## External Dependencies

### AI Services
- **Google Gemini API**: Primary AI provider (placement, moderation, face detection). Requires `GEMINI_API_KEY`.
- **OpenAI API**: Fallback AI provider. Requires `OPENAI_API_KEY`. Used only if Gemini fails.

### Database
- **PostgreSQL**: Connected via `DATABASE_URL` environment variable. Managed with Drizzle ORM.

### Key NPM Packages
- **expo** (~54.0), **expo-router** (~6.0): Core framework and routing
- **drizzle-orm** / **drizzle-kit**: Database ORM and migration tooling
- **express** (v5): Backend HTTP server
- **multer** (v2): Multipart file upload handling
- **helmet**: HTTP security headers
- **express-rate-limit**: API rate limiting (10 req/min AI, 20 req/min uploads)
- **node-cron**: Scheduled cleanup of expired uploads
- **sharp**: EXIF metadata stripping for privacy
- **@tanstack/react-query**: Server state management + job polling on client
- **react-native-gesture-handler** / **react-native-reanimated**: Touch gesture and animation support
- **zod**: Schema validation shared between client and server
- **@react-native-async-storage/async-storage**: Local persistence for sessions

### Environment Variables Required
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Used for HMAC-SHA256 signed URL generation
- `GEMINI_API_KEY` — Google Gemini API key (optional but recommended)
- `OPENAI_API_KEY` — OpenAI API key (optional fallback)
- `EXPO_PUBLIC_DOMAIN` — Set automatically in Replit for API URL construction

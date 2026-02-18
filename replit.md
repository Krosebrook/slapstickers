# Tattoo Shop

## Overview

Tattoo Shop is a production-grade mobile application that allows users to upload tattoo designs (PNG/SVG), capture or import body photos, place/scale/rotate the design on the body, and export a realistic tattoo preview. The app features AI-powered placement suggestions and a secure backend proxy that keeps API keys off the client.

The project is a monorepo with three main parts:
- **Mobile App**: Expo React Native (TypeScript) with file-based routing via expo-router
- **Backend API**: Express.js (TypeScript) server handling file uploads, AI proxy calls, and session management
- **Shared Package**: Zod schemas and TypeScript types shared between client and server

Key design principle: AI features are **advisory, not required**. The local compositor works deterministically and offline. If AI services (Gemini/OpenAI) are unavailable, the app gracefully falls back to default suggestions and never dead-ends the user experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo React Native)

- **Routing**: expo-router with file-based routing. Screens are in `app/` directory: `index.tsx` (home/session list), `new-session.tsx` (create session), `editor.tsx` (tattoo placement editor), `session-detail.tsx` (export/share).
- **State Management**: React Context (`lib/session-context.tsx`) for session data, persisted to AsyncStorage. TanStack React Query for server data fetching.
- **UI Framework**: Custom components with a dark theme (gold accent `#D4A853` on dark background `#0D0D0D`). Uses Inter font family. Colors defined in `constants/colors.ts`.
- **Gesture Handling**: react-native-gesture-handler + react-native-reanimated for the tattoo editor's pan/pinch/rotate gestures.
- **Image Handling**: expo-image for display, expo-image-picker for selection, expo-media-library for saving to gallery, expo-sharing for sharing exports.
- **API Communication**: `lib/query-client.ts` provides `apiRequest()` helper that builds URLs from `EXPO_PUBLIC_DOMAIN` env var. The mobile app never stores API keys.

### Backend (Express.js)

- **Entry Point**: `server/index.ts` sets up Express with helmet security, CORS (configured for Replit domains), and registers routes.
- **Routes**: `server/routes.ts` handles file uploads (multer), AI proxy endpoints with rate limiting (10 req/min for AI), session management, and file validation.
- **AI Services**: 
  - Primary: Google Gemini (`server/gemini.ts`) for placement suggestions, design remix suggestions, and face detection.
  - Fallback: OpenAI GPT (`server/openai-backup.ts`) if Gemini fails.
  - Both return structured responses matching shared Zod schemas. If neither is available, safe defaults are returned.
- **File Storage**: `server/storage.ts` manages upload directory (`./uploads/`), per-session subdirectories, and automatic TTL cleanup (24-hour expiry via node-cron).
- **File Validation**: Enforced mime types and size limits — designs ≤10MB, images ≤15MB, videos ≤50MB.
- **Face Detection Gate**: Before any Sora/video AI call, face detection runs. If a face is detected or the call fails, it returns `SORA_UNAVAILABLE_OR_BLOCKED` with a local overlay fallback.

### Shared Package (`shared/schema.ts`)

- Zod schemas for: `Placement`, `TattooSession`, `ApprovalPacket`, AI response types
- File type constants and size limits used by both client and server
- Type exports used across the entire codebase

### Database

- **Drizzle ORM** with PostgreSQL configured via `drizzle.config.ts`. Schema defined in `shared/schema.ts`.
- Connection string read from `DATABASE_URL` environment variable.
- Migrations output to `./migrations/` directory.
- Push schema with `npm run db:push`.

### Build & Deployment

- **Development**: Two processes — `expo:dev` for the mobile bundler, `server:dev` for the Express backend (via tsx).
- **Production**: `server:build` uses esbuild to bundle the server, `server:prod` runs it. Expo static build handled by `scripts/build.js`.
- **Replit-specific**: CORS and domain handling are configured for Replit's dev and deployment domains. The build script reads `REPLIT_DEV_DOMAIN` and `REPLIT_INTERNAL_APP_DOMAIN`.

## External Dependencies

### AI Services
- **Google Gemini API**: Primary AI provider for tattoo placement suggestions, design analysis, and face detection. Requires `GEMINI_API_KEY` environment secret.
- **OpenAI API (GPT-5)**: Fallback AI provider. Requires `OPENAI_API_KEY` environment secret. Used only if Gemini fails.

### Database
- **PostgreSQL**: Connected via `DATABASE_URL` environment variable. Managed with Drizzle ORM.

### Key NPM Packages
- **expo** (~54.0): Core framework for React Native cross-platform development
- **expo-router** (~6.0): File-based routing
- **drizzle-orm** / **drizzle-kit**: Database ORM and migration tooling
- **express** (v5): Backend HTTP server
- **multer** (v2): Multipart file upload handling
- **helmet**: HTTP security headers
- **express-rate-limit**: API rate limiting
- **node-cron**: Scheduled cleanup of expired uploads
- **@tanstack/react-query**: Server state management on the client
- **react-native-gesture-handler** / **react-native-reanimated**: Touch gesture and animation support
- **zod**: Schema validation shared between client and server
- **@react-native-async-storage/async-storage**: Local persistence for sessions

### Environment Variables Required
- `DATABASE_URL` — PostgreSQL connection string
- `GEMINI_API_KEY` — Google Gemini API key (optional but recommended)
- `OPENAI_API_KEY` — OpenAI API key (optional fallback)
- `EXPO_PUBLIC_DOMAIN` — Set automatically in Replit for API URL construction
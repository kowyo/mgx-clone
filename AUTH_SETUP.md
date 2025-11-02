# Authentication Setup Guide

This project uses better-auth for authentication with Google SSO support. Projects are now persisted per user in the database.

## Backend Setup

1. **Environment Variables** (add to `.env` in backend directory):
```bash
CLAUDE_APP_BETTER_AUTH_SECRET=your-secret-key-change-in-production
CLAUDE_APP_BETTER_AUTH_URL=http://localhost:3000
```

2. **Database**: The backend uses SQLite (stored as `claude_app.db` in the backend directory) to persist users and projects.

3. **Dependencies**: Already installed:
   - `sqlalchemy` - ORM for database
   - `aiosqlite` - Async SQLite driver
   - `pyjwt` - JWT token verification
   - `cryptography` - Cryptographic functions

## Frontend Setup

1. **Environment Variables** (add to `.env.local`):
```bash
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-key-change-in-production  # Must match backend secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

2. **Google OAuth Setup**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Copy the Client ID and Client Secret to your `.env.local`

## How It Works

1. **User Authentication**: Users sign in via Google SSO using better-auth
2. **Token Management**: better-auth manages sessions and provides session tokens
3. **API Requests**: Frontend includes Bearer token in Authorization header
4. **Backend Verification**: FastAPI backend verifies JWT tokens and creates/retrieves user records
5. **Project Persistence**: Projects are stored in database associated with user_id

## Project Storage

- Projects are stored in: `{projects_root}/{user_id}/{project_id}/`
- Project metadata is stored in SQLite database with user association
- Each user can only access their own projects

## API Endpoints

All endpoints require authentication via Bearer token:

- `POST /api/generate` - Create new project (requires auth)
- `GET /api/projects/{id}/status` - Get project status (requires auth)
- `GET /api/projects/{id}/files` - List project files (requires auth)
- `GET /api/projects/{id}/files/{path}` - Get file content (requires auth)
- `GET /api/projects/{id}/preview` - Get preview URL (requires auth)
- `GET /api/auth/me` - Get current user info (requires auth)

## Development Notes

- The backend will automatically create the database schema on startup
- Users are automatically created on first login (via token claims)
- Better-auth handles session management and Google OAuth flow
- Make sure the `BETTER_AUTH_SECRET` matches between frontend and backend
`

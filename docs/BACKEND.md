# Backend Design Documentation

## Overview

The backend of the Claude App Builder is a Python-based API server built with FastAPI and Uvicorn, designed to power an AI-powered web application builder. It interprets natural language prompts, generates React/Vite projects using the Claude Agent SDK, and provides real-time preview capabilities.

## Technology Stack

- **Framework**: FastAPI - Modern, fast web framework for building APIs with Python 3.7+ based on standard Python type hints.
- **Server**: Uvicorn - ASGI web server implementation for Python, optimized for asynchronous applications.
- **Database**: SQLite with SQLAlchemy (async) - Lightweight database for project metadata and user data.
- **AI Integration**: Claude Agent SDK - For natural language processing and code generation.
- **Authentication**: Better Auth - JWT-based authentication system.
- **WebSockets**: Native FastAPI support for real-time communication.
- **Configuration**: Pydantic Settings - Environment-based configuration management.

## Architecture

The backend follows a modular architecture with clear separation of concerns:

```
backend/
├── app/
│   ├── main.py              # FastAPI application factory
│   ├── config.py            # Application configuration
│   ├── database.py          # Database setup and session management
│   ├── dependencies.py      # Dependency injection utilities
│   ├── models/              # Pydantic models and SQLAlchemy ORM
│   │   ├── api.py          # API request/response models
│   │   ├── project_db.py   # Database models
│   │   ├── project.py      # Project domain models
│   │   └── user.py         # User models
│   ├── routes/             # API route handlers
│   │   ├── auth.py         # Authentication endpoints
│   │   ├── generate.py     # Project generation endpoints
│   │   ├── health.py       # Health check endpoints
│   │   ├── projects.py     # Project management endpoints
│   │   └── ws.py           # WebSocket endpoints
│   ├── services/           # Business logic layer
│   │   ├── auth_service.py     # Authentication logic
│   │   ├── claude_service.py   # Claude AI integration
│   │   ├── fallback_generator.py # Fallback generation logic
│   │   └── project_service.py  # Project management logic
│   └── tools/              # Utility tools and adapters
│       ├── builders.py         # Claude SDK configuration
│       ├── command_adapter.py  # Command execution utilities
│       ├── exceptions.py       # Custom exceptions
│       ├── file_adapter.py     # File system operations
│       └── path_utils.py       # Path manipulation utilities
├── tests/                 # Unit and integration tests
└── pyproject.toml         # Project configuration and dependencies
```

## Key Components

### Application Factory (`main.py`)
- Creates and configures the FastAPI application instance
- Sets up CORS middleware for cross-origin requests
- Includes API and WebSocket routers
- Manages application lifespan (startup/shutdown)

### Configuration (`config.py`)
- Environment-based settings using Pydantic
- Configurable API prefix, allowed origins, project root directory
- Preview server settings and allowed commands
- Authentication secrets and URLs

### Database Layer (`database.py`)
- Asynchronous SQLAlchemy setup with SQLite
- Session management with dependency injection
- Automatic table creation on startup

### API Routes
- **Authentication** (`auth.py`): User login/logout and session management
- **Generation** (`generate.py`): Project creation and AI-powered code generation
- **Projects** (`projects.py`): Project CRUD operations and file management
- **Health** (`health.py`): Application health checks
- **WebSocket** (`ws.py`): Real-time project status updates

### Services Layer
- **Claude Service** (`claude_service.py`): Integrates with Claude Agent SDK for code generation
- **Project Service** (`project_service.py`): Manages project lifecycle, preview servers, and file operations
- **Auth Service** (`auth_service.py`): Handles user authentication and authorization
- **Fallback Generator** (`fallback_generator.py`): Provides alternative generation logic when Claude is unavailable

### Tools and Utilities
- Command execution with security restrictions
- File system operations with path validation
- Custom exception handling
- Claude SDK configuration builders

## Database Schema

The application uses SQLite with the following main entities:

- **Users**: User accounts and authentication data
- **Projects**: Generated applications with metadata (status, paths, URLs)
- **Project Files**: Individual files within projects

## Authentication

- JWT-based authentication using Better Auth
- User sessions with secure token management
- CORS configuration for frontend integration
- User-scoped project isolation

## WebSocket Communication

Real-time updates are provided through WebSocket connections:

- Project status changes (generating, ready, error)
- Live preview URL updates
- Generation progress logs
- File system changes

## Security Considerations

- Command execution restricted to allowed commands only
- File operations limited to project directories
- Environment variable-based configuration
- CORS policies for frontend communication
- Input validation using Pydantic models

## Deployment

The application is designed to run with Uvicorn:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

For production, use a process manager like Gunicorn with Uvicorn workers:

```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

## Development

- Use `uv` for dependency management
- Run tests with `pytest`
- Code formatting with `ruff`
- Type checking with `mypy`

## API Documentation

FastAPI automatically generates OpenAPI documentation available at `/docs` when the server is running.

## API Endpoints

The backend provides RESTful API endpoints and WebSocket connections for managing projects, authentication, and real-time updates. All REST endpoints are prefixed with `/api` (configurable via `CLAUDE_APP_API_PREFIX`).

### Authentication Endpoints

- **GET /api/auth/me**
  - **Description**: Get current authenticated user information
  - **Response**: User details (id, email, name, image)
  - **Auth**: Required

### Generation Endpoints

- **POST /api/generate**
  - **Description**: Start AI-powered project generation from natural language prompt
  - **Request Body**: 
    ```json
    {
      "prompt": "string",
      "template": "string (optional)"
    }
    ```
  - **Response**: Project ID and initial status
  - **Status Code**: 202 Accepted
  - **Auth**: Required

### Project Management Endpoints

- **GET /api/projects**
  - **Description**: List all projects for the current user
  - **Query Parameters**: 
    - `limit` (int, default: 50)
    - `offset` (int, default: 0)
  - **Response**: Paginated list of projects
  - **Auth**: Required

- **GET /api/projects/{project_id}/status**
  - **Description**: Get detailed status of a specific project
  - **Response**: Project status, timestamps, preview URL
  - **Auth**: Required

- **GET /api/projects/{project_id}/messages**
  - **Description**: Retrieve the full persisted conversation for a project, including user prompts and assistant responses
  - **Response**: Ordered list of conversation messages with metadata (role, status, timestamps)
  - **Auth**: Required

- **POST /api/projects/{project_id}/messages**
  - **Description**: Add a follow-up user message to an existing project and trigger a new generation turn
  - **Request Body**:
    ```json
    {
      "content": "string",
      "assistant_intro": "string (optional)"
    }
    ```
  - **Response**: Newly created user message and updated project status
  - **Status Code**: 202 Accepted
  - **Auth**: Required

- **GET /api/projects/{project_id}/files**
  - **Description**: Get file tree structure for a project
  - **Response**: Hierarchical file list with metadata
  - **Auth**: Required

- **GET /api/projects/{project_id}/files/{file_path:path}**
  - **Description**: Get content of a specific file
  - **Response**: Plain text file content
  - **Auth**: Required

- **GET /api/projects/{project_id}/preview**
  - **Description**: Get preview server information
  - **Response**: Preview URL and status
  - **Auth**: Required

- **GET /api/projects/{project_id}/preview/{asset_path:path}**
  - **Description**: Serve static assets from preview server
  - **Response**: Asset file content
  - **Auth**: Required

### Health Check Endpoints

- **GET /api/health**
  - **Description**: Application health check
  - **Response**: `{"status": "ok"}`
  - **Auth**: Not required

### WebSocket Endpoints

- **WebSocket /ws/{project_id}**
  - **Description**: Real-time project updates and logs
  - **Messages**: JSON events for status changes, generation progress, file updates
  - **Auth**: Required (via query parameters or headers)

### Response Models

#### ProjectGenerateRequest
```json
{
  "prompt": "string",
  "template": "string | null"
}
```

#### ProjectGenerateResponse
```json
{
  "project_id": "string",
  "status": "string"
}
```

#### ProjectListResponse
```json
{
  "projects": [
    {
      "id": "string",
      "prompt": "string",
      "status": "string",
      "preview_url": "string | null",
      "created_at": "string",
      "updated_at": "string"
    }
  ],
  "total": "integer"
}
```

#### ProjectStatusResponse
```json
{
  "id": "string",
  "status": "string",
  "preview_url": "string | null",
  "created_at": "string",
  "updated_at": "string",
  "logs": ["string"]
}
```

#### ProjectFilesResponse
```json
{
  "files": [
    {
      "name": "string",
      "path": "string",
      "type": "file | directory",
      "size": "integer | null",
      "children": [...] // for directories
    }
  ]
}
```

#### ProjectPreviewResponse
```json
{
  "url": "string",
  "status": "string"
}
```

### Error Responses

All endpoints may return standard HTTP error responses:

- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **422 Unprocessable Entity**: Validation error
- **500 Internal Server Error**: Server error

Error responses include a JSON body with `detail` field describing the error.

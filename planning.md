# Backend Architecture Planning

## Overview

This document outlines the design for a Python FastAPI backend that integrates with Claude Agent SDK to generate web applications. The system will create code in isolated tmp directories per project and provide live preview capabilities.

## Core Components

### 1. FastAPI Application Structure

- **Main App**: FastAPI instance with CORS, static file serving, and WebSocket support
- **API Routes**:
  - `POST /api/generate`: Accept prompts and initiate code generation
  - `GET /api/projects/{project_id}/status`: Get generation status
  - `GET /api/projects/{project_id}/files`: List generated files
  - `GET /api/projects/{project_id}/preview`: Serve preview iframe
  - `WebSocket /ws/{project_id}`: Real-time status updates

### 2. Project Management System

- **Tmp Directory Structure**:

  ```
  /tmp/claude-projects/
  ├── project-uuid-1/
  │   ├── generated-app/
  │   ├── node_modules/ (if applicable)
  │   └── .claude-session/
  ├── project-uuid-2/
  │   └── ...
  ```

- **Project Metadata**: Store project info, status, and configuration in memory/database

### 3. Claude Agent Integration

- **Agent Configuration**: ClaudeAgentOptions with custom MCP servers
- **Tool Set**:
  - Project creation tools (Next.js, Vite, React templates)
  - File manipulation tools (read, write, edit)
  - Terminal execution tools (pnpm install, dev servers)
  - Preview generation tools

### 4. Tool Architecture

Custom MCP tools implemented as Python functions:

#### Project Creation Tools

- `create_next_app`: Execute `pnpm create next-app@latest`
- `create_vite_app`: Execute `pnpm create vite@latest`
- `create_react_app`: Execute `npx create-react-app`

#### File Management Tools

- `read_file`: Read file contents
- `write_file`: Create/modify files
- `list_directory`: List directory contents
- `create_directory`: Create directories

#### Execution Tools

- `run_command`: Execute shell commands in project directory
- `install_dependencies`: Run package manager install
- `start_dev_server`: Start development server
- `build_project`: Build for production

#### Preview Tools

- `generate_preview_url`: Create accessible preview URL
- `check_server_status`: Monitor dev server health

### 5. Security & Sandboxing

- **Process Isolation**: Each project runs in separate directory
- **Command Validation**: Whitelist allowed commands and paths
- **Resource Limits**: CPU, memory, and execution time limits
- **Cleanup**: Automatic cleanup of old projects

### 6. Real-time Communication

- **WebSocket Updates**: Stream generation progress to frontend
- **Status Events**:
  - `generation_started`
  - `tool_executed`
  - `file_created`
  - `server_started`
  - `preview_ready`
  - `error_occurred`

### 7. Error Handling & Recovery

- **Graceful Degradation**: Continue with partial results on tool failures
- **Retry Logic**: Automatic retries for transient failures
- **User Feedback**: Clear error messages and recovery suggestions

## Technology Stack

### Dependency Management

- **uv**: Modern Python package manager for fast, reliable dependency resolution
- **pyproject.toml**: Project configuration and dependency declarations
- **uv.lock**: Deterministic lock file for reproducible builds

### Core Dependencies

- **FastAPI**: Web framework with async support
- **Uvicorn**: ASGI server for FastAPI
- **claude-agent-sdk**: Claude integration and tool execution
- **pydantic**: Data validation and serialization
- **websockets**: Real-time communication
- **aiofiles**: Async file operations

### Additional Libraries

- **python-multipart**: File upload handling
- **uvloop**: High-performance event loop (optional)
- **structlog**: Structured logging
- **aiomultiprocess**: Process management for tools

## Deployment Considerations

### Development

- Local Uvicorn server with auto-reload
- In-memory project storage
- Debug logging enabled

### Production

- Gunicorn + Uvicorn workers
- Redis for project metadata (optional)
- Nginx reverse proxy
- Docker containerization
- Health checks and monitoring

## Integration Points

### Frontend Communication

- REST API for project management
- WebSocket for real-time updates
- Static file serving for previews
- CORS configuration for cross-origin requests

### Claude Agent Flow

1. Receive prompt from frontend
2. Create project directory and metadata
3. Initialize Claude agent with project-specific tools
4. Execute agent with prompt and tools
5. Stream results back to frontend
6. Start preview server if successful

## Performance Optimizations

### Caching

- Tool results caching
- Static asset caching
- Preview server reuse

### Concurrency

- Async/await throughout
- Connection pooling
- Background task processing

### Resource Management

- Project cleanup policies
- Memory usage monitoring
- Process limits per project

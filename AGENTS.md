# AGENTS.md

## Project Overview

This project is an AI-powered web application builder that transforms natural language prompts into fully functional web applications with instant live preview.

## Core Functionality

**Natural Language Prompt Input** - Users describe their desired application in a text box and click Generate to start the AI-powered code generation process.

**Claude Agent Integration** - The backend uses Claude Agent SDK with custom tools to interpret prompts, generate minimal React and Vite projects, and manage preview servers.

**Monaco Code Editor** - Generated source code is displayed in a professional Monaco-based editor with syntax highlighting, file tabs, and read-only viewing.

**Live Preview Window** - An embedded iframe displays the running application in real-time, allowing users to interact with their generated app immediately.

**Project Management** - Users can create multiple projects, switch between them, and continue refining their applications with new prompts.

## Development Tips

Always use context7 when I need code generation, setup or configuration steps, or library/API documentation. This means you should automatically use the Context7 MCP tools to resolve library id and get library docs without me having to explicitly ask.

Use `uv` for Python dependency management in backend projects for fast, reliable package installation and virtual environment management. Available commands include `uv init`, `uv add <package>`, `uv remove <package>`, and `uv run <script>`.

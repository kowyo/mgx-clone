import { NextResponse } from "next/server"

// Mock API endpoint that simulates Claude Agent backend
export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Generate mock response based on prompt
    const mockFiles = [
      {
        path: "src/App.tsx",
        content: `import React, { useState } from 'react'
import './App.css'

function App() {
  const [items, setItems] = useState<string[]>([])
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (input.trim()) {
      setItems([...items, input])
      setInput('')
    }
  }

  const handleDelete = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  return (
    <div className="app">
      <h1>${prompt.slice(0, 50)}...</h1>
      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Enter item..."
        />
        <button onClick={handleAdd}>Add</button>
      </div>
      <ul className="items-list">
        {items.map((item, index) => (
          <li key={index}>
            <span>{item}</span>
            <button onClick={() => handleDelete(index)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App`,
      },
      {
        path: "src/App.css",
        content: `.app {
  max-width: 600px;
  margin: 50px auto;
  padding: 20px;
  font-family: system-ui, -apple-system, sans-serif;
}

h1 {
  color: #333;
  margin-bottom: 20px;
}

.input-container {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input {
  flex: 1;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

button {
  padding: 10px 20px;
  background: #0070f3;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

button:hover {
  background: #0051cc;
}

.items-list {
  list-style: none;
  padding: 0;
}

.items-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  background: #f5f5f5;
  border-radius: 6px;
}

.items-list button {
  background: #ff4444;
  padding: 6px 12px;
  font-size: 12px;
}

.items-list button:hover {
  background: #cc0000;
}`,
      },
      {
        path: "package.json",
        content: `{
  "name": "generated-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}`,
      },
    ]

    // Mock preview URL (in production, this would be a real preview server)
    const previewUrl = `https://stackblitz.com/edit/react-${Date.now()}?embed=1&file=src/App.tsx`

    return NextResponse.json({
      files: mockFiles,
      preview_url: previewUrl,
      project_id: `project-${Date.now()}`,
    })
  } catch {
    return NextResponse.json(
      { error: "Failed to generate app" },
      { status: 500 }
    )
  }
}

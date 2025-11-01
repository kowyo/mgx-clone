from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.tools.file_adapter import FileAdapter


@dataclass(slots=True)
class FallbackGenerationOutcome:
    preview_path: str


class FallbackGenerator:
    """Simple fallback generator that scaffolds a minimal static web app."""

    async def generate(self, project_root: Path, prompt: str) -> FallbackGenerationOutcome:
        adapter = FileAdapter(project_root)
        await adapter.write_text(
            "index.html",
            self._build_index_html(prompt),
        )
        await adapter.write_text("style.css", self._default_stylesheet)
        await adapter.write_text("app.js", self._default_script)
        return FallbackGenerationOutcome(preview_path="index.html")

    def _build_index_html(self, prompt: str) -> str:
        safe_prompt = prompt.strip() or "Your AI powered workspace"
        return f"""<!DOCTYPE html>
<html lang=\"en\">
  <head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>{safe_prompt}</title>
    <link rel=\"stylesheet\" href=\"style.css\" />
  </head>
  <body>
    <main>
      <h1>{safe_prompt}</h1>
      <p class=\"description\">
        This project was generated locally as a fallback experience. Update the prompt with more
        detail to let Claude craft a richer interface.
      </p>
      <section>
        <h2>Idea Notebook</h2>
        <form id="idea-form">
          <input
            id="idea-input"
            type="text"
            placeholder="Capture your next feature idea..."
          />
          <button type="submit" class="primary">Add idea</button>
        </form>
        <ul id=\"idea-list\"></ul>
      </section>
      <p class="description">
        Keep iterating and re-run generation when you're ready for Claude to take over.
      </p>
    </main>
    <script src=\"app.js\" type=\"module\"></script>
  </body>
</html>
"""

    _default_stylesheet = """body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 0;
  background: radial-gradient(circle at top, #eef2ff, #f8fafc 60%);
  color: #0f172a;
}

main {
  max-width: 720px;
  margin: 48px auto;
  background: white;
  padding: 40px;
  border-radius: 24px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.12);
}

h1 {
  font-size: 2.25rem;
  margin-bottom: 16px;
}

p.description {
  font-size: 1.1rem;
  margin-bottom: 24px;
  line-height: 1.6;
}

section {
  margin-bottom: 32px;
}

button.primary {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

button.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px rgba(79, 70, 229, 0.35);
}
"""

    _default_script = """const items = []

function renderItems() {
  const list = document.querySelector('#idea-list')
  list.innerHTML = ''
  items.forEach((item, index) => {
    const li = document.createElement('li')
    li.innerHTML = `
      <span>${item}</span>
      <button data-index="${index}" class="secondary">Remove</button>
    `
    list.appendChild(li)
  })
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#idea-form')
  const input = document.querySelector('#idea-input')
  const list = document.querySelector('#idea-list')

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const value = input.value.trim()
    if (!value) return
    items.push(value)
    input.value = ''
    renderItems()
  })

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button.secondary')
    if (!button) return
    const index = Number.parseInt(button.dataset.index ?? '-1')
    if (index >= 0) {
      items.splice(index, 1)
      renderItems()
    }
  })
})
"""

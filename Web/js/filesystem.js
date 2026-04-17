/**
 * Neon Architect — Virtual File System
 * In-memory file tree with directory operations.
 * Provides a virtual project structure for the editor.
 */

import { getLangFromName, bus } from './utils.js';

/** The virtual file system tree */
export const fileSystem = {
  'src': {
    _type: 'dir', _expanded: true,
    'App.js': {
      _type: 'file', _lang: 'javascript',
      _content: `import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
`
    },
    'index.tsx': {
      _type: 'file', _lang: 'typescript',
      _content: `import React from 'react';
import { Architect } from '@neon-architect/core';

export const MainWorkspace = () => {
  const [loading, setLoading] = useArchitect();
  // Initialize the AI context layer
  return (
    <div className="neon-grid">
      <h1>Building the future</h1>
      <p>AI-native precision workspace.</p>
    </div>
  );
};

// TODO: Refactor the chat connection pool logic
function optimizeGrid(points: number[]) {
  return points.map(p => p * Math.PI);
}
`
    },
    'styles.css': {
      _type: 'file', _lang: 'css',
      _content: `:root {
  --surface: #0c0e17;
  --primary: #9ba8ff;
  --secondary: #a68cff;
  --on-surface: #f0f0fd;
}

.neon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  padding: 2rem;
}

.neon-grid h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2.5rem;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.neon-grid p {
  color: var(--on-surface);
  opacity: 0.7;
  line-height: 1.6;
}

@media (prefers-color-scheme: light) {
  :root {
    --surface: #faf8ff;
    --on-surface: #1a1b26;
  }
}
`
    },
    'components': {
      _type: 'dir', _expanded: false,
      'Dashboard.tsx': {
        _type: 'file', _lang: 'typescript',
        _content: `import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import AgentCard from './AgentCard';
import MetricsPanel from './MetricsPanel';

interface DashboardProps {
  agents?: AgentConfig[];
}

export default function Dashboard({ agents = [] }: DashboardProps) {
  const { theme } = useTheme();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics().then(data => {
      setMetrics(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard-grid">
      <MetricsPanel data={metrics} />
      <div className="agent-list">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
`
      },
      'Settings.tsx': {
        _type: 'file', _lang: 'typescript',
        _content: `import React from 'react';
import { useTheme } from '../context/ThemeContext';

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <section>
        <h3>Appearance</h3>
        <select value={theme} onChange={e => setTheme(e.target.value)}>
          <option value="dark">Dark (Neon)</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </section>
    </div>
  );
}
`
      },
      'AgentCard.tsx': {
        _type: 'file', _lang: 'typescript',
        _content: `import React from 'react';

interface AgentCardProps {
  agent: {
    id: string;
    name: string;
    status: 'idle' | 'running' | 'error';
    model: string;
    tokensUsed: number;
  };
}

export default function AgentCard({ agent }: AgentCardProps) {
  const statusColor = {
    idle: 'bg-gray-400',
    running: 'bg-green-400 animate-pulse',
    error: 'bg-red-400',
  }[agent.status];

  return (
    <div className="agent-card p-4 rounded-xl bg-surface-container-high">
      <div className="flex items-center gap-3 mb-2">
        <div className={\`w-2 h-2 rounded-full \${statusColor}\`} />
        <h3 className="font-bold text-on-surface">{agent.name}</h3>
      </div>
      <div className="text-xs text-on-surface-variant space-y-1">
        <p>Model: {agent.model}</p>
        <p>Tokens: {agent.tokensUsed.toLocaleString()}</p>
        <p>Status: {agent.status}</p>
      </div>
    </div>
  );
}
`
      },
    },
    'context': {
      _type: 'dir', _expanded: false,
      'ThemeContext.tsx': {
        _type: 'file', _lang: 'typescript',
        _content: `import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('neon-theme') as Theme) || 'dark';
  });

  const resolvedTheme = theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    : theme;

  useEffect(() => {
    localStorage.setItem('neon-theme', theme);
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [theme, resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
`
      },
    },
    'hooks': {
      _type: 'dir', _expanded: false,
      'useArchitect.ts': {
        _type: 'file', _lang: 'typescript',
        _content: `import { useState, useEffect, useCallback } from 'react';

interface ArchitectState {
  loading: boolean;
  connected: boolean;
  model: string;
  sessionId: string | null;
}

/**
 * Hook to interact with the Neon Architect AI backend.
 * Manages connection state and provides AI query functions.
 */
export function useArchitect() {
  const [state, setState] = useState<ArchitectState>({
    loading: true,
    connected: false,
    model: 'neon-pro-v4',
    sessionId: null,
  });

  useEffect(() => {
    // Simulate connection
    const timer = setTimeout(() => {
      setState(prev => ({
        ...prev,
        loading: false,
        connected: true,
        sessionId: crypto.randomUUID(),
      }));
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const query = useCallback(async (prompt: string) => {
    if (!state.connected) throw new Error('Not connected to AI backend');
    // In production, this would call the AI API
    return { response: 'AI response placeholder', tokens: 0 };
  }, [state.connected]);

  return { ...state, query };
}
`
      },
    },
    'assets': {
      _type: 'dir', _expanded: false,
      'logo.svg': {
        _type: 'file', _lang: 'xml',
        _content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#9ba8ff"/>
      <stop offset="100%" style="stop-color:#a68cff"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="20" fill="#0c0e17"/>
  <text x="50" y="65" text-anchor="middle" fill="url(#neon)" font-size="48" font-family="Space Grotesk">N</text>
</svg>
`
      },
    },
  },
  'package.json': {
    _type: 'file', _lang: 'json',
    _content: `{
  "name": "neon-architect-demo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint src/ --ext .ts,.tsx",
    "test": "vitest"
  },
  "dependencies": {
    "@neon-architect/core": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.0.0"
  }
}
`
  },
  'README.md': {
    _type: 'file', _lang: 'markdown',
    _content: `# Neon Architect Demo

A demonstration workspace for the Neon Architect AI-powered code editor.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Features

- AI-powered code assistance
- Real-time syntax highlighting
- Multi-file editing with tabs
- Integrated terminal
- Git source control
- Extension marketplace
`
  },
  'tsconfig.json': {
    _type: 'file', _lang: 'json',
    _content: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
`
  },
  '.gitignore': {
    _type: 'file', _lang: 'plaintext',
    _content: `node_modules/
dist/
.env
.env.local
*.log
.DS_Store
`
  }
};

/** Cached modified file contents (path -> content) */
export const fileContents = {};

/** Set of dirty (unsaved) file paths */
export const dirty = new Set();

// Proxy dirty set to emit events on change
const _origAdd = dirty.add.bind(dirty);
const _origDel = dirty.delete.bind(dirty);
const _origClr = dirty.clear.bind(dirty);
dirty.add = function(v) { _origAdd(v); bus.emit('dirty:change'); return dirty; };
dirty.delete = function(v) { const r = _origDel(v); bus.emit('dirty:change'); return r; };
dirty.clear = function() { _origClr(); bus.emit('dirty:change'); };

/** Navigate the tree to get a node by path */
export function getNode(path) {
  const parts = path.split('/').filter(Boolean);
  let node = fileSystem;
  for (const p of parts) {
    if (!node || !node[p]) return null;
    node = node[p];
  }
  return node;
}

/** Set a node at the given path, creating parents as needed */
export function setNode(path, value) {
  const parts = path.split('/').filter(Boolean);
  let node = fileSystem;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node[parts[i]]) node[parts[i]] = { _type: 'dir', _expanded: true };
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/** Delete a node at the given path */
export function deleteNode(path) {
  const parts = path.split('/').filter(Boolean);
  let node = fileSystem;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node[parts[i]];
  }
  delete node[parts[parts.length - 1]];
}

/** Get file content, preferring cached version */
export function getFileContent(path) {
  if (fileContents[path] !== undefined) return fileContents[path];
  const node = getNode(path);
  return node ? node._content || '' : '';
}

/** Save content to a file, updating dirty state */
export function saveFileContent(path) {
  const node = getNode(path);
  if (node && fileContents[path] !== undefined) {
    node._content = fileContents[path];
    dirty.delete(path);
  }
}

/** Save all dirty files */
export function saveAllFiles() {
  for (const path of dirty) {
    const node = getNode(path);
    if (node) node._content = fileContents[path] || '';
  }
  dirty.clear();
}

/** Search all files for a query string */
export function searchFiles(query) {
  const matches = [];
  const lowerQuery = query.toLowerCase();

  function walk(node, path) {
    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith('_')) continue;
      const fullPath = path ? `${path}/${name}` : name;
      if (child._type === 'dir') {
        walk(child, fullPath);
      } else if (child._content) {
        const lines = child._content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(lowerQuery)) {
            matches.push({
              path: fullPath,
              name,
              line: idx + 1,
              text: line.trim(),
              lang: child._lang || getLangFromName(name),
            });
          }
        });
      }
    }
  }

  walk(fileSystem, '');
  return matches;
}

/** Export the project as a JSON blob */
export function exportProject() {
  const content = JSON.stringify(fileSystem, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'neon-architect-project.json';
  a.click();
  URL.revokeObjectURL(url);
}

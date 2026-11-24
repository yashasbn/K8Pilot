import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import {
  Send,
  ChevronDown,
  Cpu,
  Download,
  RefreshCw,
  Loader,
  Settings,
  X,
  Eye,
  EyeOff,
  Sparkles,
  ShieldAlert,
  Check,
  Trash2,
  Plus,
  RotateCcw,
  FileText,
  Scale,
  Search,
  MessageSquare,
  ChevronLeft,
} from 'lucide-react'

interface InvestigationStep {
  type: string
  content?: string
  tool?: string
  summary?: string
  args?: Record<string, any>
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  model?: string
  pendingActions?: PendingAction[]
  steps?: InvestigationStep[]
  isStreaming?: boolean
}

interface ChatSessionItem {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

interface PendingAction {
  action: string
  name?: string
  namespace?: string
  deployment?: string
  replicas?: number
  manifest?: string
  [key: string]: unknown
}

interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

interface GeminiModel {
  name: string
  displayName: string
  description: string
  inputTokenLimit?: number
  outputTokenLimit?: number
}

interface RecommendedModel {
  name: string
  label: string
  size: string
}

const RECOMMENDED_MODELS: RecommendedModel[] = [
  { name: 'llama3.2:1b', label: 'Llama 3.2 (1B)', size: '1.3 GB' },
  { name: 'llama3.2', label: 'Llama 3.2 (3B)', size: '2.0 GB' },
  { name: 'llama3', label: 'Llama 3 (8B)', size: '4.7 GB' },
  { name: 'qwen2.5:1.5b', label: 'Qwen 2.5 (1.5B)', size: '986 MB' },
  { name: 'qwen2.5:3b', label: 'Qwen 2.5 (3B)', size: '2.0 GB' },
  { name: 'qwen2.5:7b', label: 'Qwen 2.5 (7B)', size: '4.7 GB' },
  { name: 'qwen2.5:14b', label: 'Qwen 2.5 (14B)', size: '9.0 GB' },
  { name: 'gemma2:2b', label: 'Gemma 2 (2B)', size: '1.6 GB' },
  { name: 'gemma2:9b', label: 'Gemma 2 (9B)', size: '5.5 GB' },
  { name: 'gemma3:1b', label: 'Gemma 3 (1B)', size: '815 MB' },
  { name: 'gemma3:4b', label: 'Gemma 3 (4B)', size: '3.3 GB' },
  { name: 'mistral', label: 'Mistral (7B)', size: '4.1 GB' },
  { name: 'mistral-nemo', label: 'Mistral Nemo (12B)', size: '7.1 GB' },
  { name: 'phi3', label: 'Phi 3 (3.8B)', size: '2.2 GB' },
  { name: 'phi4', label: 'Phi 4 (14B)', size: '9.1 GB' },
  { name: 'phi4-mini', label: 'Phi 4 Mini (3.8B)', size: '2.5 GB' },
  { name: 'deepseek-r1:7b', label: 'DeepSeek R1 (7B)', size: '4.7 GB' },
  { name: 'deepseek-r1:14b', label: 'DeepSeek R1 (14B)', size: '9.0 GB' },
  { name: 'codellama', label: 'Code Llama (7B)', size: '3.8 GB' },
  { name: 'nomic-embed-text', label: 'Nomic Embed Text', size: '274 MB' },
]

const GEMINI_API_KEY_STORAGE = 'k8pilot_gemini_api_key'
const ACTIVE_SESSION_STORAGE = 'k8pilot_active_session_id'

function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)} MB`
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [defaultModel, setDefaultModel] = useState<string>('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(true)
  const [downloadingModels, setDownloadingModels] = useState<string[]>([])
  const [modelTab, setModelTab] = useState<'local' | 'cloud' | 'download'>('local')
  const [modelSearch, setModelSearch] = useState('')

  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>([])
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false)

  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem(GEMINI_API_KEY_STORAGE) || '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // Chat sessions state
  const [sessions, setSessions] = useState<ChatSessionItem[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  const isGeminiModel = selectedModel.startsWith('gemini-')

  const fetchSessions = async (autoRestore = false) => {
    try {
      const resp = await axios.get('/api/ai/sessions')
      const sessList: ChatSessionItem[] = resp.data.sessions || []
      setSessions(sessList)
      if (autoRestore && sessList.length > 0) {
        const savedId = localStorage.getItem(ACTIVE_SESSION_STORAGE)
        if (savedId && sessList.some((s) => s.id === savedId)) {
          loadSession(savedId)
        } else if (sessList.length > 0) {
          loadSession(sessList[0].id)
        }
      }
    } catch {
      console.error('Could not fetch sessions')
    }
  }

  const loadSession = async (sessionId: string) => {
    try {
      setLoading(true)
      setActiveSessionId(sessionId)
      localStorage.setItem(ACTIVE_SESSION_STORAGE, sessionId)
      const resp = await axios.get(`/api/ai/sessions/${sessionId}`)
      const loaded: Message[] = (resp.data.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        pendingActions: m.actions || undefined,
      }))
      setMessages(loaded)
    } catch {
      console.error('Failed to load session')
    } finally {
      setLoading(false)
    }
  }

  const startNewChat = () => {
    setActiveSessionId(null)
    localStorage.removeItem(ACTIVE_SESSION_STORAGE)
    setMessages([])
  }

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation history?')) return
    try {
      await axios.delete(`/api/ai/sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        startNewChat()
      }
    } catch {
      console.error('Failed to delete session')
    }
  }

  useEffect(() => {
    if (location.state && (location.state as any).initialPrompt) {
      setInput((location.state as any).initialPrompt)
    }
  }, [location.state])

  const fetchModels = async () => {
    try {
      const resp = await axios.get('/api/ai/models')
      setModels(resp.data.models || [])
      setDefaultModel(resp.data.default || '')
      if (!selectedModel) setSelectedModel(resp.data.default || '')
    } catch {
      console.error('Could not fetch models')
    } finally {
      setModelsLoading(false)
    }
  }

  const fetchPullStatus = async () => {
    try {
      const resp = await axios.get('/api/ai/pull/status')
      const downloading = resp.data.downloading || []
      if (downloadingModels.some((m: string) => !downloading.includes(m))) fetchModels()
      setDownloadingModels(downloading)
    } catch {
      console.error('Could not fetch pull status')
    }
  }

  const fetchGeminiModels = async (key: string) => {
    if (!key) { setGeminiModels([]); return }
    setGeminiModelsLoading(true)
    try {
      const resp = await axios.get('/api/ai/gemini-models', {
        headers: { 'X-Gemini-API-Key': key }
      })
      setGeminiModels(resp.data.models || [])
    } catch {
      setGeminiModels([])
    } finally {
      setGeminiModelsLoading(false)
    }
  }

  useEffect(() => {
    fetchModels()
    fetchSessions(true)
    if (geminiApiKey) fetchGeminiModels(geminiApiKey)
  }, [])

  useEffect(() => {
    fetchPullStatus()
    const interval = setInterval(fetchPullStatus, 4000)
    return () => clearInterval(interval)
  }, [downloadingModels])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setModelDropdownOpen(false)
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (settingsOpen) setApiKeyInput(geminiApiKey)
  }, [settingsOpen])

  const saveGeminiKey = () => {
    const trimmed = apiKeyInput.trim()
    setGeminiApiKey(trimmed)
    trimmed ? localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmed) : localStorage.removeItem(GEMINI_API_KEY_STORAGE)
    setSettingsOpen(false)
    fetchGeminiModels(trimmed)
  }

  const clearGeminiKey = () => {
    setApiKeyInput('')
    setGeminiApiKey('')
    localStorage.removeItem(GEMINI_API_KEY_STORAGE)
  }

  const buildHeaders = () => {
    const headers: Record<string, string> = {}
    if (geminiApiKey) headers['X-Gemini-API-Key'] = geminiApiKey
    return headers
  }

  const sendMessage = async () => {
    if (!input.trim()) return
    if (isGeminiModel && !geminiApiKey) {
      setSettingsOpen(true)
      return
    }

    const currentPrompt = input
    const userMsg: Message = { role: 'user', content: currentPrompt }
    const assistantIndex = messages.length + 1

    // Add user message and assistant streaming placeholder
    const assistantPlaceholder: Message = {
      role: 'assistant',
      content: '',
      model: selectedModel || 'llama3',
      steps: [],
      isStreaming: true,
    }
    setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildHeaders(),
        },
        body: JSON.stringify({
          context: currentPrompt,
          prompt: 'You are K8Pilot, an AI Kubernetes operations assistant.',
          model: selectedModel || undefined,
          session_id: activeSessionId || undefined,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: Failed to start stream`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedText = ''
      const collectedSteps: InvestigationStep[] = []
      let pendingActions: PendingAction[] | undefined = undefined

      let streamEnded = false
      while (!streamEnded) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = 'message'
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (!dataStr) continue
            try {
              const data = JSON.parse(dataStr)
              if (currentEvent === 'session' && data.session_id) {
                setActiveSessionId(data.session_id)
                localStorage.setItem(ACTIVE_SESSION_STORAGE, data.session_id)
                fetchSessions()
              } else if (currentEvent === 'step') {
                collectedSteps.push(data)
                setMessages((prev) =>
                  prev.map((m, idx) =>
                    idx === assistantIndex ? { ...m, steps: [...collectedSteps] } : m
                  )
                )
              } else if (currentEvent === 'token' && data.text) {
                accumulatedText += data.text
                setMessages((prev) =>
                  prev.map((m, idx) =>
                    idx === assistantIndex
                      ? { ...m, content: accumulatedText, steps: [...collectedSteps] }
                      : m
                  )
                )
              } else if (currentEvent === 'action') {
                pendingActions = data
                setMessages((prev) =>
                  prev.map((m, idx) =>
                    idx === assistantIndex ? { ...m, pendingActions: data } : m
                  )
                )
              } else if (currentEvent === 'done') {
                streamEnded = true
                fetchSessions()
                break
              }
            } catch {
              // ignore malformed SSE line
            }
          }
        }
        if (streamEnded) {
          try {
            await reader.cancel()
          } catch {
            // ignore
          }
          break
        }
      }

      setMessages((prev) =>
        prev.map((m, idx) =>
          idx === assistantIndex
            ? { ...m, isStreaming: false, content: accumulatedText, steps: [...collectedSteps], pendingActions }
            : m
        )
      )
    } catch (err: unknown) {
      let errMsg = 'Error: Could not reach AI streaming service.'
      if (err instanceof Error) errMsg = `Error: ${err.message}`
      setMessages((prev) =>
        prev.map((m, idx) =>
          idx === assistantIndex
            ? { ...m, isStreaming: false, content: errMsg }
            : m
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const executeAction = async (msgIndex: number, action: PendingAction, approved: boolean) => {
    // Remove pending actions from this message regardless of approve/deny
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, pendingActions: undefined } : m))

    if (!approved) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⛔ Action cancelled: \`${action.action}\`` }])
      return
    }

    try {
      const resp = await axios.post('/api/ai/execute-action', action)
      const status = resp.data.status === 'success' ? '✅' : '⚠️'
      setMessages(prev => [...prev, { role: 'assistant', content: `${status} ${resp.data.message}` }])
    } catch (err: unknown) {
      let errMsg = 'Action failed.'
      if (axios.isAxiosError(err) && err.response?.data?.detail) errMsg = err.response.data.detail
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${errMsg}` }])
    }
  }

  const startDownload = async (modelName: string) => {
    try {
      setDownloadingModels(prev => [...prev, modelName])
      await axios.post('/api/ai/pull', { name: modelName })
      fetchPullStatus()
    } catch (e) { console.error('Failed to trigger download', e) }
  }


  const currentModel = models.find(m => m.name === selectedModel)
  const selectedGemini = geminiModels.find(m => m.name === selectedModel)

  return (
    <div className="flex h-full gap-4 overflow-hidden">
      {/* Sessions Left Sidebar */}
      {sidebarOpen ? (
        <aside className="w-64 flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shrink-0">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-gray-900/90">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
              <MessageSquare size={14} className="text-blue-400" />
              <span>History</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={startNewChat}
                className="flex items-center gap-1 px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 text-[11px] font-medium transition"
                title="New Conversation"
              >
                <Plus size={12} /> New
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition"
                title="Collapse history"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2 space-y-1">
            {sessions.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500">
                No saved conversations
              </div>
            ) : (
              sessions.map((sess) => {
                const isActive = sess.id === activeSessionId
                return (
                  <div
                    key={sess.id}
                    onClick={() => loadSession(sess.id)}
                    className={`group flex items-start justify-between p-2.5 rounded-lg cursor-pointer transition border text-xs ${
                      isActive
                        ? 'bg-blue-600/20 text-white border-blue-500/30 shadow-sm'
                        : 'text-gray-300 hover:bg-gray-800/80 border-transparent hover:border-gray-800'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-1">
                      <p className="font-medium truncate">{sess.title}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                        {sess.message_count} {sess.message_count === 1 ? 'message' : 'messages'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteSession(sess.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded transition"
                      title="Delete session"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </aside>
      ) : (
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 self-start bg-gray-900 border border-gray-800 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition shrink-0"
          title="Open conversation history"
        >
          <MessageSquare size={16} />
        </button>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">AI Assistant</h2>

        <div className="flex items-center gap-2">
          {/* Settings */}
          <div className="relative" ref={settingsRef}>
            <button
              id="api-settings-btn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="API Settings"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm transition-all border ${
                geminiApiKey
                  ? 'bg-emerald-600/10 border-emerald-500/40 text-emerald-400 hover:border-emerald-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              <Settings size={15} />
              {geminiApiKey && <span className="text-xs font-medium">Gemini ✓</span>}
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-96 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-blue-400" />
                    <h3 className="font-semibold text-gray-100 text-sm">API Settings</h3>
                  </div>
                  <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-gray-300 transition">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Google Gemini API Key</label>
                    <p className="text-xs text-gray-500 mb-2">
                      Get your key from{' '}
                      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                        Google AI Studio
                      </a>. Stored only in your browser.
                    </p>
                    <div className="relative">
                      <input
                        id="gemini-api-key-input"
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKeyInput}
                        onChange={e => setApiKeyInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveGeminiKey()}
                        placeholder="AIza..."
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(prev => !prev)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                      >
                        {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      id="save-api-key-btn"
                      onClick={saveGeminiKey}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition"
                    >
                      Save
                    </button>
                    {geminiApiKey && (
                      <button
                        onClick={clearGeminiKey}
                        className="px-3 py-2 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 text-sm rounded-lg transition"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {geminiApiKey && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                      <span>✓</span>
                      <span>Gemini API key configured. Select a Gemini model to use it.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Model selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="model-selector-btn"
              onClick={() => {
                const nextOpen = !modelDropdownOpen
                setModelDropdownOpen(nextOpen)
                if (nextOpen) {
                  // Auto-select tab matching current model
                  if (isGeminiModel) setModelTab('cloud')
                  else setModelTab('local')
                  setModelSearch('')
                }
              }}
              className="flex items-center gap-2 bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-lg px-3 py-2 text-sm transition-colors"
              disabled={modelsLoading}
            >
              {isGeminiModel ? <Sparkles size={14} className="text-blue-400" /> : <Cpu size={14} className="text-blue-400" />}
              <span className="text-gray-300 font-medium">{modelsLoading ? 'Loading...' : (selectedModel || 'Select model')}</span>
              {currentModel && currentModel.size > 0 && <span className="text-xs text-gray-500">({formatSize(currentModel.size)})</span>}
              {downloadingModels.length > 0 && <Loader size={14} className="text-blue-400 animate-spin" />}
              <ChevronDown size={14} className={`text-gray-500 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-96 max-h-[80vh] flex flex-col border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ background: '#141920' }}>
                {downloadingModels.length > 0 && (
                  <div className="px-4 py-2 bg-blue-900/30 border-b border-blue-500/20 text-xs text-blue-300 flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Downloading: {downloadingModels.join(', ')}...</span>
                  </div>
                )}

                {/* Search bar */}
                <div className="p-2 border-b border-gray-800 bg-gray-900/80">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search models..."
                      value={modelSearch}
                      onChange={e => setModelSearch(e.target.value)}
                      className="w-full bg-gray-800/90 border border-gray-700/70 rounded-lg pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    {modelSearch && (
                      <button onClick={() => setModelSearch('')} className="absolute right-2 top-2 text-gray-500 hover:text-gray-300">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 bg-gray-900/60 p-1.5 gap-1 text-xs">
                  <button
                    onClick={() => setModelTab('local')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-all ${
                      modelTab === 'local'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    }`}
                  >
                    <Cpu size={13} />
                    <span>Local</span>
                    <span className={`text-3xs px-1.5 py-0.5 rounded-full ${modelTab === 'local' ? 'bg-blue-700 text-blue-100' : 'bg-gray-800 text-gray-400'}`}>
                      {models.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setModelTab('cloud')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-all ${
                      modelTab === 'cloud'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    }`}
                  >
                    <Sparkles size={13} />
                    <span>Gemini</span>
                    {geminiModels.length > 0 && (
                      <span className={`text-3xs px-1.5 py-0.5 rounded-full ${modelTab === 'cloud' ? 'bg-blue-700 text-blue-100' : 'bg-gray-800 text-gray-400'}`}>
                        {geminiModels.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setModelTab('download')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-medium transition-all ${
                      modelTab === 'download'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                    }`}
                  >
                    <Download size={13} />
                    <span>Pull</span>
                  </button>
                </div>

                {/* Tab Content List */}
                <div className="overflow-y-auto max-h-[55vh] p-2 divide-y divide-gray-800/50">
                  {/* TAB 1: LOCAL MODELS */}
                  {modelTab === 'local' && (
                    <div className="space-y-1">
                      {models
                        .filter(m => m.name.toLowerCase().includes(modelSearch.toLowerCase()))
                        .map(model => (
                          <button
                            key={model.name}
                            onClick={() => { setSelectedModel(model.name); setModelDropdownOpen(false) }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-gray-800/80 transition-all flex items-center justify-between border ${
                              selectedModel === model.name
                                ? 'bg-blue-600/15 border-blue-500/50 text-white'
                                : 'border-transparent text-gray-300'
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-xs text-gray-100">{model.name}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                {model.name === defaultModel && (
                                  <span className="text-3xs text-blue-400 font-bold uppercase tracking-wide bg-blue-500/10 px-1 rounded">default</span>
                                )}
                                <span className="text-3xs text-emerald-400">installed</span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 font-mono">{formatSize(model.size)}</span>
                          </button>
                        ))}
                      {models.filter(m => m.name.toLowerCase().includes(modelSearch.toLowerCase())).length === 0 && (
                        <div className="py-6 text-center text-xs text-gray-500">
                          {models.length === 0 ? 'No local models found in Ollama.' : 'No local models match your search.'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: CLOUD GEMINI MODELS */}
                  {modelTab === 'cloud' && (
                    <div className="space-y-1">
                      {!geminiApiKey && (
                        <div className="m-1 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                          <p className="font-semibold mb-1">Gemini API Key Required</p>
                          <p className="text-3xs text-amber-400/80 mb-2">Set your Google Gemini API key in Settings to unlock cloud inference.</p>
                          <button
                            onClick={() => { setModelDropdownOpen(false); setSettingsOpen(true); }}
                            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-2.5 py-1 rounded text-xs font-medium transition"
                          >
                            Open Settings
                          </button>
                        </div>
                      )}
                      {geminiModelsLoading && (
                        <div className="p-4 text-xs text-gray-400 flex items-center justify-center gap-2">
                          <Loader size={14} className="animate-spin text-blue-400" /> Fetching models from Google...
                        </div>
                      )}
                      {geminiModels
                        .filter(gm =>
                          gm.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                          gm.displayName.toLowerCase().includes(modelSearch.toLowerCase()) ||
                          (gm.description && gm.description.toLowerCase().includes(modelSearch.toLowerCase()))
                        )
                        .map(gm => (
                          <button
                            key={gm.name}
                            onClick={() => { setSelectedModel(gm.name); setModelDropdownOpen(false) }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-800/80 transition-all flex items-center justify-between border ${
                              selectedModel === gm.name
                                ? 'bg-blue-600/15 border-blue-500/50 text-white'
                                : 'border-transparent text-gray-300'
                            }`}
                          >
                            <div className="flex flex-col pr-2">
                              <span className="font-semibold text-xs text-gray-100">{gm.displayName}</span>
                              <span className="text-gray-500 text-3xs line-clamp-1">
                                {gm.inputTokenLimit ? `${(gm.inputTokenLimit / 1000).toFixed(0)}K ctx` : ''}
                                {gm.inputTokenLimit && gm.description ? ' · ' : ''}
                                {gm.description}
                              </span>
                            </div>
                            <span className="text-2xs text-blue-400 font-medium bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0">Cloud</span>
                          </button>
                        ))}
                      {geminiApiKey && !geminiModelsLoading && geminiModels.length === 0 && (
                        <div className="py-6 text-center text-xs text-gray-500">No Gemini models found.</div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: DOWNLOAD RECOMMENDED */}
                  {modelTab === 'download' && (
                    <div className="space-y-1">
                      {RECOMMENDED_MODELS
                        .filter(rec =>
                          rec.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                          rec.label.toLowerCase().includes(modelSearch.toLowerCase())
                        )
                        .map(rec => {
                          const isInstalled = models.some(m => m.name.startsWith(rec.name))
                          const isDownloading = downloadingModels.includes(rec.name)
                          return (
                            <div key={rec.name} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-800/40 transition-all">
                              <div className="flex flex-col">
                                <span className="text-xs font-semibold text-gray-200">{rec.label}</span>
                                <span className="text-3xs text-gray-500">{rec.size}</span>
                              </div>
                              {isInstalled ? (
                                <span className="text-2xs text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded">Installed</span>
                              ) : isDownloading ? (
                                <span className="text-2xs text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                  <Loader size={10} className="animate-spin" /> Pulling
                                </span>
                              ) : (
                                <button
                                  onClick={() => startDownload(rec.name)}
                                  className="flex items-center gap-1 text-2xs font-medium text-blue-400 hover:text-white bg-blue-600/10 hover:bg-blue-600 px-2.5 py-1 rounded transition-all"
                                >
                                  <Download size={11} /> Pull
                                </button>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gemini key warning banner */}
      {isGeminiModel && !geminiApiKey && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <Sparkles size={14} />
            <span>Gemini model selected — please add your API key to chat.</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-xs font-medium text-amber-400 hover:text-amber-200 border border-amber-500/40 px-3 py-1 rounded-lg transition"
          >
            Add Key
          </button>
        </div>
      )}

      {/* Gemini active chip */}
      {selectedGemini && geminiApiKey && (
        <div className="mb-3 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-1.5">
          <Sparkles size={12} />
          <span>Using <strong>{selectedGemini.displayName}</strong> via Gemini Cloud API</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <p className="text-gray-500">Ask K8Pilot about your cluster, incidents, or for help generating manifests.</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-200'
              }`}>
                {/* Autonomous SRE Investigation Steps Box */}
                {msg.steps && msg.steps.length > 0 && (
                  <div className="mb-3 p-2.5 rounded-lg bg-gray-950/80 border border-blue-500/20 text-xs space-y-1.5 shadow-inner">
                    <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-[11px] uppercase tracking-wide">
                      <Sparkles size={12} className={msg.isStreaming ? 'animate-spin text-blue-400' : 'text-blue-400'} />
                      <span>Autonomous SRE Investigation</span>
                      {msg.isStreaming && <span className="text-gray-500 font-normal lowercase">(live)</span>}
                    </div>
                    <div className="space-y-1 pt-1 border-t border-gray-800/80">
                      {msg.steps.map((st, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-1.5 text-gray-300 text-[11px] font-mono">
                          {st.type === 'thought' && (
                            <>
                              <span className="text-purple-400 shrink-0 font-semibold">🧠</span>
                              <span className="text-gray-400 truncate">{st.content}</span>
                            </>
                          )}
                          {st.type === 'tool_call' && (
                            <>
                              <span className="text-amber-400 shrink-0 font-semibold">🔧</span>
                              <span className="text-gray-300">
                                {st.tool}({st.args ? Object.entries(st.args).map(([k, v]) => `${k}="${v}"`).join(', ') : ''})
                              </span>
                            </>
                          )}
                          {st.type === 'tool_result' && (
                            <>
                              <span className="text-emerald-400 shrink-0 font-semibold">✓</span>
                              <span className="text-emerald-400/90 truncate">{st.summary}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content */}
                {msg.content ? (
                  <div>
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="inline-block w-2 h-4 ml-1 bg-blue-400 animate-pulse align-middle" />
                    )}
                  </div>
                ) : msg.isStreaming ? (
                  <div className="flex items-center gap-2 text-xs text-blue-400 font-mono py-1">
                    <Loader size={14} className="animate-spin" />
                    <span>Analyzing cluster and gathering diagnostics...</span>
                  </div>
                ) : null}

                {msg.model && msg.role === 'assistant' && !msg.isStreaming && (
                  <div className="mt-2 pt-1 border-t border-gray-700/80 text-[11px] text-gray-500 flex items-center gap-1">
                    {msg.model.startsWith('gemini-') ? <Sparkles size={10} /> : <Cpu size={10} />} {msg.model}
                  </div>
                )}
              </div>
            </div>

            {/* Pending actions confirmation card */}
            {msg.role === 'assistant' && msg.pendingActions && msg.pendingActions.length > 0 && (
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-4 shadow-xl">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                    <ShieldAlert size={16} />
                    <span>Cluster Authorization Required</span>
                  </div>

                  <div className="space-y-3">
                    {msg.pendingActions.map((act, actIdx) => {
                      const isDestructive = ['delete_pod', 'delete_namespace'].includes(act.action) || 
                                           (act.action === 'scale' && act.replicas === 0);
                      
                      let ActionIcon = ShieldAlert;
                      if (act.action === 'create') ActionIcon = Plus;
                      else if (act.action === 'delete_pod' || act.action === 'delete_namespace') ActionIcon = Trash2;
                      else if (act.action === 'restart') ActionIcon = RotateCcw;
                      else if (act.action === 'scale') ActionIcon = Scale;
                      else if (act.action === 'get_logs') ActionIcon = FileText;

                      return (
                        <div key={actIdx} className={`p-3 rounded-lg border text-sm ${
                          isDestructive 
                            ? 'bg-red-950/20 border-red-500/30 text-red-200' 
                            : 'bg-gray-800/40 border-gray-750 text-gray-300'
                        }`}>
                          <div className="flex items-start gap-2.5">
                            <ActionIcon size={16} className={`mt-0.5 ${isDestructive ? 'text-red-400' : 'text-blue-400'}`} />
                            <div className="flex-1 space-y-1">
                              <span className="font-bold text-xs uppercase tracking-wider">
                                {act.action.replace('_', ' ')}
                              </span>
                              <div className="text-xs font-mono space-y-0.5 text-gray-400">
                                {act.namespace && <div><strong>Namespace:</strong> {act.namespace}</div>}
                                {act.name && <div><strong>Name:</strong> {act.name}</div>}
                                {act.deployment && <div><strong>Deployment:</strong> {act.deployment}</div>}
                                {act.replicas !== undefined && <div><strong>Replicas:</strong> {act.replicas}</div>}
                                {act.manifest && (
                                  <details className="mt-1 cursor-pointer">
                                    <summary className="text-2xs text-blue-400 hover:underline">View YAML Manifest</summary>
                                    <pre className="mt-1.5 p-2 bg-gray-950 rounded text-3xs overflow-x-auto whitespace-pre font-mono text-gray-300 border border-gray-800">
                                      {act.manifest}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 mt-4">
                            <button
                              onClick={() => executeAction(i, act, false)}
                              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition"
                            >
                              Deny
                            </button>
                            <button
                              onClick={() => executeAction(i, act, true)}
                              className={`px-3 py-1.5 flex items-center gap-1 text-xs font-medium rounded-lg text-white transition ${
                                isDestructive 
                                  ? 'bg-red-650 hover:bg-red-750 shadow-lg shadow-red-900/20' 
                                  : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20'
                              }`}
                            >
                              <Check size={12} /> Confirm & Run
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && messages.length === 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400 flex items-center gap-2">
              <Loader size={14} className="animate-spin" /> Loading session...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          id="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder={isGeminiModel ? `Ask K8Pilot (via ${selectedModel})...` : 'Ask about your cluster...'}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          id="chat-send-btn"
          onClick={sendMessage}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg px-4 py-2 transition"
        >
          <Send size={18} />
        </button>
      </div>
      </div>
    </div>
  )
}


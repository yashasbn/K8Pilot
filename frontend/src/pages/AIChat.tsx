import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Send, ChevronDown, Cpu, Download, RefreshCw, Loader, Settings, X, Eye, EyeOff, Sparkles } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  model?: string
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

  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>([])
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false)

  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem(GEMINI_API_KEY_STORAGE) || '')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isGeminiModel = selectedModel.startsWith('gemini-')

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
    if (isGeminiModel && !geminiApiKey) { setSettingsOpen(true); return }

    const userMsg: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const resp = await axios.post('/api/ai/chat', {
        context: input,
        prompt: 'You are K8Pilot, an AI Kubernetes operations assistant.',
        model: selectedModel || undefined,
      }, { headers: buildHeaders() })
      setMessages(prev => [...prev, { role: 'assistant', content: resp.data.response, model: resp.data.model }])
    } catch (err: unknown) {
      let errMsg = 'Error: Could not reach AI service.'
      if (axios.isAxiosError(err) && err.response?.data?.detail) errMsg = `Error: ${err.response.data.detail}`
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }])
    } finally {
      setLoading(false)
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
    <div className="flex flex-col h-full">
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
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="flex items-center gap-2 bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-lg px-3 py-2 text-sm transition-colors"
              disabled={modelsLoading}
            >
              {isGeminiModel ? <Sparkles size={14} className="text-blue-400" /> : <Cpu size={14} className="text-blue-400" />}
              <span className="text-gray-300">{modelsLoading ? 'Loading...' : (selectedModel || 'Select model')}</span>
              {currentModel && currentModel.size > 0 && <span className="text-xs text-gray-500">({formatSize(currentModel.size)})</span>}
              {downloadingModels.length > 0 && <Loader size={14} className="text-blue-400 animate-spin" />}
              <ChevronDown size={14} className={`text-gray-500 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 max-h-[75vh] overflow-y-auto border border-gray-700 rounded-xl shadow-2xl z-50 divide-y divide-gray-700" style={{ background: '#141920' }}>
                {downloadingModels.length > 0 && (
                  <div className="px-4 py-2 bg-blue-900/20 text-xs text-blue-300 flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin" />
                    <span>Downloading: {downloadingModels.join(', ')}...</span>
                  </div>
                )}

                {/* Gemini Cloud Models */}
                <div className="p-2">
                  <span className="flex items-center gap-1.5 px-3 py-1 text-2xs uppercase tracking-wider font-semibold text-blue-400/80">
                    <Sparkles size={10} /> Google Gemini (Cloud)
                  </span>
                  {!geminiApiKey && (
                    <div className="mx-2 my-1 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
                      Set your Gemini API key in Settings to use these models.
                    </div>
                  )}
                  {GEMINI_MODELS.map(gm => (
                    <button
                      key={gm.name}
                      onClick={() => {
                        setSelectedModel(gm.name)
                        setModelDropdownOpen(false)
                        if (!geminiApiKey) setTimeout(() => setSettingsOpen(true), 100)
                      }}
                      className={`w-full text-left px-3 py-2.5 my-0.5 rounded-lg text-sm hover:bg-gray-700/60 transition-all flex items-center justify-between ${
                        selectedModel === gm.name ? 'bg-blue-600/10 border-l-2 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-gray-200 font-medium text-xs">{gm.label}</span>
                        <span className="text-gray-500 text-3xs">{gm.desc}</span>
                      </div>
                      <span className="text-2xs text-blue-400 font-medium bg-blue-500/10 px-1.5 py-0.5 rounded">Cloud</span>
                    </button>
                  ))}
                </div>

                {/* Installed Local Models */}
                <div className="p-2">
                  <span className="block px-3 py-1 text-2xs uppercase tracking-wider font-semibold text-gray-400">Installed (Local)</span>
                  {models.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">No models found</div>
                  ) : (
                    models.map(model => (
                      <button
                        key={model.name}
                        onClick={() => { setSelectedModel(model.name); setModelDropdownOpen(false) }}
                        className={`w-full text-left px-3 py-2.5 my-0.5 rounded-lg text-sm hover:bg-gray-700/60 transition-all flex items-center justify-between ${
                          selectedModel === model.name ? 'bg-blue-600/10 border-l-2 border-blue-500' : ''
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-gray-200 font-medium text-xs">{model.name}</span>
                          {model.name === defaultModel && <span className="text-3xs text-blue-400 font-medium uppercase mt-0.5">default</span>}
                        </div>
                        <span className="text-2xs text-gray-400">{formatSize(model.size)}</span>
                      </button>
                    ))
                  )}
                </div>

                {/* Download Recommended */}
                <div className="p-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <span className="block px-3 py-1 text-2xs uppercase tracking-wider font-semibold text-gray-400 mb-1">Download Recommended</span>
                  {RECOMMENDED_MODELS.map(rec => {
                    const isInstalled = models.some(m => m.name.startsWith(rec.name))
                    const isDownloading = downloadingModels.includes(rec.name)
                    return (
                      <div key={rec.name} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-700/30 transition-all">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-gray-300">{rec.label}</span>
                          <span className="text-3xs text-gray-500">{rec.size}</span>
                        </div>
                        {isInstalled ? (
                          <span className="text-2xs text-green-400 font-medium bg-green-500/10 px-2 py-0.5 rounded">Installed</span>
                        ) : isDownloading ? (
                          <span className="text-2xs text-blue-400 font-medium bg-blue-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                            <Loader size={10} className="animate-spin" /> Pulling
                          </span>
                        ) : (
                          <button
                            onClick={() => startDownload(rec.name)}
                            className="flex items-center gap-1 text-2xs font-medium text-blue-400 hover:text-white bg-blue-600/10 hover:bg-blue-600 px-2.5 py-1.5 rounded transition-all"
                          >
                            <Download size={10} /> Download
                          </button>
                        )}
                      </div>
                    )
                  })}
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
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
              msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-800 border border-gray-700'
            }`}>
              {msg.content}
              {msg.model && msg.role === 'assistant' && (
                <div className="mt-1 pt-1 border-t border-gray-700 text-xs text-gray-500 flex items-center gap-1">
                  {msg.model.startsWith('gemini-') ? <Sparkles size={10} /> : <Cpu size={10} />} {msg.model}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400 flex items-center gap-2">
              <Loader size={14} className="animate-spin" /> Thinking...
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
  )
}


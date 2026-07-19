import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Send, ChevronDown, Cpu, Download, RefreshCw, Loader } from 'lucide-react'

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

interface RecommendedModel {
  name: string
  label: string
  size: string
}

const RECOMMENDED_MODELS: RecommendedModel[] = [
  { name: 'llama3', label: 'Llama 3 (8B)', size: '4.7 GB' },
  { name: 'llama3.2', label: 'Llama 3.2 (3B)', size: '2.0 GB' },
  { name: 'qwen2.5:3b', label: 'Qwen 2.5 (3B)', size: '2.0 GB' },
  { name: 'gemma2:2b', label: 'Gemma 2 (2.6B)', size: '1.6 GB' },
]

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

  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch available models
  const fetchModels = async () => {
    try {
      const resp = await axios.get('/api/ai/models')
      setModels(resp.data.models || [])
      setDefaultModel(resp.data.default || '')
      if (!selectedModel) {
        setSelectedModel(resp.data.default || '')
      }
    } catch {
      console.error('Could not fetch models')
    } finally {
      setModelsLoading(false)
    }
  }

  // Fetch pulling status
  const fetchPullStatus = async () => {
    try {
      const resp = await axios.get('/api/ai/pull/status')
      const downloading = resp.data.downloading || []
      
      // If a model finished downloading (it was in downloadingModels but is no longer)
      // refresh the installed models list
      if (downloadingModels.some(m => !downloading.includes(m))) {
        fetchModels()
      }
      setDownloadingModels(downloading)
    } catch {
      console.error('Could not fetch pull status')
    }
  }

  useEffect(() => {
    fetchModels()
  }, [])

  // Poll pull status if anything is downloading
  useEffect(() => {
    fetchPullStatus()
    const interval = setInterval(() => {
      fetchPullStatus()
    }, 4000)
    return () => clearInterval(interval)
  }, [downloadingModels])

  // Handle click outside dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const sendMessage = async () => {
    if (!input.trim()) return

    const userMsg: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const resp = await axios.post('/api/ai/chat', {
        context: input,
        prompt: 'You are K8Pilot, an AI Kubernetes operations assistant.',
        model: selectedModel || undefined,
      })
      const assistantMsg: Message = {
        role: 'assistant',
        content: resp.data.response,
        model: resp.data.model,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Could not reach AI service.' }])
    } finally {
      setLoading(false)
    }
  }

  const startDownload = async (modelName: string) => {
    try {
      setDownloadingModels(prev => [...prev, modelName])
      await axios.post('/api/ai/pull', { name: modelName })
      fetchPullStatus()
    } catch (e) {
      console.error('Failed to trigger download', e)
    }
  }

  const currentModel = models.find(m => m.name === selectedModel)

  return (
    <div className="flex flex-col h-full">
      {/* Header with model selector */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">AI Assistant</h2>

        {/* Model selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            id="model-selector-btn"
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="flex items-center gap-2 bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-lg px-3 py-2 text-sm transition-colors"
            disabled={modelsLoading}
          >
            <Cpu size={14} className="text-blue-400" />
            <span className="text-gray-300">
              {modelsLoading ? 'Loading...' : (selectedModel || 'Select model')}
            </span>
            {currentModel && currentModel.size > 0 && (
              <span className="text-xs text-gray-500">({formatSize(currentModel.size)})</span>
            )}
            {downloadingModels.length > 0 && (
              <Loader size={14} className="text-blue-400 animate-spin" />
            )}
            <ChevronDown size={14} className={`text-gray-500 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {modelDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-gray-850 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-gray-700 backdrop-blur-md">
              {/* Active downloading indicators */}
              {downloadingModels.length > 0 && (
                <div className="px-4 py-2 bg-blue-900/20 text-xs text-blue-300 flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Downloading: {downloadingModels.join(', ')}...</span>
                </div>
              )}

              {/* Section 1: Installed Models */}
              <div className="p-2">
                <span className="block px-3 py-1 text-2xs uppercase tracking-wider font-semibold text-gray-400">
                  Installed Models
                </span>
                {models.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No models found</div>
                ) : (
                  models.map(model => (
                    <button
                      key={model.name}
                      onClick={() => {
                        setSelectedModel(model.name)
                        setModelDropdownOpen(false)
                      }}
                      className={`w-full text-left px-3 py-2.5 my-0.5 rounded-lg text-sm hover:bg-gray-700/60 transition-all flex items-center justify-between ${
                        selectedModel === model.name ? 'bg-blue-600/10 border-l-2 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-gray-200 font-medium text-xs">{model.name}</span>
                        {model.name === defaultModel && (
                          <span className="text-3xs text-blue-400 font-medium uppercase mt-0.5">default</span>
                        )}
                      </div>
                      <span className="text-2xs text-gray-400">{formatSize(model.size)}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Section 2: Recommended Models to Download */}
              <div className="p-2 bg-gray-900/30">
                <span className="block px-3 py-1 text-2xs uppercase tracking-wider font-semibold text-gray-400 mb-1">
                  Download Recommended
                </span>
                {RECOMMENDED_MODELS.map(rec => {
                  const isInstalled = models.some(m => m.name.startsWith(rec.name));
                  const isDownloading = downloadingModels.includes(rec.name);

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
                  <Cpu size={10} /> {msg.model}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-400">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          id="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder="Ask about your cluster..."
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

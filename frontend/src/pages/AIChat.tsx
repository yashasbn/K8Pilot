import { useState, useEffect } from 'react'
import axios from 'axios'
import { Send, ChevronDown, Cpu } from 'lucide-react'

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

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const resp = await axios.get('/api/ai/models')
        setModels(resp.data.models || [])
        setDefaultModel(resp.data.default || '')
        setSelectedModel(resp.data.default || '')
      } catch {
        console.error('Could not fetch models')
      } finally {
        setModelsLoading(false)
      }
    }
    fetchModels()
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

  const currentModel = models.find(m => m.name === selectedModel)

  return (
    <div className="flex flex-col h-full">
      {/* Header with model selector */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">AI Assistant</h2>

        {/* Model selector */}
        <div className="relative">
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
            <ChevronDown size={14} className={`text-gray-500 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {modelDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {models.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500">No models available</div>
              ) : (
                models.map(model => (
                  <button
                    key={model.name}
                    id={`model-option-${model.name.replace(/[:.]/g, '-')}`}
                    onClick={() => {
                      setSelectedModel(model.name)
                      setModelDropdownOpen(false)
                    }}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-700 transition-colors flex items-center justify-between ${
                      selectedModel === model.name ? 'bg-gray-700/50 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-gray-200 font-medium">{model.name}</span>
                      {model.name === defaultModel && (
                        <span className="text-xs text-blue-400 mt-0.5">default</span>
                      )}
                    </div>
                    {model.size > 0 && (
                      <span className="text-xs text-gray-500 ml-2">{formatSize(model.size)}</span>
                    )}
                  </button>
                ))
              )}
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

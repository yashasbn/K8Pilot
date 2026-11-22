import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { X, Copy, Check, Download, FileCode, Loader2 } from 'lucide-react'

interface ManifestModalProps {
  isOpen: boolean
  onClose: () => void
  kind: string
  name: string
  namespace: string
}

export default function ManifestModal({
  isOpen,
  onClose,
  kind,
  name,
  namespace,
}: ManifestModalProps) {
  const [copied, setCopied] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['manifest', kind, name, namespace],
    queryFn: () =>
      axios
        .get(`/api/cluster/manifest?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}&namespace=${encodeURIComponent(namespace || 'default')}`)
        .then((r) => r.data),
    enabled: isOpen && !!name && !!kind,
  })

  if (!isOpen) return null

  const handleCopy = () => {
    if (data?.yaml) {
      navigator.clipboard.writeText(data.yaml)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (data?.yaml) {
      const blob = new Blob([data.yaml], { type: 'text/yaml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${kind.toLowerCase()}-${name}.yaml`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const lines = data?.yaml ? data.yaml.split('\n') : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <FileCode size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-gray-800 text-blue-300 border border-gray-700 font-semibold">
                  {kind}
                </span>
                <h3 className="text-lg font-semibold text-white tracking-wide">{name}</h3>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Namespace: <span className="font-mono text-gray-300">{namespace || 'default'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={isLoading || !data?.yaml}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 hover:text-white rounded-lg border border-gray-700 transition disabled:opacity-50"
              title="Copy to Clipboard"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy YAML'}
            </button>
            <button
              onClick={handleDownload}
              disabled={isLoading || !data?.yaml}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 hover:text-white rounded-lg border border-gray-700 transition disabled:opacity-50"
              title="Download YAML file"
            >
              <Download size={14} />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition ml-2"
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-950 p-4 font-mono text-xs">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
              <Loader2 size={28} className="animate-spin text-blue-400" />
              <span>Fetching live manifest from Kubernetes API...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg m-4">
              <p className="font-semibold">Failed to load manifest</p>
              <p className="text-xs text-rose-300 mt-1">{(error as any)?.response?.data?.detail || (error as Error).message}</p>
            </div>
          ) : (
            <div className="table w-full">
              {lines.map((line: string, idx: number) => (
                <div key={idx} className="table-row hover:bg-gray-900/60 transition-colors">
                  <span className="table-cell select-none text-right pr-4 text-gray-600 w-12 border-r border-gray-800/80">
                    {idx + 1}
                  </span>
                  <span className="table-cell pl-4 text-gray-200 whitespace-pre">
                    {line}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/80 flex items-center justify-between text-xs text-gray-400">
          <span>Read-only Kubernetes API manifest export</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Terminal,
  Activity,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  X,
  Copy,
  Check,
  Search,
  RefreshCw,
  Cpu,
  HardDrive,
  Layers,
  ChevronRight,
} from 'lucide-react'

export default function Pods() {
  const [namespace, setNamespace] = useState('_all')
  const [podSearch, setPodSearch] = useState('')
  const [selectedPod, setSelectedPod] = useState<any | null>(null)
  const navigate = useNavigate()

  const { data: namespaces } = useQuery({
    queryKey: ['namespaces'],
    queryFn: () => axios.get('/api/cluster/namespaces').then(r => r.data),
  })

  const { data: podsData, isLoading: podsLoading, refetch: refetchPods } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => axios.get(`/api/cluster/pods?namespace=${namespace}`).then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: metricsData } = useQuery({
    queryKey: ['cluster-metrics'],
    queryFn: () => axios.get('/api/cluster/metrics').then(r => r.data),
    refetchInterval: 10000,
  })

  const podMetrics = metricsData?.pods || {}

  const filteredPods = (podsData?.pods || []).filter((pod: any) => {
    return pod.name.toLowerCase().includes(podSearch.toLowerCase())
  })

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Pods</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click any pod to inspect live logs, pod events, and AI diagnostics</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Namespace Filter */}
          <select
            value={namespace}
            onChange={e => setNamespace(e.target.value)}
            className="bg-gray-800 border border-gray-700/80 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="_all">All Namespaces</option>
            {namespaces?.namespaces?.map((ns: string) => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Filter pods by name..."
              value={podSearch}
              onChange={e => setPodSearch(e.target.value)}
              className="w-full bg-gray-800/90 border border-gray-700/70 rounded-lg pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {podSearch && (
              <button onClick={() => setPodSearch('')} className="absolute right-2 top-2 text-gray-500 hover:text-gray-300">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pods Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60 text-gray-400 text-xs uppercase tracking-wider font-medium">
              <tr>
                <th className="text-left px-5 py-3">Pod Name</th>
                <th className="text-left px-5 py-3">Namespace</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Live CPU</th>
                <th className="text-left px-5 py-3">Live Memory</th>
                <th className="text-left px-5 py-3">Restarts</th>
                <th className="text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/80">
              {podsLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500 text-xs">
                    Loading pods...
                  </td>
                </tr>
              ) : filteredPods.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500 text-xs">
                    {podSearch ? 'No pods match your filter.' : 'No pods found in selected namespace.'}
                  </td>
                </tr>
              ) : (
                filteredPods.map((pod: any) => {
                  const metricKey = `${pod.namespace}/${pod.name}`
                  const metric = podMetrics[metricKey]
                  const isSelected = selectedPod?.name === pod.name && selectedPod?.namespace === pod.namespace

                  return (
                    <tr
                      key={metricKey}
                      onClick={() => setSelectedPod(pod)}
                      className={`hover:bg-gray-800/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-600/10' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-gray-100 text-xs">{pod.name}</span>
                          {pod.containers.length > 1 && (
                            <span className="text-3xs px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 font-mono">
                              {pod.containers.length}c
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 font-mono border border-gray-700/80">
                          {pod.namespace}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        <PhaseBadge phase={pod.phase} reason={pod.status_reason} />
                      </td>

                      <td className="px-5 py-3.5 text-xs font-mono">
                        {metric ? (
                          <span className="text-gray-300">{metric.cpu_display}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-xs font-mono">
                        {metric ? (
                          <span className="text-gray-300">{metric.memory_display}</span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-xs font-mono">
                        <span className={pod.restarts > 5 ? 'text-amber-400 font-semibold' : 'text-gray-400'}>
                          {pod.restarts}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedPod(pod)
                          }}
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-blue-500/10 transition"
                        >
                          <span>Logs</span>
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-out Pod Drawer */}
      {selectedPod && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity animate-in fade-in duration-200"
            onClick={() => setSelectedPod(null)}
          />
          <PodDrawer
            pod={selectedPod}
            metric={podMetrics[`${selectedPod.namespace}/${selectedPod.name}`]}
            onClose={() => setSelectedPod(null)}
            onRestartSuccess={() => refetchPods()}
            onDiagnose={prompt => {
              navigate('/ai', { state: { initialPrompt: prompt } })
            }}
          />
        </>
      )}
    </div>
  )
}

function PhaseBadge({ phase, reason }: { phase: string; reason?: string }) {
  const isProblem = reason && ['CrashLoopBackOff', 'OOMKilled', 'Error', 'Failed', 'ImagePullBackOff', 'ErrImagePull'].includes(reason)

  if (isProblem) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold">
        <AlertTriangle size={11} />
        {reason}
      </span>
    )
  }

  const colors: Record<string, string> = {
    Running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Failed: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    Succeeded: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${colors[phase] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
      {reason && reason !== phase ? reason : phase}
    </span>
  )
}

function PodDrawer({
  pod,
  metric,
  onClose,
  onRestartSuccess,
  onDiagnose,
}: {
  pod: any
  metric?: any
  onClose: () => void
  onRestartSuccess: () => void
  onDiagnose: (prompt: string) => void
}) {
  const [tab, setTab] = useState<'logs' | 'events' | 'details'>('logs')
  const [tailLines, setTailLines] = useState(100)
  const [logs, setLogs] = useState<string>('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const fetchLogs = async () => {
    setLogsLoading(true)
    try {
      const resp = await axios.post('/api/actions/logs', {
        name: pod.name,
        namespace: pod.namespace,
        tail_lines: tailLines,
      })
      setLogs(resp.data.logs || 'No logs found for this container.')
    } catch (err: any) {
      setLogs(`Error fetching logs: ${err?.response?.data?.detail || err.message}`)
    } finally {
      setLogsLoading(false)
    }
  }

  const { data: podEventsData } = useQuery({
    queryKey: ['pod-events', pod.namespace, pod.name],
    queryFn: () => axios.get(`/api/cluster/events?namespace=${pod.namespace}&limit=50`).then(r => r.data),
    refetchInterval: 15000,
  })

  const podEvents = (podEventsData?.events || []).filter(
    (e: any) => e.involved_object?.name === pod.name
  )

  useEffect(() => {
    if (tab === 'logs') fetchLogs()
  }, [pod.name, pod.namespace, tailLines, tab])

  const copyLogs = () => {
    navigator.clipboard.writeText(logs)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const restartPod = async () => {
    if (!confirm(`Are you sure you want to delete pod '${pod.name}'? The controlling deployment will automatically recreate it.`)) return
    setRestarting(true)
    try {
      await axios.post('/api/actions/delete-pod', { name: pod.name, namespace: pod.namespace })
      onRestartSuccess()
      onClose()
    } catch (err: any) {
      alert(`Failed to restart pod: ${err?.response?.data?.detail || err.message}`)
    } finally {
      setRestarting(false)
    }
  }

  const triggerDiagnosis = () => {
    const recentLogs = logs ? logs.slice(-800) : '(No logs recorded)'
    const contextPrompt = `Please diagnose pod '${pod.name}' in namespace '${pod.namespace}'.
Current Phase: ${pod.phase}
Status: ${pod.status_reason}
Total Restarts: ${pod.restarts}
Recent Logs:
${recentLogs}

Provide a structured technical diagnosis:
1. Health Summary: Is this a critical error, harmless warning/deprecation, or normal behavior?
2. Log Analysis: Explain the log messages or warnings shown above.
3. Root Cause: Why it restarted or produced these logs.
4. Recommendations: What should the operator do (if anything)?`
    onDiagnose(contextPrompt)
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-gray-900 border-l border-gray-800 shadow-2xl z-50 flex flex-col">
      {/* Drawer Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/90">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono font-bold text-sm text-gray-100">{pod.name}</h3>
            <PhaseBadge phase={pod.phase} reason={pod.status_reason} />
          </div>
          <p className="text-3xs text-gray-400 font-mono mt-0.5">
            ns: <span className="text-gray-200">{pod.namespace}</span> · Node: <span className="text-gray-200">{pod.node_name || '—'}</span>
          </p>
        </div>

        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition">
          <X size={18} />
        </button>
      </div>

      {/* Action Bar */}
      <div className="px-6 py-2.5 bg-gray-800/40 border-b border-gray-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 font-mono text-3xs text-gray-400">
          {metric && (
            <>
              <span className="flex items-center gap-1 text-blue-400"><Cpu size={12} /> {metric.cpu_display}</span>
              <span className="flex items-center gap-1 text-purple-400"><HardDrive size={12} /> {metric.memory_display}</span>
            </>
          )}
          <span>Restarts: {pod.restarts}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerDiagnosis}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/15 hover:bg-blue-600 text-blue-300 hover:text-white font-medium text-xs transition-all border border-blue-500/30"
          >
            <Sparkles size={12} />
            <span>Diagnose with AI</span>
          </button>

          <button
            onClick={restartPod}
            disabled={restarting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-600 text-rose-300 hover:text-white font-medium text-xs transition-all border border-rose-500/20"
          >
            <RotateCcw size={12} className={restarting ? 'animate-spin' : ''} />
            <span>Restart Pod</span>
          </button>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-gray-800 px-6 gap-6 text-xs font-medium">
        <button
          onClick={() => setTab('logs')}
          className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
            tab === 'logs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Terminal size={14} />
          <span>Live Logs</span>
        </button>

        <button
          onClick={() => setTab('events')}
          className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
            tab === 'events' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Activity size={14} />
          <span>Pod Events</span>
          {podEvents.length > 0 && (
            <span className="text-3xs px-1.5 rounded-full bg-gray-800 text-gray-300">{podEvents.length}</span>
          )}
        </button>

        <button
          onClick={() => setTab('details')}
          className={`py-3 border-b-2 flex items-center gap-1.5 transition ${
            tab === 'details' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Layers size={14} />
          <span>Container Details</span>
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-auto p-6">
        {/* TAB: LOGS */}
        {tab === 'logs' && (
          <div className="flex flex-col h-full space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Tail:</span>
                {[50, 100, 250].map(lines => (
                  <button
                    key={lines}
                    onClick={() => setTailLines(lines)}
                    className={`px-2 py-0.5 rounded text-3xs font-mono transition ${
                      tailLines === lines ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {lines}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLogs}
                  className="flex items-center gap-1 text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-800 transition"
                >
                  <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>
                <button
                  onClick={copyLogs}
                  className="flex items-center gap-1 text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-800 transition"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 bg-black/70 border border-gray-800 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-auto whitespace-pre leading-relaxed select-text">
              {logsLoading ? 'Streaming logs...' : logs}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* TAB: EVENTS */}
        {tab === 'events' && (
          <div className="space-y-3">
            {podEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                No events recorded specifically for this pod.
              </div>
            ) : (
              podEvents.map((ev: any, idx: number) => (
                <div key={idx} className="p-3.5 bg-gray-800/40 border border-gray-800 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${ev.type === 'Warning' ? 'text-rose-400' : 'text-gray-200'}`}>
                      {ev.reason}
                    </span>
                    <span className="text-3xs text-gray-500 font-mono">
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                  <p className="text-gray-400 leading-relaxed text-xs">{ev.message}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: DETAILS */}
        {tab === 'details' && (
          <div className="space-y-4 text-xs">
            <div className="bg-gray-800/30 border border-gray-800 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-gray-200 mb-2">Pod Overview</h4>
              <div className="grid grid-cols-2 gap-2 font-mono text-3xs">
                <div><span className="text-gray-500">Node:</span> {pod.node_name || '—'}</div>
                <div><span className="text-gray-500">Pod IP:</span> {pod.pod_ip || '—'}</div>
                <div><span className="text-gray-500">Phase:</span> {pod.phase}</div>
                <div><span className="text-gray-500">Restarts:</span> {pod.restarts}</div>
                <div><span className="text-gray-500">Started:</span> {pod.start_time ? new Date(pod.start_time).toLocaleString() : '—'}</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-gray-200">Containers ({pod.containers.length})</h4>
              {pod.container_details?.map((cd: any, idx: number) => (
                <div key={idx} className="bg-gray-800/40 border border-gray-800 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-gray-200">{cd.name}</span>
                    <span className={`px-2 py-0.5 rounded text-3xs ${cd.ready ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {cd.ready ? 'Ready' : 'Not Ready'}
                    </span>
                  </div>
                  <div className="text-3xs font-mono text-gray-400">
                    Image: <span className="text-gray-300">{cd.image}</span>
                  </div>
                  <div className="text-3xs font-mono text-gray-400">
                    State: <span className="text-gray-300">{cd.state}</span> {cd.reason && `(${cd.reason})`}
                  </div>
                </div>
              )) ?? (
                <div className="text-gray-500 text-3xs">No container details available.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

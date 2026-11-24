import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, HardDrive, AlertTriangle, CheckCircle2, Clock, RefreshCw, Activity, Layers, Sparkles, AlertOctagon, ArrowRight } from 'lucide-react'

export default function Dashboard() {
  const navigate = useNavigate()
  const [eventFilter, setEventFilter] = useState<'all' | 'Warning'>('all')

  const { data: incidentStats } = useQuery({
    queryKey: ['incident-stats-dash'],
    queryFn: () => axios.get('/api/incidents/stats').then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: () => axios.get('/health').then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: nodesData } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => axios.get('/api/cluster/nodes').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: metricsData, isFetching: metricsFetching } = useQuery({
    queryKey: ['cluster-metrics'],
    queryFn: () => axios.get('/api/cluster/metrics').then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: eventsData } = useQuery({
    queryKey: ['cluster-events', eventFilter],
    queryFn: () => axios.get(`/api/cluster/events?type=${eventFilter}&limit=10`).then(r => r.data),
    refetchInterval: 15000,
  })

  const clusterMetrics = metricsData?.cluster
  const nodeMetricsMap: Record<string, any> = {}
  metricsData?.nodes?.forEach((n: any) => {
    nodeMetricsMap[n.name] = n
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Cluster Dashboard</h2>
          <p className="text-xs text-gray-400 mt-0.5">Real-time health, resource utilization, and cluster event stream</p>
        </div>
        <div className="flex items-center gap-2">
          {metricsFetching && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400">
              <RefreshCw size={12} className="animate-spin" />
              <span>Updating live metrics...</span>
            </span>
          )}
        </div>
      </div>

      {/* Incident Alert Banner */}
      {(incidentStats?.open ?? 0) > 0 && (
        <div className="p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
              <AlertOctagon size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-red-300">
                  {incidentStats.open} Cluster Incident{incidentStats.open > 1 ? 's' : ''} Detected
                </span>
                {incidentStats.critical > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-red-500/20 text-red-300 border border-red-500/30">
                    {incidentStats.critical} critical
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Automated anomaly detector flagged workload failures in the cluster.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/incidents')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition shadow-sm shrink-0"
          >
            <span>Incident Command Center</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Row 1: Platform Component Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatusCard
          title="Platform Status"
          value={healthLoading ? 'checking...' : (health?.status ?? 'offline')}
          color={health?.status === 'healthy' ? 'green' : 'yellow'}
        />
        <StatusCard
          title="Prometheus"
          value={health?.checks?.prometheus ?? '...'}
          color={health?.checks?.prometheus === 'ok' ? 'green' : 'red'}
        />
        <StatusCard
          title="Redis Cache"
          value={health?.checks?.redis ?? '...'}
          color={health?.checks?.redis === 'ok' ? 'green' : 'red'}
        />
        <StatusCard
          title="Ollama (Local LLM)"
          value={health?.checks?.ollama ?? '...'}
          color={health?.checks?.ollama === 'ok' ? 'green' : 'yellow'}
        />
      </div>

      {/* Row 2: Live Cluster Resource Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPU Utilization */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                <Cpu size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-200">Live CPU Usage</h4>
                <p className="text-xs text-gray-500">metrics-server instantaneous aggregate</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-white font-mono">
                {clusterMetrics ? `${clusterMetrics.cpu_percent}%` : '—'}
              </span>
            </div>
          </div>

          <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden mb-2">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                (clusterMetrics?.cpu_percent ?? 0) > 80
                  ? 'bg-red-500'
                  : (clusterMetrics?.cpu_percent ?? 0) > 60
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(clusterMetrics?.cpu_percent ?? 0, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-400 font-mono">
            <span>Used / Total:</span>
            <span>{clusterMetrics?.cpu_display ?? 'Awaiting metrics...'}</span>
          </div>
        </div>

        {/* Memory Utilization */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                <HardDrive size={18} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-200">Live Memory Usage</h4>
                <p className="text-xs text-gray-500">Allocatable RAM consumption</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-white font-mono">
                {clusterMetrics ? `${clusterMetrics.memory_percent}%` : '—'}
              </span>
            </div>
          </div>

          <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden mb-2">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                (clusterMetrics?.memory_percent ?? 0) > 85
                  ? 'bg-red-500'
                  : (clusterMetrics?.memory_percent ?? 0) > 70
                  ? 'bg-amber-500'
                  : 'bg-purple-500'
              }`}
              style={{ width: `${Math.min(clusterMetrics?.memory_percent ?? 0, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-400 font-mono">
            <span>Used / Total:</span>
            <span>{clusterMetrics?.memory_display ?? 'Awaiting metrics...'}</span>
          </div>
        </div>
      </div>

      {/* Row 3: Nodes Table with Live Metrics */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-100">Nodes Overview</h3>
          </div>
          <span className="text-xs text-gray-500 font-mono">
            {nodesData?.nodes?.length ?? 0} node(s) connected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60 text-gray-400 text-xs uppercase tracking-wider font-medium">
              <tr>
                <th className="text-left px-5 py-3">Node</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Live CPU Usage</th>
                <th className="text-left px-5 py-3">Live Memory Usage</th>
                <th className="text-left px-5 py-3">Internal IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/80">
              {nodesData?.nodes?.map((node: any) => {
                const live = nodeMetricsMap[node.name]
                return (
                  <tr key={node.name} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-medium text-gray-200">
                      {node.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                        <CheckCircle2 size={12} />
                        {node.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {live ? (
                        <div className="space-y-1 max-w-xs">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-300">{live.cpu_percent}%</span>
                            <span className="text-gray-500">{live.cpu_display}</span>
                          </div>
                          <div className="w-32 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(live.cpu_percent, 100)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500 font-mono text-xs">{node.cpu} cores</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {live ? (
                        <div className="space-y-1 max-w-xs">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-gray-300">{live.memory_percent}%</span>
                            <span className="text-gray-500">{live.memory_display}</span>
                          </div>
                          <div className="w-32 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min(live.memory_percent, 100)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500 font-mono text-xs">{node.memory}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">
                      {node.addresses?.InternalIP ?? '—'}
                    </td>
                  </tr>
                )
              }) ?? (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-center text-gray-500">Loading nodes...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: Cluster Events & Warnings Feed */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-100">Cluster Events Feed</h3>
            {eventsData?.warnings_count > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                {eventsData.warnings_count} Warning{eventsData.warnings_count > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 bg-gray-800/80 p-1 rounded-lg border border-gray-700/60 text-xs">
            <button
              onClick={() => setEventFilter('all')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                eventFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => setEventFilter('Warning')}
              className={`px-2.5 py-1 rounded font-medium transition flex items-center gap-1 ${
                eventFilter === 'Warning'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-amber-400'
              }`}
            >
              <AlertTriangle size={12} />
              Warnings Only
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-800/80 max-h-96 overflow-y-auto">
          {eventsData?.events?.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">
              {eventFilter === 'Warning' ? 'No recent cluster warning events. Cluster is running smoothly!' : 'No events found.'}
            </div>
          ) : (
            eventsData?.events?.map((ev: any, idx: number) => {
              const isWarning = ev.type === 'Warning'
              return (
                <div key={idx} className="p-4 hover:bg-gray-800/20 transition-colors flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${isWarning ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {isWarning ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-gray-200">{ev.reason}</span>
                        <span className="px-1.5 py-0.5 rounded text-3xs font-mono bg-gray-800 border border-gray-700 text-gray-400">
                          {ev.involved_object?.kind}/{ev.involved_object?.name}
                        </span>
                        <span className="text-3xs text-gray-500 font-mono">ns: {ev.namespace}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{ev.message}</p>
                      {isWarning && (
                        <button
                          onClick={() =>
                            navigate('/ai', {
                              state: {
                                initialPrompt: `Investigate cluster event: [${ev.type}] ${ev.reason} on ${ev.involved_object?.kind}/${ev.involved_object?.name} in namespace ${ev.namespace}. Message: ${ev.message}`,
                              },
                            })
                          }
                          className="mt-2 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition font-medium"
                        >
                          <Sparkles size={11} className="text-amber-400" />
                          Diagnose with AI
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="flex items-center gap-1 text-3xs text-gray-500 font-mono">
                      <Clock size={11} />
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '—'}
                    </span>
                    {ev.count > 1 && (
                      <span className="inline-block mt-1 text-3xs px-1.5 py-0.2 rounded bg-gray-800 text-gray-400">
                        x{ev.count}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function StatusCard({ title, value, color = 'gray' }: { title: string; value: string; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
    yellow: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
    red: 'border-rose-500/30 text-rose-400 bg-rose-500/5',
    gray: 'border-gray-800 text-gray-300 bg-gray-900',
  }
  return (
    <div className={`border rounded-xl p-4 shadow-sm ${colorMap[color] ?? colorMap.gray}`}>
      <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">{title}</p>
      <p className="text-lg font-bold mt-1 capitalize">{value}</p>
    </div>
  )
}

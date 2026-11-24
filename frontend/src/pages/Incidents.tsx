import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Search,
  Wrench,
  XCircle,
  Clock,
  Zap,
  RotateCcw,
} from 'lucide-react'

interface IncidentItem {
  id: number
  title: string
  namespace: string
  severity: 'critical' | 'warning' | 'info'
  source: string
  details: {
    resource_kind?: string
    resource_name?: string
    pod_name?: string
    container_name?: string
    reason?: string
    message?: string
    restarts?: number
    recommended_action?: string
    action_payload?: Record<string, any>
    detected_at?: string
    last_seen?: string
    healed_at?: string
    healed_by?: string
    resolution_note?: string
    [key: string]: any
  } | null
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string | null
}

export default function Incidents() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [namespaceFilter, setNamespaceFilter] = useState<string>('_all')
  const [search, setSearch] = useState<string>('')
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null)

  // Fetch stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['incident-stats'],
    queryFn: () => axios.get('/api/incidents/stats').then((r) => r.data),
    refetchInterval: 10000,
  })

  // Fetch monitor settings
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['incident-settings'],
    queryFn: () => axios.get('/api/incidents/settings').then((r) => r.data),
  })

  // Fetch namespaces
  const { data: namespaces } = useQuery({
    queryKey: ['namespaces'],
    queryFn: () => axios.get('/api/cluster/namespaces').then((r) => r.data),
  })

  // Fetch incidents list
  const {
    data: incidents = [],
    isLoading,
    isFetching,
    refetch: refetchIncidents,
  } = useQuery<IncidentItem[]>({
    queryKey: ['incidents', statusFilter, severityFilter, namespaceFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (severityFilter !== 'all') params.append('severity', severityFilter)
      if (namespaceFilter !== '_all') params.append('namespace', namespaceFilter)
      params.append('limit', '100')
      return axios.get(`/api/incidents?${params.toString()}`).then((r) => r.data)
    },
    refetchInterval: 10000,
  })

  // Mutation: Trigger manual scan
  const scanMutation = useMutation({
    mutationFn: () => axios.post('/api/incidents/scan'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['incident-stats'] })
      const count = res.data?.anomalies_detected ?? 0
      setActionSuccessMsg(`Scan complete: ${count} anomal${count === 1 ? 'y' : 'ies'} detected.`)
      setTimeout(() => setActionSuccessMsg(null), 5000)
    },
  })

  // Mutation: Toggle Auto-Heal setting
  const toggleAutoHealMutation = useMutation({
    mutationFn: (enable: boolean) =>
      axios.post('/api/incidents/settings', { auto_heal_enabled: enable }),
    onSuccess: () => {
      refetchSettings()
      refetchStats()
    },
  })

  // Mutation: Heal an incident
  const healMutation = useMutation({
    mutationFn: (incidentId: number) =>
      axios.post(`/api/incidents/${incidentId}/heal`, { initiated_by: 'user' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['incident-stats'] })
      setActionSuccessMsg(res.data?.message || 'Self-healing action triggered successfully!')
      setTimeout(() => setActionSuccessMsg(null), 6000)
    },
    onError: (err: any) => {
      const errDetail = err.response?.data?.detail || err.message || 'Self-healing action failed'
      alert(`Healing error: ${errDetail}`)
    },
  })

  // Mutation: Dismiss an incident
  const dismissMutation = useMutation({
    mutationFn: (incidentId: number) => axios.post(`/api/incidents/${incidentId}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      queryClient.invalidateQueries({ queryKey: ['incident-stats'] })
    },
  })

  // Filtered incidents
  const filteredIncidents = incidents.filter((inc) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      inc.title.toLowerCase().includes(q) ||
      inc.namespace.toLowerCase().includes(q) ||
      inc.details?.resource_name?.toLowerCase().includes(q) ||
      inc.details?.pod_name?.toLowerCase().includes(q) ||
      inc.details?.reason?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* Top Banner / Alerts */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span className="font-medium">{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-400/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <AlertOctagon size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">
                Incident Command Center
              </h1>
              <p className="text-xs text-gray-400">
                Autonomous anomaly detection, failure telemetry & self-healing remediation
              </p>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-3">
          {/* Auto-Heal Mode Toggle */}
          <button
            onClick={() => toggleAutoHealMutation.mutate(!settings?.auto_heal_enabled)}
            disabled={toggleAutoHealMutation.isPending}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              settings?.auto_heal_enabled
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 hover:bg-purple-600/30'
                : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200'
            }`}
            title="When enabled, K8Pilot autonomously remediates known issues (e.g. restarts CrashLoopBackOff pods)"
          >
            <Zap
              size={14}
              className={settings?.auto_heal_enabled ? 'text-purple-400 fill-purple-400' : 'text-gray-500'}
            />
            <span>Auto-Heal Agent:</span>
            <span
              className={`font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                settings?.auto_heal_enabled
                  ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-gray-800 text-gray-400'
              }`}
            >
              {settings?.auto_heal_enabled ? 'Enabled' : 'Manual'}
            </span>
          </button>

          {/* Trigger Scan */}
          <button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={scanMutation.isPending ? 'animate-spin' : ''}
            />
            <span>Scan Cluster</span>
          </button>

          {/* Refresh Incidents */}
          <button
            onClick={() => {
              refetchIncidents()
              refetchStats()
            }}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition"
            title="Refresh"
          >
            <RotateCcw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Open Incidents</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                (stats?.open ?? 0) > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
          </div>
          <p
            className={`text-2xl font-bold font-mono mt-2 ${
              (stats?.open ?? 0) > 0 ? 'text-red-400' : 'text-gray-100'
            }`}
          >
            {stats?.open ?? 0}
          </p>
          <span className="text-[11px] text-gray-500">Requires review or action</span>
        </div>

        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Critical</span>
            <AlertOctagon size={16} className="text-red-400" />
          </div>
          <p className="text-2xl font-bold font-mono mt-2 text-red-400">
            {stats?.critical ?? 0}
          </p>
          <span className="text-[11px] text-gray-500">CrashLoopBackOff / OOM</span>
        </div>

        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Warnings</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <p className="text-2xl font-bold font-mono mt-2 text-amber-400">
            {stats?.warning ?? 0}
          </p>
          <span className="text-[11px] text-gray-500">Restarts / Image pull issues</span>
        </div>

        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Resolved / Healed</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono mt-2 text-emerald-400">
            {stats?.resolved ?? 0}
          </p>
          <span className="text-[11px] text-gray-500">Historical remediations</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Status Tab buttons */}
        <div className="flex items-center bg-gray-950 p-1 rounded-lg border border-gray-800 shrink-0">
          {(['open', 'resolved', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${
                statusFilter === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Severity, Namespace, and Search Inputs */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Severity selector */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
          </select>

          {/* Namespace selector */}
          <select
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
            className="bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="_all">All Namespaces</option>
            {namespaces?.map((ns: string) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>

          {/* Search box */}
          <div className="relative flex-1 md:w-64">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              type="text"
              placeholder="Filter incidents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Incidents List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500 text-xs bg-gray-900 border border-gray-800 rounded-xl">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
            Analyzing cluster health and querying incident database...
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-12 text-center bg-gray-900 border border-gray-800 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-sm font-semibold text-gray-200">
              Cluster is Healthy
            </h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              No matching incidents found for the selected filter criteria. Workloads are running normally.
            </p>
          </div>
        ) : (
          filteredIncidents.map((inc) => {
            const isCritical = inc.severity === 'critical'
            const isOpen = inc.status === 'open'
            const details = inc.details || {}
            const isHealPending = healMutation.isPending && healMutation.variables === inc.id
            const isDismissPending = dismissMutation.isPending && dismissMutation.variables === inc.id

            return (
              <div
                key={inc.id}
                className={`bg-gray-900 border rounded-xl p-4 transition shadow-sm ${
                  isOpen
                    ? isCritical
                      ? 'border-red-500/40 hover:border-red-500/60'
                      : 'border-amber-500/40 hover:border-amber-500/60'
                    : 'border-gray-800 opacity-80'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Incident info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Severity Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isCritical
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {inc.severity}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${
                          isOpen
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOpen ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'
                          }`}
                        />
                        {inc.status}
                      </span>

                      {/* Namespace Badge */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-400 border border-gray-700">
                        ns: {inc.namespace}
                      </span>

                      {/* Target Resource Kind / Name */}
                      {details.resource_kind && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          {details.resource_kind}: {details.resource_name}
                        </span>
                      )}

                      {/* Restart Count */}
                      {(details.restarts ?? 0) > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950/60 text-red-300 border border-red-800/40">
                          {details.restarts} restarts
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                      {inc.title}
                    </h3>

                    {/* Description message */}
                    {details.message && (
                      <p className="text-xs text-gray-400 leading-relaxed font-mono bg-gray-950/60 p-2.5 rounded-lg border border-gray-800/80">
                        {details.message}
                      </p>
                    )}

                    {/* Resolution Note if resolved */}
                    {details.resolution_note && (
                      <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                        <CheckCircle2 size={14} />
                        <span>Resolution: {details.resolution_note}</span>
                        {details.healed_at && (
                          <span className="text-[10px] text-gray-500 font-mono">
                            ({new Date(details.healed_at).toLocaleTimeString()})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Timestamps */}
                    <div className="flex items-center gap-4 text-[11px] text-gray-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        Detected: {inc.created_at ? new Date(inc.created_at).toLocaleString() : '—'}
                      </span>
                      {details.last_seen && (
                        <span>Last seen: {new Date(details.last_seen).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-2 shrink-0">
                    {/* Auto-Heal Action */}
                    {isOpen && (
                      <button
                        onClick={() => healMutation.mutate(inc.id)}
                        disabled={isHealPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition disabled:opacity-50"
                        title="Execute automated remediation (e.g. rolling restart or recreate pod)"
                      >
                        <Wrench size={13} className={isHealPending ? 'animate-spin' : ''} />
                        <span>{isHealPending ? 'Healing...' : 'Auto-Heal'}</span>
                      </button>
                    )}

                    {/* AI Diagnosis */}
                    <button
                      onClick={() =>
                        navigate('/ai', {
                          state: {
                            initialPrompt: `Investigate and diagnose cluster incident #${inc.id}: ${inc.title} in namespace ${inc.namespace}. Resource: ${details.resource_kind}/${details.resource_name}. Failure Reason: ${details.reason}. Message: ${details.message}.`,
                          },
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium border border-gray-700 transition"
                      title="Investigate with autonomous AI agent"
                    >
                      <Sparkles size={13} className="text-amber-400" />
                      <span>Diagnose with AI</span>
                    </button>

                    {/* Dismiss Button */}
                    {isOpen && (
                      <button
                        onClick={() => dismissMutation.mutate(inc.id)}
                        disabled={isDismissPending}
                        className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 transition"
                      >
                        <XCircle size={12} />
                        <span>Dismiss</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

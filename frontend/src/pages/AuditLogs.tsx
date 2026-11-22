import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import {
  ShieldCheck,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  User,
  Sparkles,
  Layers,
  Box,
  RotateCcw,
  Scale,
  Trash2,
  FileCode,
  Loader2,
} from 'lucide-react'

interface AuditLogItem {
  id: number
  action_type: string
  resource_kind: string
  resource_name: string
  namespace: string
  initiated_by: string
  payload: Record<string, any> | null
  status: string
  message: string | null
  created_at: string
}

export default function AuditLogs() {
  const [namespace, setNamespace] = useState('_all')
  const [actionType, setActionType] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Query namespaces
  const { data: namespaces } = useQuery({
    queryKey: ['namespaces'],
    queryFn: () => axios.get('/api/cluster/namespaces').then((r) => r.data),
  })

  // Query audit logs
  const {
    data: auditData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['audit-logs', namespace, actionType, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (namespace && namespace !== '_all') params.append('namespace', namespace)
      if (actionType && actionType !== 'all') params.append('action_type', actionType)
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter)
      params.append('limit', '100')
      return axios.get(`/api/audit/logs?${params.toString()}`).then((r) => r.data)
    },
    refetchInterval: 10000,
  })

  const logs: AuditLogItem[] = auditData?.logs || []

  const filteredLogs = logs.filter((log) => {
    const matchSearch =
      log.resource_name.toLowerCase().includes(search.toLowerCase()) ||
      (log.message || '').toLowerCase().includes(search.toLowerCase()) ||
      log.action_type.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const getActionBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case 'scale':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Scale size={11} /> Scale
          </span>
        )
      case 'restart':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <RotateCcw size={11} /> Restart
          </span>
        )
      case 'delete_pod':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Trash2 size={11} /> Delete Pod
          </span>
        )
      case 'create':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <FileCode size={11} /> Deploy
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-800 text-gray-300 border border-gray-700">
            {type}
          </span>
        )
    }
  }

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="text-blue-400" size={24} /> Audit Trail
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Immutable log of all cluster modifications, scaling operations, and SRE interventions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Namespace Filter */}
          <select
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="_all">All Namespaces</option>
            {(namespaces?.namespaces || []).map((ns: string) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>

          {/* Action Type Filter */}
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Actions</option>
            <option value="scale">Scale</option>
            <option value="restart">Restart</option>
            <option value="delete_pod">Delete Pod</option>
            <option value="create">Deploy</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Outcomes</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-2.5 top-2.5 text-gray-500" size={13} />
            <input
              type="text"
              placeholder="Search audit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg pl-8 pr-3 py-2 outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50"
            title="Refresh audit logs"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin text-blue-400' : ''} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-800/70 text-gray-400 uppercase font-medium border-b border-gray-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4">Namespace</th>
                <th className="py-3 px-4">Initiated By</th>
                <th className="py-3 px-4">Parameters</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 size={24} className="animate-spin text-blue-400" />
                      <span>Loading audit records from database...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-500">
                    No audit records found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-gray-400">
                      {formatTimestamp(log.created_at)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">{getActionBadge(log.action_type)}</td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        {log.resource_kind === 'Pod' ? (
                          <Box size={13} className="text-blue-400" />
                        ) : (
                          <Layers size={13} className="text-purple-400" />
                        )}
                        <span>{log.resource_name}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {log.resource_kind}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-gray-300 text-[11px]">
                      {log.namespace}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.initiated_by === 'ai' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          <Sparkles size={11} className="text-purple-400" /> AI Assistant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-300 border border-gray-700">
                          <User size={11} className="text-gray-400" /> User
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-gray-400">
                      {log.payload && Object.keys(log.payload).length > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-gray-800/90 text-gray-300 border border-gray-700/60">
                          {Object.entries(log.payload)
                            .filter(([k]) => !['name', 'deployment', 'namespace', 'kind', 'initiated_by'].includes(k))
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ') || '-'}
                        </span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                          <CheckCircle2 size={13} /> Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-medium text-[11px]">
                          <XCircle size={13} /> Failed
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-gray-300 text-xs max-w-sm truncate" title={log.message || ''}>
                      {log.message || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

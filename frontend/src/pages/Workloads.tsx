import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  Layers,
  Database,
  Cpu,
  Search,
  RefreshCw,
  RotateCcw,
  FileCode,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Check,
} from 'lucide-react'
import ManifestModal from '../components/ManifestModal'

type TabType = 'deployments' | 'statefulsets' | 'daemonsets'

interface DeploymentItem {
  name: string
  namespace: string
  replicas: number
  ready: number
  available: number
  updated: number
  images: string[]
  selector: Record<string, string>
  created_at: string
}

interface StatefulSetItem {
  name: string
  namespace: string
  replicas: number
  ready: number
  current: number
  updated: number
  images: string[]
  selector: Record<string, string>
  created_at: string
}

interface DaemonSetItem {
  name: string
  namespace: string
  desired: number
  current: number
  ready: number
  available: number
  misscheduled: number
  images: string[]
  selector: Record<string, string>
  created_at: string
}

export default function Workloads() {
  const queryClient = useQueryClient()
  const [namespace, setNamespace] = useState('_all')
  const [activeTab, setActiveTab] = useState<TabType>('deployments')
  const [search, setSearch] = useState('')
  const [scalingMap, setScalingMap] = useState<Record<string, number>>({})
  const [restartingMap, setRestartingMap] = useState<Record<string, boolean>>({})
  const [successToast, setSuccessToast] = useState<string | null>(null)

  // Manifest modal state
  const [manifestTarget, setManifestTarget] = useState<{
    kind: string
    name: string
    namespace: string
  } | null>(null)

  // Namespaces query
  const { data: namespaces } = useQuery({
    queryKey: ['namespaces'],
    queryFn: () => axios.get('/api/cluster/namespaces').then((r) => r.data),
  })

  // Workloads query
  const {
    data: workloadsData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['workloads', namespace],
    queryFn: () =>
      axios.get(`/api/cluster/workloads?namespace=${namespace}`).then((r) => r.data),
    refetchInterval: 10000,
  })

  const deployments: DeploymentItem[] = workloadsData?.deployments || []
  const statefulsets: StatefulSetItem[] = workloadsData?.statefulsets || []
  const daemonsets: DaemonSetItem[] = workloadsData?.daemonsets || []

  // Scale mutation
  const scaleMutation = useMutation({
    mutationFn: ({
      name,
      kind,
      ns,
      replicas,
    }: {
      name: string
      kind: string
      ns: string
      replicas: number
    }) =>
      axios.post('/api/actions/scale', {
        name,
        deployment: name,
        kind,
        namespace: ns,
        replicas,
      }),
    onSuccess: (_, variables) => {
      setSuccessToast(`Scaled ${variables.kind} '${variables.name}' to ${variables.replicas} replicas`)
      setTimeout(() => setSuccessToast(null), 3000)
      queryClient.invalidateQueries({ queryKey: ['workloads'] })
    },
    onError: (err: any) => {
      alert(`Scale failed: ${err?.response?.data?.detail || err.message}`)
    },
  })

  // Restart mutation
  const restartMutation = useMutation({
    mutationFn: ({
      name,
      kind,
      ns,
    }: {
      name: string
      kind: string
      ns: string
    }) => {
      setRestartingMap((prev) => ({ ...prev, [`${kind}-${ns}-${name}`]: true }))
      return axios.post('/api/actions/restart', {
        name,
        deployment: name,
        kind,
        namespace: ns,
      })
    },
    onSuccess: (_, variables) => {
      setRestartingMap((prev) => ({
        ...prev,
        [`${variables.kind}-${variables.ns}-${variables.name}`]: false,
      }))
      setSuccessToast(`Triggered rollout restart for ${variables.kind} '${variables.name}'`)
      setTimeout(() => setSuccessToast(null), 3000)
      queryClient.invalidateQueries({ queryKey: ['workloads'] })
    },
    onError: (err: any, variables) => {
      setRestartingMap((prev) => ({
        ...prev,
        [`${variables.kind}-${variables.ns}-${variables.name}`]: false,
      }))
      alert(`Restart failed: ${err?.response?.data?.detail || err.message}`)
    },
  })

  const getTargetReplicas = (key: string, current: number) => {
    return scalingMap[key] !== undefined ? scalingMap[key] : current
  }

  const setTargetReplicas = (key: string, val: number) => {
    setScalingMap((prev) => ({ ...prev, [key]: Math.max(0, val) }))
  }

  const handleApplyScale = (name: string, kind: string, ns: string, current: number) => {
    const key = `${kind}-${ns}-${name}`
    const target = getTargetReplicas(key, current)
    scaleMutation.mutate({ name, kind, ns, replicas: target })
  }

  // Filter items
  const filterList = (items: any[]) =>
    items.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase())
    )

  const filteredDeployments = filterList(deployments)
  const filteredStatefulSets = filterList(statefulsets)
  const filteredDaemonSets = filterList(daemonsets)

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-950 border border-emerald-500/40 text-emerald-300 px-4 py-2.5 rounded-lg shadow-xl animate-bounce">
          <Check size={16} />
          <span className="text-sm font-medium">{successToast}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Layers className="text-blue-400" size={24} /> Workloads
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Manage Deployments, StatefulSets, and DaemonSets with real-time scaling and rollout controls
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Namespace Selector */}
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

          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 text-gray-500" size={14} />
            <input
              type="text"
              placeholder="Search workloads..."
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
            title="Refresh workloads"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin text-blue-400' : ''} />
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
        <button
          onClick={() => setActiveTab('deployments')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
            activeTab === 'deployments'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <Layers size={14} />
          Deployments ({deployments.length})
        </button>

        <button
          onClick={() => setActiveTab('statefulsets')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
            activeTab === 'statefulsets'
              ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <Database size={14} />
          StatefulSets ({statefulsets.length})
        </button>

        <button
          onClick={() => setActiveTab('daemonsets')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
            activeTab === 'daemonsets'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <Cpu size={14} />
          DaemonSets ({daemonsets.length})
        </button>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500 gap-3">
          <Loader2 size={28} className="animate-spin text-blue-400" />
          <span className="text-sm">Loading workloads from cluster...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* DEPLOYMENTS TAB */}
          {activeTab === 'deployments' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-800/70 text-gray-400 uppercase font-medium border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Name / Namespace</th>
                      <th className="py-3 px-4">Replicas (Ready/Target)</th>
                      <th className="py-3 px-4">Scaling Stepper</th>
                      <th className="py-3 px-4">Images</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredDeployments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-500">
                          No Deployments found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredDeployments.map((dep) => {
                        const key = `Deployment-${dep.namespace}-${dep.name}`
                        const targetVal = getTargetReplicas(key, dep.replicas)
                        const isModified = targetVal !== dep.replicas
                        const isRestarting = restartingMap[key] || false
                        const isAllReady = dep.ready === dep.replicas && dep.replicas > 0

                        return (
                          <tr key={key} className="hover:bg-gray-800/40 transition">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{dep.name}</div>
                              <div className="text-gray-400 font-mono text-[11px]">
                                {dep.namespace}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                                    isAllReady
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : dep.ready > 0
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  }`}
                                >
                                  {isAllReady ? (
                                    <CheckCircle2 size={12} />
                                  ) : (
                                    <AlertTriangle size={12} />
                                  )}
                                  {dep.ready} / {dep.replicas} Ready
                                </span>
                                <span className="text-gray-500 text-[11px]">
                                  ({dep.updated} updated, {dep.available} available)
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setTargetReplicas(key, targetVal - 1)}
                                  disabled={targetVal <= 0}
                                  className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 disabled:opacity-40 transition"
                                  title="Scale Down"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="w-8 text-center font-mono font-semibold text-white bg-gray-950 px-2 py-0.5 rounded border border-gray-800">
                                  {targetVal}
                                </span>
                                <button
                                  onClick={() => setTargetReplicas(key, targetVal + 1)}
                                  className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                                  title="Scale Up"
                                >
                                  <Plus size={13} />
                                </button>

                                {isModified && (
                                  <button
                                    onClick={() =>
                                      handleApplyScale(
                                        dep.name,
                                        'Deployment',
                                        dep.namespace,
                                        dep.replicas
                                      )
                                    }
                                    disabled={scaleMutation.isPending}
                                    className="ml-2 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium text-[11px] transition shadow flex items-center gap-1"
                                  >
                                    {scaleMutation.isPending ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      'Apply'
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1 max-w-xs">
                                {dep.images.map((img: string, i: number) => (
                                  <span
                                    key={i}
                                    className="font-mono text-[11px] text-gray-300 bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/60 truncate"
                                    title={img}
                                  >
                                    {img}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() =>
                                    restartMutation.mutate({
                                      name: dep.name,
                                      kind: 'Deployment',
                                      ns: dep.namespace,
                                    })
                                  }
                                  disabled={isRestarting}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 text-[11px] font-medium transition"
                                  title="Rollout Restart Deployment"
                                >
                                  <RotateCcw
                                    size={12}
                                    className={isRestarting ? 'animate-spin text-amber-400' : ''}
                                  />
                                  Restart
                                </button>

                                <button
                                  onClick={() =>
                                    setManifestTarget({
                                      kind: 'Deployment',
                                      name: dep.name,
                                      namespace: dep.namespace,
                                    })
                                  }
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-blue-900/30 text-gray-300 hover:text-blue-300 rounded border border-gray-700 text-[11px] font-medium transition"
                                  title="Inspect YAML Manifest"
                                >
                                  <FileCode size={12} />
                                  YAML
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STATEFULSETS TAB */}
          {activeTab === 'statefulsets' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-800/70 text-gray-400 uppercase font-medium border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Name / Namespace</th>
                      <th className="py-3 px-4">Replicas (Ready/Target)</th>
                      <th className="py-3 px-4">Scaling Stepper</th>
                      <th className="py-3 px-4">Images</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredStatefulSets.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-500">
                          No StatefulSets found in this namespace.
                        </td>
                      </tr>
                    ) : (
                      filteredStatefulSets.map((sts) => {
                        const key = `StatefulSet-${sts.namespace}-${sts.name}`
                        const targetVal = getTargetReplicas(key, sts.replicas)
                        const isModified = targetVal !== sts.replicas
                        const isRestarting = restartingMap[key] || false
                        const isAllReady = sts.ready === sts.replicas && sts.replicas > 0

                        return (
                          <tr key={key} className="hover:bg-gray-800/40 transition">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{sts.name}</div>
                              <div className="text-gray-400 font-mono text-[11px]">
                                {sts.namespace}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                                    isAllReady
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : sts.ready > 0
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  }`}
                                >
                                  {isAllReady ? (
                                    <CheckCircle2 size={12} />
                                  ) : (
                                    <AlertTriangle size={12} />
                                  )}
                                  {sts.ready} / {sts.replicas} Ready
                                </span>
                                <span className="text-gray-500 text-[11px]">
                                  ({sts.current} current, {sts.updated} updated)
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setTargetReplicas(key, targetVal - 1)}
                                  disabled={targetVal <= 0}
                                  className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 disabled:opacity-40 transition"
                                  title="Scale Down"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="w-8 text-center font-mono font-semibold text-white bg-gray-950 px-2 py-0.5 rounded border border-gray-800">
                                  {targetVal}
                                </span>
                                <button
                                  onClick={() => setTargetReplicas(key, targetVal + 1)}
                                  className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition"
                                  title="Scale Up"
                                >
                                  <Plus size={13} />
                                </button>

                                {isModified && (
                                  <button
                                    onClick={() =>
                                      handleApplyScale(
                                        sts.name,
                                        'StatefulSet',
                                        sts.namespace,
                                        sts.replicas
                                      )
                                    }
                                    disabled={scaleMutation.isPending}
                                    className="ml-2 px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium text-[11px] transition shadow flex items-center gap-1"
                                  >
                                    {scaleMutation.isPending ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      'Apply'
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1 max-w-xs">
                                {sts.images.map((img: string, i: number) => (
                                  <span
                                    key={i}
                                    className="font-mono text-[11px] text-gray-300 bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/60 truncate"
                                    title={img}
                                  >
                                    {img}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() =>
                                    restartMutation.mutate({
                                      name: sts.name,
                                      kind: 'StatefulSet',
                                      ns: sts.namespace,
                                    })
                                  }
                                  disabled={isRestarting}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 text-[11px] font-medium transition"
                                  title="Rollout Restart StatefulSet"
                                >
                                  <RotateCcw
                                    size={12}
                                    className={isRestarting ? 'animate-spin text-amber-400' : ''}
                                  />
                                  Restart
                                </button>

                                <button
                                  onClick={() =>
                                    setManifestTarget({
                                      kind: 'StatefulSet',
                                      name: sts.name,
                                      namespace: sts.namespace,
                                    })
                                  }
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-purple-900/30 text-gray-300 hover:text-purple-300 rounded border border-gray-700 text-[11px] font-medium transition"
                                  title="Inspect YAML Manifest"
                                >
                                  <FileCode size={12} />
                                  YAML
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DAEMONSETS TAB */}
          {activeTab === 'daemonsets' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-800/70 text-gray-400 uppercase font-medium border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Name / Namespace</th>
                      <th className="py-3 px-4">Scheduled Status</th>
                      <th className="py-3 px-4">Images</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredDaemonSets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-gray-500">
                          No DaemonSets found in this namespace.
                        </td>
                      </tr>
                    ) : (
                      filteredDaemonSets.map((ds) => {
                        const key = `DaemonSet-${ds.namespace}-${ds.name}`
                        const isRestarting = restartingMap[key] || false
                        const isAllReady = ds.ready === ds.desired && ds.desired > 0

                        return (
                          <tr key={key} className="hover:bg-gray-800/40 transition">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{ds.name}</div>
                              <div className="text-gray-400 font-mono text-[11px]">
                                {ds.namespace}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                                    isAllReady
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  }`}
                                >
                                  {isAllReady ? (
                                    <CheckCircle2 size={12} />
                                  ) : (
                                    <AlertTriangle size={12} />
                                  )}
                                  {ds.ready} / {ds.desired} Ready
                                </span>
                                <span className="text-gray-500 text-[11px]">
                                  ({ds.current} current, {ds.available} available
                                  {ds.misscheduled > 0 ? `, ${ds.misscheduled} misscheduled` : ''})
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1 max-w-xs">
                                {ds.images.map((img: string, i: number) => (
                                  <span
                                    key={i}
                                    className="font-mono text-[11px] text-gray-300 bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/60 truncate"
                                    title={img}
                                  >
                                    {img}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() =>
                                    restartMutation.mutate({
                                      name: ds.name,
                                      kind: 'DaemonSet',
                                      ns: ds.namespace,
                                    })
                                  }
                                  disabled={isRestarting}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 text-[11px] font-medium transition"
                                  title="Rollout Restart DaemonSet"
                                >
                                  <RotateCcw
                                    size={12}
                                    className={isRestarting ? 'animate-spin text-amber-400' : ''}
                                  />
                                  Restart
                                </button>

                                <button
                                  onClick={() =>
                                    setManifestTarget({
                                      kind: 'DaemonSet',
                                      name: ds.name,
                                      namespace: ds.namespace,
                                    })
                                  }
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-emerald-900/30 text-gray-300 hover:text-emerald-300 rounded border border-gray-700 text-[11px] font-medium transition"
                                  title="Inspect YAML Manifest"
                                >
                                  <FileCode size={12} />
                                  YAML
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manifest Modal */}
      {manifestTarget && (
        <ManifestModal
          isOpen={!!manifestTarget}
          onClose={() => setManifestTarget(null)}
          kind={manifestTarget.kind}
          name={manifestTarget.name}
          namespace={manifestTarget.namespace}
        />
      )}
    </div>
  )
}

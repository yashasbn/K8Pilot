import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import {
  Network,
  Globe,
  Search,
  RefreshCw,
  FileCode,
  Loader2,
  Tag,
  ArrowRight,
} from 'lucide-react'
import ManifestModal from '../components/ManifestModal'

type TabType = 'services' | 'ingresses'

interface ServicePort {
  name: string
  port: number
  target_port: string
  protocol: string
  node_port: number | null
}

interface ServiceItem {
  name: string
  namespace: string
  type: string
  cluster_ip: string
  external_ips: string[]
  ports: ServicePort[]
  selector: Record<string, string>
  created_at: string
}

interface IngressPath {
  path: string
  path_type: string
  backend_service: string
  backend_port: string
}

interface IngressRule {
  host: string
  paths: IngressPath[]
}

interface IngressItem {
  name: string
  namespace: string
  class_name: string
  rules: IngressRule[]
  load_balancer: string[]
  created_at: string
}

export default function Networking() {
  const [namespace, setNamespace] = useState('_all')
  const [activeTab, setActiveTab] = useState<TabType>('services')
  const [search, setSearch] = useState('')

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

  // Services query
  const {
    data: servicesData,
    isLoading: servicesLoading,
    refetch: refetchServices,
    isFetching: servicesFetching,
  } = useQuery({
    queryKey: ['services', namespace],
    queryFn: () =>
      axios.get(`/api/cluster/services?namespace=${namespace}`).then((r) => r.data),
    refetchInterval: 10000,
  })

  // Ingresses query
  const {
    data: ingressesData,
    isLoading: ingressesLoading,
    refetch: refetchIngresses,
    isFetching: ingressesFetching,
  } = useQuery({
    queryKey: ['ingresses', namespace],
    queryFn: () =>
      axios.get(`/api/cluster/ingresses?namespace=${namespace}`).then((r) => r.data),
    refetchInterval: 10000,
  })

  const services: ServiceItem[] = servicesData?.services || []
  const ingresses: IngressItem[] = ingressesData?.ingresses || []

  const isFetching = servicesFetching || ingressesFetching
  const handleRefetch = () => {
    refetchServices()
    refetchIngresses()
  }

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const filteredIngresses = ingresses.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'LoadBalancer':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      case 'NodePort':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      case 'ClusterIP':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      case 'ExternalName':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Network className="text-blue-400" size={24} /> Networking
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Inspect Kubernetes Services, Ingress routing rules, target ports, and endpoints
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
              placeholder="Search networking..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg pl-8 pr-3 py-2 outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefetch}
            disabled={isFetching}
            className="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50"
            title="Refresh networking resources"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin text-blue-400' : ''} />
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
        <button
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
            activeTab === 'services'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <Network size={14} />
          Services ({services.length})
        </button>

        <button
          onClick={() => setActiveTab('ingresses')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition ${
            activeTab === 'ingresses'
              ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <Globe size={14} />
          Ingresses ({ingresses.length})
        </button>
      </div>

      {/* Content Area */}
      {servicesLoading || ingressesLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500 gap-3">
          <Loader2 size={28} className="animate-spin text-blue-400" />
          <span className="text-sm">Loading networking resources...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* SERVICES TAB */}
          {activeTab === 'services' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-800/70 text-gray-400 uppercase font-medium border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Name / Namespace</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Cluster IP</th>
                      <th className="py-3 px-4">Ports</th>
                      <th className="py-3 px-4">Selectors</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-500">
                          No Services found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map((svc) => {
                        const selectorEntries = Object.entries(svc.selector || {})

                        return (
                          <tr
                            key={`${svc.namespace}-${svc.name}`}
                            className="hover:bg-gray-800/40 transition"
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-white">{svc.name}</div>
                              <div className="text-gray-400 font-mono text-[11px]">
                                {svc.namespace}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold border ${getTypeBadgeClass(
                                  svc.type
                                )}`}
                              >
                                {svc.type}
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <span className="font-mono text-gray-300 text-[11px]">
                                {svc.cluster_ip || 'None'}
                              </span>
                              {svc.external_ips.length > 0 && (
                                <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                                  Ext: {svc.external_ips.join(', ')}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1">
                                {svc.ports.map((p, i) => (
                                  <span
                                    key={i}
                                    className="font-mono text-[11px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-200"
                                    title={`Target: ${p.target_port}`}
                                  >
                                    {p.port}
                                    {p.node_port ? `:${p.node_port}` : ''}/{p.protocol}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {selectorEntries.length === 0 ? (
                                  <span className="text-gray-500 text-[11px] italic">None</span>
                                ) : (
                                  selectorEntries.map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-800/90 text-gray-400 border border-gray-700/60"
                                    >
                                      <Tag size={10} className="text-gray-500" />
                                      {k}={v}
                                    </span>
                                  ))
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() =>
                                  setManifestTarget({
                                    kind: 'Service',
                                    name: svc.name,
                                    namespace: svc.namespace,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-blue-900/30 text-gray-300 hover:text-blue-300 rounded border border-gray-700 text-[11px] font-medium transition"
                                title="Inspect YAML Manifest"
                              >
                                <FileCode size={12} />
                                YAML
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
          )}

          {/* INGRESSES TAB */}
          {activeTab === 'ingresses' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-800/70 text-gray-400 uppercase font-medium border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Name / Namespace</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4">Hosts & Routing Rules</th>
                      <th className="py-3 px-4">Endpoints</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredIngresses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-gray-500">
                          No Ingress resources found in this namespace.
                        </td>
                      </tr>
                    ) : (
                      filteredIngresses.map((ing) => (
                        <tr
                          key={`${ing.namespace}-${ing.name}`}
                          className="hover:bg-gray-800/40 transition"
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{ing.name}</div>
                            <div className="text-gray-400 font-mono text-[11px]">
                              {ing.namespace}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                              {ing.class_name || 'default'}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <div className="space-y-1.5">
                              {ing.rules.map((r, i) => (
                                <div key={i} className="space-y-1">
                                  <div className="font-mono font-semibold text-blue-300 text-[11px]">
                                    {r.host}
                                  </div>
                                  <div className="pl-2 border-l border-gray-700 space-y-0.5">
                                    {r.paths.map((p, pi) => (
                                      <div
                                        key={pi}
                                        className="flex items-center gap-1.5 font-mono text-[10px] text-gray-400"
                                      >
                                        <span className="text-gray-300">{p.path}</span>
                                        <ArrowRight size={10} className="text-gray-500" />
                                        <span className="text-emerald-400">
                                          {p.backend_service}:{p.backend_port}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {ing.load_balancer.length > 0 ? (
                              <div className="font-mono text-[11px] text-emerald-400">
                                {ing.load_balancer.join(', ')}
                              </div>
                            ) : (
                              <span className="text-gray-500 text-[11px] italic">None</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() =>
                                setManifestTarget({
                                  kind: 'Ingress',
                                  name: ing.name,
                                  namespace: ing.namespace,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-purple-900/30 text-gray-300 hover:text-purple-300 rounded border border-gray-700 text-[11px] font-medium transition"
                              title="Inspect YAML Manifest"
                            >
                              <FileCode size={12} />
                              YAML
                            </button>
                          </td>
                        </tr>
                      ))
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

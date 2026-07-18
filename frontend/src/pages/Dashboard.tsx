import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

export default function Dashboard() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => axios.get('/health').then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => axios.get('/api/cluster/nodes').then(r => r.data),
    refetchInterval: 30000,
  })

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Cluster Dashboard</h2>

      {/* Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatusCard
          title="Platform Status"
          value={health?.status ?? 'loading...'}
          color={health?.status === 'healthy' ? 'green' : 'yellow'}
        />
        <StatusCard title="Prometheus" value={health?.checks?.prometheus ?? '...'} />
        <StatusCard title="Redis" value={health?.checks?.redis ?? '...'} />
        <StatusCard title="Ollama" value={health?.checks?.ollama ?? '...'} />
      </div>

      {/* Nodes */}
      <h3 className="text-lg font-semibold mb-3">Nodes</h3>
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">CPU</th>
              <th className="text-left p-3">Memory</th>
            </tr>
          </thead>
          <tbody>
            {nodes?.nodes?.map((node: any) => (
              <tr key={node.name} className="border-t border-gray-800">
                <td className="p-3 font-mono">{node.name}</td>
                <td className="p-3">
                  <span className="px-2 py-1 rounded bg-green-900 text-green-300 text-xs">
                    {node.status}
                  </span>
                </td>
                <td className="p-3">{node.cpu}</td>
                <td className="p-3">{node.memory}</td>
              </tr>
            )) ?? (
              <tr><td colSpan={4} className="p-3 text-gray-500">Loading...</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusCard({ title, value, color = 'gray' }: { title: string; value: string; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'border-green-500 text-green-400',
    yellow: 'border-yellow-500 text-yellow-400',
    red: 'border-red-500 text-red-400',
    gray: 'border-gray-700 text-gray-300',
  }
  return (
    <div className={`bg-gray-900 border rounded-lg p-4 ${colorMap[color] ?? colorMap.gray}`}>
      <p className="text-xs text-gray-400 uppercase">{title}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  )
}

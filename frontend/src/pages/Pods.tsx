import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useState } from 'react'

export default function Pods() {
  const [namespace, setNamespace] = useState('_all')

  const { data: namespaces } = useQuery({
    queryKey: ['namespaces'],
    queryFn: () => axios.get('/api/cluster/namespaces').then(r => r.data),
  })

  const { data: pods, isLoading } = useQuery({
    queryKey: ['pods', namespace],
    queryFn: () => axios.get(`/api/cluster/pods?namespace=${namespace}`).then(r => r.data),
    refetchInterval: 10000,
  })

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold">Pods</h2>
        <select
          value={namespace}
          onChange={e => setNamespace(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="_all">All Namespaces</option>
          {namespaces?.namespaces?.map((ns: string) => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>
      </div>

      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800">
            <tr>
              <th className="text-left p-3">Pod</th>
              <th className="text-left p-3">Namespace</th>
              <th className="text-left p-3">Phase</th>
              <th className="text-left p-3">Containers</th>
              <th className="text-left p-3">Restarts</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-3 text-gray-500">Loading...</td></tr>
            ) : pods?.pods?.length === 0 ? (
              <tr><td colSpan={5} className="p-3 text-gray-500 text-center">No pods found</td></tr>
            ) : (
              pods?.pods?.map((pod: any) => (
                <tr key={`${pod.namespace}/${pod.name}`} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                  <td className="p-3 font-mono font-medium text-gray-200">{pod.name}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400 font-mono border border-gray-700">{pod.namespace}</span></td>
                  <td className="p-3">
                    <PhaseBadge phase={pod.phase} />
                  </td>
                  <td className="p-3 text-gray-300">{pod.containers.join(', ')}</td>
                  <td className="p-3 text-gray-300">{pod.restarts}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PhaseBadge({ phase }: { phase: string }) {
  const colors: Record<string, string> = {
    Running: 'bg-green-900 text-green-300',
    Pending: 'bg-yellow-900 text-yellow-300',
    Failed: 'bg-red-900 text-red-300',
    Succeeded: 'bg-blue-900 text-blue-300',
  }
  return (
    <span className={`px-2 py-1 rounded text-xs ${colors[phase] ?? 'bg-gray-700 text-gray-300'}`}>
      {phase}
    </span>
  )
}

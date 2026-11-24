import { Outlet, Link, useLocation } from 'react-router-dom'
import { Activity, Box, Layers, Network, MessageSquare, ShieldCheck, AlertOctagon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

export default function Layout() {
  const location = useLocation()

  const { data: incidentStats } = useQuery({
    queryKey: ['incident-stats-badge'],
    queryFn: () => axios.get('/api/incidents/stats').then((r) => r.data),
    refetchInterval: 15000,
  })

  const navItems = [
    { to: '/', label: 'Dashboard', icon: Activity },
    { to: '/pods', label: 'Pods', icon: Box },
    { to: '/workloads', label: 'Workloads', icon: Layers },
    { to: '/networking', label: 'Networking', icon: Network },
    { to: '/incidents', label: 'Incidents', icon: AlertOctagon, badge: incidentStats?.open },
    { to: '/audit', label: 'Audit Trail', icon: ShieldCheck },
    { to: '/ai', label: 'AI Assistant', icon: MessageSquare },
  ]

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-8 px-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              ⎈
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">K8Pilot</h1>
              <span className="text-[10px] text-blue-400 font-mono tracking-wider uppercase">AI DevOps Pilot</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.to
              const hasBadge = typeof item.badge === 'number' && item.badge > 0
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                  }`}
                >
                  <Icon size={17} className={isActive ? 'text-blue-400' : 'text-gray-400'} />
                  <span className="flex-1">{item.label}</span>
                  {hasBadge && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="px-2 py-3 rounded-lg bg-gray-800/40 border border-gray-800 text-[11px] text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gray-300 font-medium">Cluster Active</span>
          </div>
          <p className="text-[10px] text-gray-400 font-mono mt-1">Minikube • metrics-server</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6 bg-gray-950">
        <Outlet />
      </main>
    </div>
  )
}

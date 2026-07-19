import { Outlet, Link } from 'react-router-dom'
import { Activity, Box, MessageSquare } from 'lucide-react'

export default function Layout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4">
        <h1 className="text-xl font-bold text-blue-400 mb-8">⎈ K8Pilot</h1>
        <nav className="space-y-2">
          <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-800 transition">
            <Activity size={18} /> Dashboard
          </Link>
          <Link to="/pods" className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-800 transition">
            <Box size={18} /> Pods
          </Link>
          <Link to="/ai" className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-800 transition">
            <MessageSquare size={18} /> AI Assistant
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

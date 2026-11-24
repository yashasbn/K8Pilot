import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Pods from './pages/Pods'
import Workloads from './pages/Workloads'
import Networking from './pages/Networking'
import AuditLogs from './pages/AuditLogs'
import Incidents from './pages/Incidents'
import AIChat from './pages/AIChat'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pods" element={<Pods />} />
          <Route path="workloads" element={<Workloads />} />
          <Route path="networking" element={<Networking />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="ai" element={<AIChat />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App

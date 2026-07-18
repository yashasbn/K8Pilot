import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Pods from './pages/Pods'
import AIChat from './pages/AIChat'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pods" element={<Pods />} />
          <Route path="ai" element={<AIChat />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App

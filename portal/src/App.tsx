import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Signup from './pages/Signup'
import Payment from './pages/Payment'
import PaymentMethod from './pages/PaymentMethod'
import PaymentCNY from './pages/PaymentCNY'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/payment-method" element={<PaymentMethod />} />
      <Route path="/payment" element={<Payment />} />
      <Route path="/payment-cny" element={<PaymentCNY />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

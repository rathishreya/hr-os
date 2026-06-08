import { createContext, useContext, useEffect, useState } from 'react'
import { api, setAuthToken, clearAuthToken } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('hr_token') : ''
    if (!token) { setReady(true); return } // eslint-disable-line react-hooks/set-state-in-effect
    api.me()
      .then((u) => { if (alive) setUser(u) })
      .catch(() => clearAuthToken())
      .finally(() => { if (alive) setReady(true) })
    // A 401 anywhere drops the session → fall back to the login screen.
    const onUnauth = () => setUser(null)
    window.addEventListener('hr:unauthorized', onUnauth)
    return () => { alive = false; window.removeEventListener('hr:unauthorized', onUnauth) }
  }, [])

  async function login(email, password) {
    const r = await api.login(email, password)
    setAuthToken(r.token)
    setUser(r.user)
    return r
  }

  function logout() {
    clearAuthToken()
    setUser(null)
  }

  const hasRole = (...roles) => {
    const held = new Set((user?.roles || []).map((r) => r.toLowerCase()))
    return held.has('admin') || roles.some((r) => held.has(r.toLowerCase()))
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

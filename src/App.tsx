import { useEffect, useState } from 'react'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Navbar from './components/Navbar'

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
  },
})

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<'home' | 'dashboard'>('home')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return null
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {session ? (
        <>
          <Navbar currentPage={currentPage} onNavigate={setCurrentPage} />
          {currentPage === 'home' && <Home />}
          {currentPage === 'dashboard' && <Dashboard />}
        </>
      ) : (
        <Login />
      )}
    </ThemeProvider>
  )
}

export default App

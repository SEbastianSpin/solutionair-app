import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 0, mr: 4 }}>
          SolutionAir
        </Typography>
        <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
          <Button
            color="inherit"
            onClick={() => navigate('/')}
            sx={{
              borderBottom: location.pathname === '/' ? '2px solid white' : 'none',
              borderRadius: 0
            }}
          >
            Home
          </Button>
          <Button
            color="inherit"
            onClick={() => navigate('/dashboard')}
            sx={{
              borderBottom: location.pathname === '/dashboard' ? '2px solid white' : 'none',
              borderRadius: 0
            }}
          >
            Dashboard
          </Button>
        </Box>
        <Button color="inherit" onClick={handleLogout}>
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  )
}

import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material'
import { supabase } from '../lib/supabase'

interface NavbarProps {
  currentPage: 'home' | 'dashboard'
  onNavigate: (page: 'home' | 'dashboard') => void
}

export default function Navbar({ currentPage, onNavigate }: NavbarProps) {
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
            onClick={() => onNavigate('home')}
            sx={{
              borderBottom: currentPage === 'home' ? '2px solid white' : 'none',
              borderRadius: 0
            }}
          >
            Home
          </Button>
          <Button
            color="inherit"
            onClick={() => onNavigate('dashboard')}
            sx={{
              borderBottom: currentPage === 'dashboard' ? '2px solid white' : 'none',
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

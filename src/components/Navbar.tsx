import { AppBar, Toolbar, Typography, Button, Box, IconButton } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import LogoutIcon from '@mui/icons-material/Logout'
import { supabase } from '../lib/supabase'

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AppBar position="static">
      <Toolbar sx={{ px: { xs: 1, sm: 2 } }}>
        <Typography
          variant="h6"
          sx={{
            flexGrow: 0,
            mr: { xs: 1, sm: 4 },
            fontSize: { xs: '1rem', sm: '1.25rem' },
            cursor: 'pointer',
          }}
          onClick={() => navigate('/')}
        >
          SolutionAir
        </Typography>
        <Box sx={{ flexGrow: 1, display: 'flex', gap: { xs: 0.5, sm: 1 } }}>
          <Button
            color="inherit"
            onClick={() => navigate('/')}
            size="small"
            sx={{
              borderBottom: location.pathname === '/' ? '2px solid white' : 'none',
              borderRadius: 0,
              minWidth: { xs: 'auto', sm: 64 },
              px: { xs: 1, sm: 2 },
            }}
          >
            Home
          </Button>
          <Button
            color="inherit"
            onClick={() => navigate('/dashboard')}
            size="small"
            sx={{
              borderBottom: location.pathname === '/dashboard' ? '2px solid white' : 'none',
              borderRadius: 0,
              minWidth: { xs: 'auto', sm: 64 },
              px: { xs: 1, sm: 2 },
            }}
          >
            Dashboard
          </Button>
        </Box>
        <IconButton
          color="inherit"
          onClick={handleLogout}
          sx={{ display: { xs: 'flex', sm: 'none' } }}
          aria-label="logout"
        >
          <LogoutIcon />
        </IconButton>
        <Button
          color="inherit"
          onClick={handleLogout}
          sx={{ display: { xs: 'none', sm: 'flex' } }}
        >
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  )
}

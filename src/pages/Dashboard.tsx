import { useState } from 'react'
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import HomeIcon from '@mui/icons-material/Home'
import BarChartIcon from '@mui/icons-material/BarChart'
import TableChartIcon from '@mui/icons-material/TableChart'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import AssessmentIcon from '@mui/icons-material/Assessment'
import CloudIcon from '@mui/icons-material/Cloud'
import FlightLandIcon from '@mui/icons-material/FlightLand'
import AnnouncementIcon from '@mui/icons-material/Announcement'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import FlightIcon from '@mui/icons-material/Flight'
import FlightsFunnel from '../components/FlightsFunnel'
import UnprocessedFlights from '../components/UnprocessedFlights'
import CauseCodeMetrics from '../components/CauseCodeMetrics'
import Weather from '../components/Weather'
import AirportSituation from '../components/AirportSituation'
import Notams from '../components/Notams'
import DisruptionCause from '../components/DisruptionCause'

const drawerWidth = 240

const menuItems = [
  { id: 'overview', label: 'Overview', icon: <HomeIcon /> },
  { id: 'unprocessed-flights', label: 'Unprocessed Flights', icon: <FlightIcon /> },
  { id: 'metrics', label: 'Cause Code Metrics', icon: <AssessmentIcon /> },
  { id: 'airport-situation', label: 'Airport Situation', icon: <FlightLandIcon /> },
  { id: 'weather', label: 'Weather', icon: <CloudIcon /> },
  { id: 'notams', label: 'NOTAMs', icon: <AnnouncementIcon /> },
  { id: 'disruption-cause', label: 'Disruption Cause', icon: <ReportProblemIcon /> },
  { id: 'charts', label: 'Charts', icon: <BarChartIcon /> },
  { id: 'tables', label: 'Tables', icon: <TableChartIcon /> },
  { id: 'funnel', label: 'Funnel', icon: <FilterAltIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen)
  }

  const handleMenuItemClick = (id: string) => {
    setActiveSection(id)
    if (isMobile) {
      setDrawerOpen(false)
    }
  }

  const drawerContent = (
    <List>
      {menuItems.map((item) => (
        <ListItem key={item.id} disablePadding>
          <ListItemButton
            selected={activeSection === item.id}
            onClick={() => handleMenuItemClick(item.id)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  )

  return (
    <Box sx={{ display: 'flex' }}>
      {/* Mobile drawer (temporary) */}
      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            top: 64,
            height: 'calc(100% - 64px)',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop drawer (permanent but can be hidden) */}
      <Drawer
        variant="permanent"
        open={drawerOpen}
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerOpen ? drawerWidth : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            top: 64,
            height: 'calc(100% - 64px)',
            transform: drawerOpen ? 'translateX(0)' : `translateX(-${drawerWidth}px)`,
            transition: theme.transitions.create('transform', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          backgroundColor: '#f5f5f5',
          minHeight: 'calc(100vh - 64px)',
          width: '100%',
          transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h5">
            {menuItems.find((item) => item.id === activeSection)?.label}
          </Typography>
        </Box>
        {activeSection === 'overview' && (
          <Box sx={{ display: 'flex', gap: { xs: 1.5, md: 2 }, flexWrap: 'wrap' }}>
            <Paper sx={{ p: { xs: 2, md: 3 }, flex: '1 1 140px', minWidth: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Total Users
              </Typography>
              <Typography variant="h4">--</Typography>
            </Paper>
            <Paper sx={{ p: { xs: 2, md: 3 }, flex: '1 1 140px', minWidth: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Active Sessions
              </Typography>
              <Typography variant="h4">--</Typography>
            </Paper>
            <Paper sx={{ p: { xs: 2, md: 3 }, flex: '1 1 140px', minWidth: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Revenue
              </Typography>
              <Typography variant="h4">--</Typography>
            </Paper>
          </Box>
        )}

        {activeSection === 'unprocessed-flights' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <UnprocessedFlights />
          </Paper>
        )}

        {activeSection === 'metrics' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <CauseCodeMetrics />
          </Paper>
        )}

        {activeSection === 'airport-situation' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <AirportSituation />
          </Paper>
        )}

        {activeSection === 'weather' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Weather />
          </Paper>
        )}

        {activeSection === 'notams' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Notams />
          </Paper>
        )}

        {activeSection === 'disruption-cause' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <DisruptionCause />
          </Paper>
        )}

        {activeSection === 'charts' && (
          <Paper sx={{ p: { xs: 2, md: 3 }, height: 400 }}>
            <Typography color="text.secondary">
              Chart placeholder - Nivo charts will go here
            </Typography>
          </Paper>
        )}

        {activeSection === 'tables' && (
          <Paper sx={{ p: { xs: 2, md: 3 }, height: 400 }}>
            <Typography color="text.secondary">
              Table placeholder - AG Grid will go here
            </Typography>
          </Paper>
        )}

        {activeSection === 'funnel' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <FlightsFunnel />
          </Paper>
        )}

        {activeSection === 'settings' && (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography color="text.secondary">
              Settings placeholder
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  )
}

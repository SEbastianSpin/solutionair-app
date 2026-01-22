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
} from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import BarChartIcon from '@mui/icons-material/BarChart'
import TableChartIcon from '@mui/icons-material/TableChart'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import SettingsIcon from '@mui/icons-material/Settings'
import AssessmentIcon from '@mui/icons-material/Assessment'
import CloudIcon from '@mui/icons-material/Cloud'
import FlightsFunnel from '../components/FlightsFunnel'
import CauseCodeMetrics from '../components/CauseCodeMetrics'
import Weather from '../components/Weather'

const drawerWidth = 240

const menuItems = [
  { id: 'overview', label: 'Overview', icon: <HomeIcon /> },
  { id: 'metrics', label: 'Cause Code Metrics', icon: <AssessmentIcon /> },
  { id: 'weather', label: 'Weather', icon: <CloudIcon /> },
  { id: 'charts', label: 'Charts', icon: <BarChartIcon /> },
  { id: 'tables', label: 'Tables', icon: <TableChartIcon /> },
  { id: 'funnel', label: 'Funnel', icon: <FilterAltIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState('overview')

  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            top: 64,
            height: 'calc(100% - 64px)',
          },
        }}
      >
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.id} disablePadding>
              <ListItemButton
                selected={activeSection === item.id}
                onClick={() => setActiveSection(item.id)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          backgroundColor: '#f5f5f5',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <Typography variant="h5" gutterBottom>
          {menuItems.find((item) => item.id === activeSection)?.label}
        </Typography>

        {activeSection === 'overview' && (
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Paper sx={{ p: 3, flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Total Users
              </Typography>
              <Typography variant="h4">--</Typography>
            </Paper>
            <Paper sx={{ p: 3, flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Active Sessions
              </Typography>
              <Typography variant="h4">--</Typography>
            </Paper>
            <Paper sx={{ p: 3, flex: '1 1 200px' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Revenue
              </Typography>
              <Typography variant="h4">--</Typography>
            </Paper>
          </Box>
        )}

        {activeSection === 'metrics' && (
          <Paper sx={{ p: 3 }}>
            <CauseCodeMetrics />
          </Paper>
        )}

        {activeSection === 'weather' && (
          <Paper sx={{ p: 3 }}>
            <Weather />
          </Paper>
        )}

        {activeSection === 'charts' && (
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography color="text.secondary">
              Chart placeholder - Nivo charts will go here
            </Typography>
          </Paper>
        )}

        {activeSection === 'tables' && (
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography color="text.secondary">
              Table placeholder - AG Grid will go here
            </Typography>
          </Paper>
        )}

        {activeSection === 'funnel' && (
          <Paper sx={{ p: 3 }}>
            <FlightsFunnel />
          </Paper>
        )}

        {activeSection === 'settings' && (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">
              Settings placeholder
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  )
}

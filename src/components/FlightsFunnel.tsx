import { useEffect, useState } from 'react'
import { ResponsiveFunnel } from '@nivo/funnel'
import {
  Box,
  CircularProgress,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { getFunnelSummary, getFunnelDataForPeriod } from '../services/funnelService'
import type { FunnelRow, FunnelData, Period } from '../services/funnelService'

const periodLabels: Record<Period, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  last_3_months: 'Last 3 Months',
  this_year: 'This Year',
  all_time: 'All Time',
}

export default function FlightsFunnel() {
  const [rows, setRows] = useState<FunnelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('this_month')

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getFunnelSummary()
        setRows(data)
      } catch (err) {
        setError('Failed to load funnel data')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    )
  }

  const data: FunnelData = getFunnelDataForPeriod(rows, period)

  // Calculate conversion percentages
  const disruptedRate = data.flights > 0
    ? ((data.disruptedFlights / data.flights) * 100).toFixed(1)
    : '0.0'
  const campaignRate = data.disruptedFlights > 0
    ? ((data.campaigns / data.disruptedFlights) * 100).toFixed(1)
    : '0.0'

  const funnelData = [
    {
      id: 'flights',
      value: data.flights,
      label: 'Flights',
    },
    {
      id: 'disrupted',
      value: data.disruptedFlights,
      label: 'Disrupted Flights',
    },
    {
      id: 'campaigns',
      value: data.campaigns,
      label: 'Campaigns',
    },
  ]

  const handlePeriodChange = (_: React.MouseEvent<HTMLElement>, newPeriod: Period | null) => {
    if (newPeriod) {
      setPeriod(newPeriod)
    }
  }

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
        <ToggleButtonGroup
          value={period}
          exclusive
          onChange={handlePeriodChange}
          size="small"
        >
          {Object.entries(periodLabels).map(([key, label]) => (
            <ToggleButton key={key} value={key}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4">{data.flights}</Typography>
          <Typography variant="body2" color="text.secondary">Flights</Typography>
        </Box>
        <Box sx={{ textAlign: 'center', px: 2 }}>
          <Typography variant="h6" color="primary">{disruptedRate}%</Typography>
          <Typography variant="caption" color="text.secondary">→</Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4">{data.disruptedFlights}</Typography>
          <Typography variant="body2" color="text.secondary">Disrupted Flights</Typography>
        </Box>
        <Box sx={{ textAlign: 'center', px: 2 }}>
          <Typography variant="h6" color="primary">{campaignRate}%</Typography>
          <Typography variant="caption" color="text.secondary">→</Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4">{data.campaigns}</Typography>
          <Typography variant="body2" color="text.secondary">Campaigns</Typography>
        </Box>
      </Box>

      <Box sx={{ height: 350 }}>
        <ResponsiveFunnel
          data={funnelData}
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
          valueFormat=">-.0f"
          colors={{ scheme: 'spectral' }}
          borderColor={{ from: 'color', modifiers: [['darker', 0.8]] }}
          labelColor={{ from: 'color', modifiers: [['darker', 2.5]] }}
          borderWidth={20}

          beforeSeparatorLength={100}
          beforeSeparatorOffset={20}
          afterSeparatorLength={100}
          afterSeparatorOffset={20}
          currentPartSizeExtension={10}
          currentBorderWidth={40}
          motionConfig="gentle"
        />
      </Box>
    </Box>
  )
}

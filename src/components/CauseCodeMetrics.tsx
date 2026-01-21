import { useEffect, useState, useMemo } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'

import {
  Box,
  CircularProgress,
  Typography,
  Paper,
  Tabs,
  Tab,
} from '@mui/material'
import { getCauseCodeData } from '../services/causeCodeMetricsService'
import type { CauseCodeData, UnknownFlight, ResolvedFlight } from '../services/causeCodeMetricsService'

ModuleRegistry.registerModules([AllCommunityModule])

function formatDateTime(value: string | null): string {
  if (!value) return '--'
  return new Date(value).toLocaleString()
}

function formatResolutionTime(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} hrs`
  }
  const days = hours / 24
  return `${days.toFixed(1)} days`
}

export default function CauseCodeMetrics() {
  const [data, setData] = useState<CauseCodeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const result = await getCauseCodeData()
        setData(result)
        setError(null)
      } catch (err) {
        setError('Failed to load cause code metrics')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const unknownColumnDefs: ColDef<UnknownFlight>[] = useMemo(() => [
    {
      field: 'flight_number',
      headerName: 'Flight',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'd_airport_iata',
      headerName: 'From',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'a_airport_iata',
      headerName: 'To',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'd_scheduled_time_utc',
      headerName: 'Scheduled (UTC)',
      filter: true,
      sortable: true,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
      width: 180,
    },
    {
      field: 'created_at',
      headerName: 'Created At',
      filter: true,
      sortable: true,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
      width: 180,
    },
  ], [])

  const resolvedColumnDefs: ColDef<ResolvedFlight>[] = useMemo(() => [
    {
      field: 'flight_number',
      headerName: 'Flight',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'd_airport_iata',
      headerName: 'From',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'a_airport_iata',
      headerName: 'To',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'new_cause_code',
      headerName: 'Resolved Cause',
      filter: true,
      sortable: true,
      width: 150,
    },
    {
      field: 'created_at',
      headerName: 'Created At',
      filter: true,
      sortable: true,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
      width: 180,
    },
    {
      field: 'resolved_at',
      headerName: 'Resolved At',
      filter: true,
      sortable: true,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
      width: 180,
    },
    {
      field: 'resolution_time_hours',
      headerName: 'Resolution Time',
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params: ValueFormatterParams) => formatResolutionTime(params.value),
      width: 140,
    },
  ], [])

  const defaultColDef = useMemo(() => ({
    resizable: true,
  }), [])

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

  if (!data) {
    return null
  }

  // Calculate stats
  const avgResolutionTime = data.resolvedFlights.length > 0
    ? data.resolvedFlights.reduce((sum, f) => sum + f.resolution_time_hours, 0) / data.resolvedFlights.length
    : 0

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center' }}>
          <Typography variant="h4" color="warning.main">
            {data.unknownFlights.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pending Investigation
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center' }}>
          <Typography variant="h4" color="success.main">
            {data.resolvedFlights.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Resolved (Last 3 Months)
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center' }}>
          <Typography variant="h4" color="primary.main">
            {formatResolutionTime(avgResolutionTime)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Avg Resolution Time
          </Typography>
        </Paper>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label={`Pending (${data.unknownFlights.length})`} />
          <Tab label={`Resolved (${data.resolvedFlights.length})`} />
        </Tabs>
      </Box>

      {activeTab === 0 && (
        <Box sx={{ height: 400, width: '100%' }}>
          <AgGridReact<UnknownFlight>
            rowData={data.unknownFlights}
            columnDefs={unknownColumnDefs}
            defaultColDef={defaultColDef}
            pagination={true}
            paginationPageSize={20}
            theme={themeQuartz}
          />
        </Box>
      )}

      {activeTab === 1 && (
        <Box sx={{ height: 400, width: '100%' }}>
          <AgGridReact<ResolvedFlight>
            rowData={data.resolvedFlights}
            columnDefs={resolvedColumnDefs}
            defaultColDef={defaultColDef}
            pagination={true}
            paginationPageSize={20}
            theme={themeQuartz}
          />
        </Box>
      )}
    </Box>
  )
}

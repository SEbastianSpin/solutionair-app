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

function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} hrs`
  }
  const days = hours / 24
  return `${days.toFixed(1)} days`
}

function getWaitingTimeHours(createdAt: string): number {
  const created = new Date(createdAt)
  const now = new Date()
  return (now.getTime() - created.getTime()) / (1000 * 60 * 60)
}

function isCreatedOnTime(createdAt: string, scheduledUtc: string): boolean {
  const created = new Date(createdAt)
  const scheduled = new Date(scheduledUtc)
  const fifteenMinBefore = new Date(scheduled.getTime() - 15 * 60 * 1000)
  return created <= fifteenMinBefore
}

function isResolvedOnTime(resolvedAt: string, scheduledUtc: string): boolean {
  const resolved = new Date(resolvedAt)
  const scheduled = new Date(scheduledUtc)
  return resolved < scheduled
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
    {
      headerName: 'Created On Time',
      filter: true,
      sortable: true,
      valueGetter: (params) => params.data ? isCreatedOnTime(params.data.created_at, params.data.d_scheduled_time_utc) : false,
      valueFormatter: (params: ValueFormatterParams) => params.value ? 'Yes' : 'No',
      cellStyle: (params) => ({
        color: params.value ? '#2e7d32' : '#d32f2f',
        fontWeight: 500,
      }),
      width: 130,
    },
    {
      headerName: 'Waiting Time',
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueGetter: (params) => params.data ? getWaitingTimeHours(params.data.created_at) : 0,
      valueFormatter: (params: ValueFormatterParams) => formatDuration(params.value),
      width: 130,
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
      field: 'd_scheduled_time_utc',
      headerName: 'Scheduled (UTC)',
      filter: true,
      sortable: true,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
      width: 180,
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
      headerName: 'Created On Time',
      filter: true,
      sortable: true,
      valueGetter: (params) => params.data ? isCreatedOnTime(params.data.created_at, params.data.d_scheduled_time_utc) : false,
      valueFormatter: (params: ValueFormatterParams) => params.value ? 'Yes' : 'No',
      cellStyle: (params) => ({
        color: params.value ? '#2e7d32' : '#d32f2f',
        fontWeight: 500,
      }),
      width: 130,
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
      headerName: 'Resolved On Time',
      filter: true,
      sortable: true,
      valueGetter: (params) => params.data ? isResolvedOnTime(params.data.resolved_at, params.data.d_scheduled_time_utc) : false,
      valueFormatter: (params: ValueFormatterParams) => params.value ? 'Yes' : 'No',
      cellStyle: (params) => ({
        color: params.value ? '#2e7d32' : '#d32f2f',
        fontWeight: 500,
      }),
      width: 140,
    },
    {
      field: 'resolution_time_hours',
      headerName: 'Resolution Time',
      filter: 'agNumberColumnFilter',
      sortable: true,
      valueFormatter: (params: ValueFormatterParams) => formatDuration(params.value),
      width: 130,
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

  // Total flights = pending + resolved
  const totalFlights = data.unknownFlights.length + data.resolvedFlights.length

  // Created On Time: includes both pending and resolved
  const createdOnTimeCountPending = data.unknownFlights.filter(f =>
    isCreatedOnTime(f.created_at, f.d_scheduled_time_utc)
  ).length
  const createdOnTimeCountResolved = data.resolvedFlights.filter(f =>
    isCreatedOnTime(f.created_at, f.d_scheduled_time_utc)
  ).length
  const createdOnTimeCount = createdOnTimeCountPending + createdOnTimeCountResolved
  const createdOnTimePercent = totalFlights > 0
    ? ((createdOnTimeCount / totalFlights) * 100).toFixed(1)
    : '0.0'

  // Resolved On Time: resolved before scheduled, pending count as NOT on time
  const resolvedOnTimeCount = data.resolvedFlights.filter(f =>
    isResolvedOnTime(f.resolved_at, f.d_scheduled_time_utc)
  ).length
  const resolvedOnTimePercent = totalFlights > 0
    ? ((resolvedOnTimeCount / totalFlights) * 100).toFixed(1)
    : '0.0'

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
            {formatDuration(avgResolutionTime)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Avg Resolution Time
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center' }}>
          <Typography variant="h4" color={Number(createdOnTimePercent) >= 80 ? 'success.main' : 'warning.main'}>
            {createdOnTimePercent}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Created On Time
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({createdOnTimeCount}/{totalFlights})
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, flex: '1 1 150px', textAlign: 'center' }}>
          <Typography variant="h4" color={Number(resolvedOnTimePercent) >= 80 ? 'success.main' : 'warning.main'}>
            {resolvedOnTimePercent}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Resolved On Time
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({resolvedOnTimeCount}/{totalFlights})
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

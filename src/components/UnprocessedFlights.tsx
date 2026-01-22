import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Typography,
} from '@mui/material'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams, SelectionChangedEvent } from 'ag-grid-community'
import { supabase } from '../lib/supabase'

ModuleRegistry.registerModules([AllCommunityModule])

interface Flight {
  id: number
  uploaded_at: string
  flight_number: string
  airline_name: string | null
  airline_iata: string | null
  flight_type: string
  airport_iata: string
  target_airport_iata: string
  scheduled_time_utc: string
  scheduled_time_local: string
  actual_time_utc: string | null
  delay_minutes: number | null
  flight_status: string | null
  aircraft_model: string | null
  aircraft_registration: string | null
  terminal: string | null
  source: string | null
  processed_for_campaign: boolean
}

interface SnackbarState {
  open: boolean
  message: string
  severity: 'success' | 'error' | 'info'
}

export default function UnprocessedFlights() {
  const [flights, setFlights] = useState<Flight[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFlights, setSelectedFlights] = useState<Flight[]>([])
  const [processing, setProcessing] = useState(false)
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' })
  const gridRef = useRef<AgGridReact<Flight>>(null)

  const fetchFlights = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('flights')
        .select('*')
        .eq('processed_for_campaign', false)
        .or('flight_status.eq.Canceled,delay_minutes.gt.179,flight_status.eq.Diverted')
        .order('scheduled_time_utc', { ascending: false })

      if (error) {
        console.error('Error fetching flights:', error)
        setFlights([])
      } else {
        setFlights(data || [])
      }
    } catch (err) {
      console.error('Error fetching flights:', err)
      setFlights([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFlights()
  }, [fetchFlights])

  const onSelectionChanged = useCallback((event: SelectionChangedEvent<Flight>) => {
    const selected = event.api.getSelectedRows()
    setSelectedFlights(selected)
  }, [])

  const handleProcessFlights = async () => {
    if (selectedFlights.length === 0) return

    setProcessing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setSnackbar({ open: true, message: 'No authenticated session', severity: 'error' })
        return
      }

      const flightIds = selectedFlights.map(f => f.id)

      // Calculate max uploaded_at from selected flights
      const maxUploadedAt = selectedFlights.reduce((max, flight) => {
        const uploadedAt = new Date(flight.uploaded_at).getTime()
        return uploadedAt > max ? uploadedAt : max
      }, 0)

      const { data: result, error } = await supabase.functions.invoke('process_flights', {
        body: {
          flight_ids: flightIds,
          max_uploaded_at: new Date(maxUploadedAt).toISOString(),
        },
      })

      if (error) {
        setSnackbar({ open: true, message: `Error: ${error.message}`, severity: 'error' })
        return
      }

      // Show success message with details
      const { processed, skipped, api_called, errors } = result
      if (errors && errors.length > 0) {
        setSnackbar({
          open: true,
          message: `Processed ${processed} flights with ${errors.length} error(s)`,
          severity: 'error'
        })
      } else {
        setSnackbar({
          open: true,
          message: `Success: ${processed} processed, ${skipped} skipped, ${api_called} API call(s)`,
          severity: 'success'
        })
      }

      // Refresh the grid after processing
      await fetchFlights()
      setSelectedFlights([])
    } catch (err) {
      setSnackbar({ open: true, message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`, severity: 'error' })
    } finally {
      setProcessing(false)
    }
  }

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }))
  }

  const columnDefs: ColDef<Flight>[] = useMemo(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      pinned: 'left',
      suppressHeaderMenuButton: true,
    },
    {
      field: 'flight_number',
      headerName: 'Flight',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'airline_iata',
      headerName: 'Airline',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'airport_iata',
      headerName: 'Origin',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'target_airport_iata',
      headerName: 'Dest',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'scheduled_time_utc',
      headerName: 'Scheduled (UTC)',
      filter: true,
      sortable: true,
      width: 170,
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.value) return '--'
        return new Date(params.value).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        })
      },
    },
    {
      field: 'delay_minutes',
      headerName: 'Delay (min)',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 110,
      valueFormatter: (params: ValueFormatterParams) => {
        if (params.value === null || params.value === undefined) return '--'
        return `${params.value} min`
      },
    },
    {
      field: 'flight_status',
      headerName: 'Status',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'flight_type',
      headerName: 'Type',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'aircraft_model',
      headerName: 'Aircraft',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'terminal',
      headerName: 'Terminal',
      filter: true,
      sortable: true,
      width: 90,
    },
    {
      field: 'source',
      headerName: 'Source',
      filter: true,
      sortable: true,
      width: 100,
    },
  ], [])

  const defaultColDef = useMemo(() => ({
    resizable: true,
  }), [])

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Unprocessed Flights ({flights.length})
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {selectedFlights.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {selectedFlights.length} selected
            </Typography>
          )}
          <Button
            variant="contained"
            color="primary"
            onClick={handleProcessFlights}
            disabled={selectedFlights.length === 0 || processing}
          >
            {processing ? 'Processing...' : `Process Selected (${selectedFlights.length})`}
          </Button>
          <Button
            variant="outlined"
            onClick={fetchFlights}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : flights.length > 0 ? (
        <Box sx={{ height: 600, width: '100%' }}>
          <AgGridReact<Flight>
            ref={gridRef}
            rowData={flights}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onSelectionChanged={onSelectionChanged}
            pagination={true}
            paginationPageSize={25}
            paginationPageSizeSelector={[25, 50, 100]}
            theme={themeQuartz}
            rowHeight={40}
          />
        </Box>
      ) : (
        <Typography color="text.secondary">
          No unprocessed flights found
        </Typography>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

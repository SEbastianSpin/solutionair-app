import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Alert,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import CloseIcon from '@mui/icons-material/Close'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import dayjs, { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams, ValueGetterParams, CellClassParams, RowClickedEvent, CellValueChangedEvent } from 'ag-grid-community'
import { supabase } from '../lib/supabase'
import Weather from './Weather'
import AirportSituation from './AirportSituation'
import Notams from './Notams'

dayjs.extend(utc)
ModuleRegistry.registerModules([AllCommunityModule])

interface DisruptedFlight {
  flight_number: string
  call_sign: string | null
  flight_status: string | null
  code_share_status: string | null
  last_updated_api_utc: string | null
  data_source: string | null
  airline_icao: string | null
  airline_iata: string | null
  aircraft_reg: string | null
  aircraft_mode_s: string | null
  aircraft_model: string | null
  d_terminal: string | null
  d_gate: string | null
  d_airport_icao: string | null
  d_airport_iata: string | null
  d_country_code: string | null
  d_scheduled_time_utc: string
  d_scheduled_time_local: string | null
  d_runway_time_utc: string | null
  d_runway: string | null
  d_revised_time_local: string | null
  d_actual_time_utc: string | null
  a_terminal: string | null
  a_gate: string | null
  a_airport_icao: string | null
  a_airport_iata: string | null
  a_airport_country_code: string | null
  a_scheduled_time_utc: string | null
  a_scheduled_time_local: string | null
  a_runway: string | null
  a_runway_time_utc: string | null
  a_revised_time_local: string | null
  a_predicted_time_utc: string | null
  a_predicted_time_local: string | null
  a_actual_time_utc: string | null
  created_at: string | null
  num_seats: number | null
  plane_age_years: number | null
  compensation: number | null
  cause_code: string | null
  updated_at: string | null
  rc_details: string | null
}

interface CauseCode {
  cause_code: string
  cause_text: string
  cause_category: string
}

interface PreviousFlight {
  flight_number: string
  d_airport_iata: string
  a_airport_iata: string
  d_scheduled_time_utc: string
  a_scheduled_time_utc: string | null
  d_actual_time_utc: string | null
  a_actual_time_utc: string | null
  flight_status: string | null
  delay_minutes: number | null
}

export default function DisruptionCause() {
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(dayjs())
  const [causeCode, setCauseCode] = useState<string>('')
  const [causeCodes, setCauseCodes] = useState<CauseCode[]>([])
  const [flightsData, setFlightsData] = useState<DisruptedFlight[]>([])
  const [loading, setLoading] = useState(false)
  const [causeCodesLoading, setCauseCodesLoading] = useState(true)
  const [selectedFlight, setSelectedFlight] = useState<DisruptedFlight | null>(null)
  const [detailTab, setDetailTab] = useState(0)
  const [previousFlight, setPreviousFlight] = useState<PreviousFlight | null>(null)
  const [previousFlightLoading, setPreviousFlightLoading] = useState(false)
  const [modifiedRows, setModifiedRows] = useState<Map<string, Partial<DisruptedFlight>>>(new Map())
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // Fetch available cause codes on mount
  useEffect(() => {
    async function fetchCauseCodes() {
      try {
        const { data, error } = await supabase
          .from('disruption_causes')
          .select('cause_code, cause_text, cause_category')
          .order('cause_code')

        if (error) {
          console.error('Error fetching cause codes:', error)
        } else {
          setCauseCodes(data || [])
        }
      } catch (err) {
        console.error('Error fetching cause codes:', err)
      } finally {
        setCauseCodesLoading(false)
      }
    }

    fetchCauseCodes()
  }, [])

  // Fetch disrupted flights based on filters
  useEffect(() => {
    async function fetchDisruptedFlights() {
      if (!selectedDate) {
        setFlightsData([])
        return
      }

      setLoading(true)
      try {
        const startOfDay = selectedDate.utc().startOf('day').toISOString()
        const endOfDay = selectedDate.utc().endOf('day').toISOString()

        let query = supabase
          .from('disrupted_flights')
          .select('*')
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay)
          .order('created_at', { ascending: false })

        if (causeCode) {
          query = query.eq('cause_code', causeCode)
        }

        const { data, error } = await query

        if (error) {
          console.error('Error fetching disrupted flights:', error)
          setFlightsData([])
        } else {
          setFlightsData(data || [])
        }
      } catch (err) {
        console.error('Error fetching disrupted flights:', err)
        setFlightsData([])
      } finally {
        setLoading(false)
      }
    }

    fetchDisruptedFlights()
  }, [selectedDate, causeCode])

  // Fetch previous flight when a flight is selected
  useEffect(() => {
    async function fetchPreviousFlight() {
      if (!selectedFlight) {
        setPreviousFlight(null)
        return
      }

      // Need at least airline IATA and airport IATA to fetch previous flight
      if (!selectedFlight.airline_iata || !selectedFlight.d_airport_iata) {
        setPreviousFlight(null)
        return
      }

      setPreviousFlightLoading(true)
      try {
        const { data, error } = await supabase.rpc('get_previous_flight', {
          p_aircraft_reg: selectedFlight.aircraft_reg || null,
          p_scheduled_time_utc: selectedFlight.d_scheduled_time_utc,
          p_airline_iata: selectedFlight.airline_iata,
          p_airport_iata: selectedFlight.d_airport_iata,
        })

        if (error) {
          console.error('Error fetching previous flight:', error)
          setPreviousFlight(null)
        } else {
          setPreviousFlight(data)
        }
      } catch (err) {
        console.error('Error fetching previous flight:', err)
        setPreviousFlight(null)
      } finally {
        setPreviousFlightLoading(false)
      }
    }

    fetchPreviousFlight()
  }, [selectedFlight])

  const formatDateTime = (params: ValueFormatterParams) => {
    if (!params.value) return '--'
    return dayjs(params.value).utc().format('YYYY-MM-DD HH:mm')
  }

  const calculateDepartureDelay = (params: ValueGetterParams<DisruptedFlight>) => {
    const data = params.data
    if (!data?.d_actual_time_utc || !data?.d_scheduled_time_utc) return null
    const actual = dayjs(data.d_actual_time_utc)
    const scheduled = dayjs(data.d_scheduled_time_utc)
    return actual.diff(scheduled, 'minute')
  }

  const calculateArrivalDelay = (params: ValueGetterParams<DisruptedFlight>) => {
    const data = params.data
    if (!data?.a_actual_time_utc || !data?.a_scheduled_time_utc) return null
    const actual = dayjs(data.a_actual_time_utc)
    const scheduled = dayjs(data.a_scheduled_time_utc)
    return actual.diff(scheduled, 'minute')
  }

  const formatDelay = (params: ValueFormatterParams) => {
    if (params.value === null || params.value === undefined) return '--'
    const minutes = params.value as number
    const hours = Math.floor(Math.abs(minutes) / 60)
    const mins = Math.abs(minutes) % 60
    const sign = minutes < 0 ? '-' : '+'
    if (hours > 0) {
      return `${sign}${hours}h ${mins}m`
    }
    return `${sign}${mins}m`
  }

  const getDelayCellClass = (params: CellClassParams) => {
    const value = params.value as number | null
    if (value === null || value === undefined) return ''
    if (value >= 180) return 'delay-severe'
    if (value >= 60) return 'delay-warning'
    if (value < 0) return 'delay-early'
    return ''
  }

  const columnDefs: ColDef<DisruptedFlight>[] = useMemo(() => [
    {
      field: 'flight_number',
      headerName: 'Flight #',
      filter: true,
      sortable: true,
      width: 100,
      pinned: 'left',
    },
    {
      field: 'cause_code',
      headerName: 'Cause Code',
      filter: true,
      sortable: true,
      width: 150,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['', ...causeCodes.map((cc) => cc.cause_code)],
      },
      cellStyle: { cursor: 'pointer' },
    },
    {
      field: 'flight_status',
      headerName: 'Status',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      headerName: 'Dep Delay',
      colId: 'departure_delay',
      valueGetter: calculateDepartureDelay,
      valueFormatter: formatDelay,
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 100,
      cellClass: getDelayCellClass,
    },
    {
      headerName: 'Arr Delay',
      colId: 'arrival_delay',
      valueGetter: calculateArrivalDelay,
      valueFormatter: formatDelay,
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 100,
      cellClass: getDelayCellClass,
    },
    {
      field: 'compensation',
      headerName: 'Comp (€)',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 100,
      valueFormatter: (params: ValueFormatterParams) =>
        params.value !== null ? `€${params.value}` : '--',
    },
    {
      field: 'airline_iata',
      headerName: 'Airline',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'd_airport_iata',
      headerName: 'From',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'a_airport_iata',
      headerName: 'To',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'd_scheduled_time_utc',
      headerName: 'Dep Sched (UTC)',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'd_actual_time_utc',
      headerName: 'Dep Actual (UTC)',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'a_scheduled_time_utc',
      headerName: 'Arr Sched (UTC)',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'a_actual_time_utc',
      headerName: 'Arr Actual (UTC)',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'aircraft_model',
      headerName: 'Aircraft',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'aircraft_reg',
      headerName: 'Reg',
      filter: true,
      sortable: true,
      width: 90,
    },
    {
      field: 'num_seats',
      headerName: 'Seats',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 70,
    },
    {
      field: 'd_terminal',
      headerName: 'Term',
      filter: true,
      sortable: true,
      width: 70,
    },
    {
      field: 'd_gate',
      headerName: 'Gate',
      filter: true,
      sortable: true,
      width: 70,
    },
    {
      field: 'rc_details',
      headerName: 'RC Details',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 200,
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      cellStyle: { cursor: 'pointer' },
    },
    {
      field: 'data_source',
      headerName: 'Source',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'created_at',
      headerName: 'Created At',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
  ], [causeCodes])

  const defaultColDef = useMemo(() => ({
    resizable: true,
  }), [])

  const handleRowClicked = (event: RowClickedEvent<DisruptedFlight>) => {
    if (event.data) {
      setSelectedFlight(event.data)
      setDetailTab(0)
    }
  }

  const getRowKey = (flight: DisruptedFlight) => `${flight.flight_number}|${flight.d_scheduled_time_utc}`

  const handleCellValueChanged = (event: CellValueChangedEvent<DisruptedFlight>) => {
    if (!event.data) return
    const key = getRowKey(event.data)
    const field = event.colDef.field as keyof DisruptedFlight

    setModifiedRows((prev) => {
      const newMap = new Map(prev)
      const existing = newMap.get(key) || {
        flight_number: event.data!.flight_number,
        d_scheduled_time_utc: event.data!.d_scheduled_time_utc,
      }
      newMap.set(key, { ...existing, [field]: event.newValue })
      return newMap
    })
  }

  const handleSaveChanges = async () => {
    if (modifiedRows.size === 0) return

    setSaving(true)
    try {
      const updates = Array.from(modifiedRows.values())
      let successCount = 0
      let failCount = 0
      const failedFlights: string[] = []

      for (const update of updates) {
        const { flight_number, d_scheduled_time_utc, ...fieldsToUpdate } = update

        // Use .select() to get updated rows count
        const { data, error } = await supabase
          .from('disrupted_flights')
          .update(fieldsToUpdate)
          .eq('flight_number', flight_number)
          .eq('d_scheduled_time_utc', d_scheduled_time_utc)
          .select()

        if (error) {
          console.error('Error updating flight:', error)
          failCount++
          failedFlights.push(flight_number as string)
        } else if (!data || data.length === 0) {
          // RLS likely blocked the update - no rows returned
          console.error('Update failed (possibly RLS blocked):', flight_number)
          failCount++
          failedFlights.push(flight_number as string)
        } else {
          successCount++
        }
      }

      if (failCount > 0 && successCount === 0) {
        setSnackbar({
          open: true,
          message: `Update failed for all ${failCount} flight(s). Check RLS policies or permissions.`,
          severity: 'error'
        })
      } else if (failCount > 0) {
        setSnackbar({
          open: true,
          message: `Saved ${successCount} change(s), but ${failCount} failed: ${failedFlights.join(', ')}`,
          severity: 'error'
        })
        // Clear only successful ones from modified rows
        setModifiedRows((prev) => {
          const newMap = new Map(prev)
          for (const [key, value] of newMap) {
            if (!failedFlights.includes(value.flight_number as string)) {
              newMap.delete(key)
            }
          }
          return newMap
        })
      } else {
        setSnackbar({ open: true, message: `Successfully saved ${successCount} change(s)`, severity: 'success' })
        setModifiedRows(new Map())
      }

      // Refresh data from server to get actual state
      if (successCount > 0) {
        const startOfDay = selectedDate!.utc().startOf('day').toISOString()
        const endOfDay = selectedDate!.utc().endOf('day').toISOString()

        let query = supabase
          .from('disrupted_flights')
          .select('*')
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay)
          .order('created_at', { ascending: false })

        if (causeCode) {
          query = query.eq('cause_code', causeCode)
        }

        const { data } = await query
        if (data) {
          setFlightsData(data)
        }
      }
    } catch (err) {
      console.error('Error saving changes:', err)
      setSnackbar({ open: true, message: 'Failed to save changes', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const getFlightDate = (flight: DisruptedFlight): string => {
    return dayjs(flight.d_scheduled_time_utc).format('YYYY-MM-DD')
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 3 }}>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Filter by Created Date
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DateCalendar
              value={selectedDate}
              onChange={(newValue) => setSelectedDate(newValue)}
            />
          </LocalizationProvider>
        </Box>
        <Box sx={{ minWidth: 300 }}>
          <FormControl fullWidth>
            <InputLabel id="cause-code-label">Cause Code</InputLabel>
            <Select
              labelId="cause-code-label"
              value={causeCode}
              label="Cause Code"
              onChange={(e) => setCauseCode(e.target.value)}
              disabled={causeCodesLoading}
            >
              <MenuItem value="">
                <em>All Cause Codes</em>
              </MenuItem>
              {causeCodes.map((cc) => (
                <MenuItem key={cc.cause_code} value={cc.cause_code}>
                  {cc.cause_code} - {cc.cause_text}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {causeCode && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Category: {causeCodes.find(cc => cc.cause_code === causeCode)?.cause_category || 'N/A'}
            </Typography>
          )}
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : flightsData.length > 0 ? (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Found {flightsData.length} disrupted flight(s) for {selectedDate?.format('YYYY-MM-DD')}
              {causeCode && ` with cause code "${causeCode}"`}
            </Typography>
            {modifiedRows.size > 0 && (
              <Button
                variant="contained"
                color="primary"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                onClick={handleSaveChanges}
                disabled={saving}
              >
                Save {modifiedRows.size} Change{modifiedRows.size > 1 ? 's' : ''}
              </Button>
            )}
          </Box>
          <Box sx={{
            height: 500,
            width: '100%',
            '& .delay-warning': {
              backgroundColor: '#fff3cd !important',
              color: '#856404',
              fontWeight: 600,
            },
            '& .delay-severe': {
              backgroundColor: '#f8d7da !important',
              color: '#721c24',
              fontWeight: 600,
            },
            '& .delay-early': {
              backgroundColor: '#d4edda !important',
              color: '#155724',
              fontWeight: 600,
            },
          }}>
            <AgGridReact<DisruptedFlight>
              rowData={flightsData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={20}
              theme={themeQuartz}
              rowHeight={40}
              onRowClicked={handleRowClicked}
              onCellValueChanged={handleCellValueChanged}
              rowSelection="single"
              stopEditingWhenCellsLoseFocus={true}
            />
          </Box>

          {selectedFlight && (
            <Box sx={{ mt: 4 }}>
              <Divider sx={{ mb: 2 }} />
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Flight Details: {selectedFlight.flight_number} ({selectedFlight.d_airport_iata} → {selectedFlight.a_airport_iata})
                  </Typography>
                  <IconButton onClick={() => setSelectedFlight(null)} size="small">
                    <CloseIcon />
                  </IconButton>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Scheduled: {dayjs(selectedFlight.d_scheduled_time_utc).utc().format('YYYY-MM-DD HH:mm')} UTC |
                  Cause: {selectedFlight.cause_code || 'Unknown'} |
                  Status: {selectedFlight.flight_status || 'N/A'}
                </Typography>

                <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={{ mb: 2 }}>
                  <Tab label="Previous Flight" />
                  <Tab label="Weather" />
                  <Tab label={`Airport Situation (${selectedFlight.d_airport_iata})`} />
                  <Tab label="NOTAMs" />
                </Tabs>

                {detailTab === 0 && (
                  <Box>
                    {previousFlightLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                      </Box>
                    ) : previousFlight ? (
                      <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                          Previous Flight: {previousFlight.flight_number}
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Route</Typography>
                            <Typography variant="body1">
                              {previousFlight.d_airport_iata} → {previousFlight.a_airport_iata}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Dep Scheduled (UTC)</Typography>
                            <Typography variant="body1">
                              {dayjs(previousFlight.d_scheduled_time_utc).utc().format('YYYY-MM-DD HH:mm')}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Dep Actual (UTC)</Typography>
                            <Typography variant="body1">
                              {previousFlight.d_actual_time_utc
                                ? dayjs(previousFlight.d_actual_time_utc).utc().format('YYYY-MM-DD HH:mm')
                                : '--'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Arr Scheduled (UTC)</Typography>
                            <Typography variant="body1">
                              {previousFlight.a_scheduled_time_utc
                                ? dayjs(previousFlight.a_scheduled_time_utc).utc().format('YYYY-MM-DD HH:mm')
                                : '--'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Arr Actual (UTC)</Typography>
                            <Typography variant="body1">
                              {previousFlight.a_actual_time_utc
                                ? dayjs(previousFlight.a_actual_time_utc).utc().format('YYYY-MM-DD HH:mm')
                                : '--'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Status</Typography>
                            <Typography variant="body1">
                              {previousFlight.flight_status || '--'}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Delay</Typography>
                            <Typography
                              variant="body1"
                              sx={{
                                color: previousFlight.delay_minutes && previousFlight.delay_minutes >= 60
                                  ? '#d32f2f'
                                  : previousFlight.delay_minutes && previousFlight.delay_minutes >= 30
                                  ? '#ed6c02'
                                  : 'inherit',
                                fontWeight: previousFlight.delay_minutes && previousFlight.delay_minutes >= 30 ? 600 : 400,
                              }}
                            >
                              {previousFlight.delay_minutes !== null
                                ? `${previousFlight.delay_minutes} min`
                                : '--'}
                            </Typography>
                          </Box>
                        </Box>
                      </Paper>
                    ) : (
                      <Typography color="text.secondary">
                        No previous flight found
                      </Typography>
                    )}
                  </Box>
                )}

                {detailTab === 1 && (
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {selectedFlight.d_airport_iata && (
                      <Box sx={{ flex: 1, minWidth: 400 }}>
                        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                          Departure: {selectedFlight.d_airport_iata}
                        </Typography>
                        <Weather
                          iata={selectedFlight.d_airport_iata}
                          date={getFlightDate(selectedFlight)}
                        />
                      </Box>
                    )}
                    {selectedFlight.a_airport_iata && (
                      <Box sx={{ flex: 1, minWidth: 400 }}>
                        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                          Arrival: {selectedFlight.a_airport_iata}
                        </Typography>
                        <Weather
                          iata={selectedFlight.a_airport_iata}
                          date={getFlightDate(selectedFlight)}
                        />
                      </Box>
                    )}
                  </Box>
                )}

                {detailTab === 2 && selectedFlight.d_airport_iata && (
                  <AirportSituation
                    iata={selectedFlight.d_airport_iata}
                    date={getFlightDate(selectedFlight)}
                  />
                )}

                {detailTab === 3 && (
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {selectedFlight.d_airport_icao && (
                      <Box sx={{ flex: 1, minWidth: 400 }}>
                        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                          Departure: {selectedFlight.d_airport_icao}
                        </Typography>
                        <Notams
                          icao={selectedFlight.d_airport_icao}
                          date={getFlightDate(selectedFlight)}
                        />
                      </Box>
                    )}
                    {selectedFlight.a_airport_icao && (
                      <Box sx={{ flex: 1, minWidth: 400 }}>
                        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                          Arrival: {selectedFlight.a_airport_icao}
                        </Typography>
                        <Notams
                          icao={selectedFlight.a_airport_icao}
                          date={getFlightDate(selectedFlight)}
                        />
                      </Box>
                    )}
                    {!selectedFlight.d_airport_icao && !selectedFlight.a_airport_icao && (
                      <Typography color="text.secondary">
                        No ICAO codes available for this flight
                      </Typography>
                    )}
                  </Box>
                )}
              </Paper>
            </Box>
          )}
        </>
      ) : (
        <Typography color="text.secondary">
          No disrupted flights found for {selectedDate?.format('YYYY-MM-DD')}
          {causeCode && ` with cause code "${causeCode}"`}
        </Typography>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

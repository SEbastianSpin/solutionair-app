import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import dayjs, { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams, RowClassParams, CellValueChangedEvent, SelectionChangedEvent, RowClickedEvent } from 'ag-grid-community'
import { ResponsiveLine } from '@nivo/line'
import type { SliceTooltipProps } from '@nivo/line'
import { supabase } from '../lib/supabase'

dayjs.extend(utc)
ModuleRegistry.registerModules([AllCommunityModule])

type CampaignStatus = 'PENDING_REVIEW' | 'REJECTED' | 'SCHEDULED' | 'LIVE' | 'CANCELLED' | 'EXPIRED' | 'FAILED' | 'ALL'

const EDITABLE_STATUSES: Exclude<CampaignStatus, 'ALL'>[] = ['PENDING_REVIEW', 'REJECTED', 'SCHEDULED', 'LIVE', 'CANCELLED', 'EXPIRED', 'FAILED']

interface Campaign {
  campaign_id: number
  flight_number: string
  d_scheduled_time_utc: string
  ad_window_start: string | null
  ad_window_end: string | null
  ad_iata_target: string
  created_at: string | null
  updated_at: string | null
  campaign_status: string
  min_pax_est: number | null
  avg_pax_est: number | null
  campaign_status_comments: string | null
  ad_demographic: string | null
}

interface CampaignFlight {
  flight_number: string
  uploaded_at: string
  flight_type: string
  airport_iata: string
  target_airport_iata: string
  scheduled_time_utc: string
  actual_time_utc: string
  flight_status: string
  avg_pax_est: number | null
  country_code: string | null
  country_code_target: string | null
}

interface PassengerTimePoint {
  flight_id: string
  flight_type: string
  time: number
  time_formatted: string
  passenger_count: number
}

interface PassengerGridRow {
  time: number
  time_formatted: string
  [key: string]: number | string // Dynamic flight columns + sum
}

// Standard normal CDF using error function approximation
function normalCDF(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * absX)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)

  return 0.5 * (1.0 + sign * y)
}

// Log-normal CDF: matches scipy.stats.lognorm.cdf(x, s=sigma, scale=scale)
function lognormCDF(x: number, sigma: number, scale: number): number {
  if (x <= 0) return 0
  // scipy lognorm: CDF = Φ((ln(x) - ln(scale)) / sigma)
  return normalCDF((Math.log(x) - Math.log(scale)) / sigma)
}

// Returns passengers STILL IN AIRPORT (starts at N, drops to 0 over 90 min)
function arrivalsExitLogNormal(
  t: number,
  N: number,
  tLand: number,
  tEnd: number,
  sigma = 0.3,
  medianFraction = 0.3
): number {
  if (t <= tLand) return N  // All passengers just arrived
  if (t >= tEnd) return 0   // Everyone has left

  const elapsed = t - tLand
  const totalWindow = tEnd - tLand
  const scaled = elapsed / totalWindow

  // mu = log(median_fraction), scale = exp(mu) = median_fraction
  const scale = medianFraction
  const cumProb = lognormCDF(scaled, sigma, scale)
  const maxProb = lognormCDF(1.0, sigma, scale)

  const cumulativeExits = N * (cumProb / maxProb)
  return N - cumulativeExits  // Return people REMAINING
}

// Returns cumulative passengers who have ARRIVED (starts at 0, reaches N at departure)
function passengersLogNormal(
  t: number,
  N: number,
  tOpen: number,
  tDep: number,
  sigma = 0.5,
  medianFraction = 0.7
): number {
  if (t <= tOpen) return 0
  if (t >= tDep) return N

  const elapsed = t - tOpen
  const totalWindow = tDep - tOpen
  const scaled = elapsed / totalWindow

  // mu = log(median_fraction), scale = exp(mu) = median_fraction
  const scale = medianFraction
  const cumProb = lognormCDF(scaled, sigma, scale)
  const maxProb = lognormCDF(1.0, sigma, scale)

  return N * (cumProb / maxProb)
}

function calculatePassengerDistribution(flight: CampaignFlight): PassengerTimePoint[] {
  const results: PassengerTimePoint[] = []

  // Use actual_time_utc or fallback to scheduled_time_utc
  const timeStr = flight.actual_time_utc || flight.scheduled_time_utc
  if (!timeStr) return results

  const tActual = dayjs(timeStr).unix()
  const N = flight.avg_pax_est || 100
  // Normalize flight_type to handle different cases
  const fType = flight.flight_type?.toLowerCase()

  const SECONDS_IN_HOUR = 3600
  const THREE_HOURS_IN_SECONDS = 3 * SECONDS_IN_HOUR
  const NINETY_MINS_IN_SECONDS = 90 * 60
  const FIVE_MINUTES_IN_SECONDS = 300

  if (fType === 'arrival' || fType === 'arr') {
    const tLand = tActual
    const tStartSnapped = Math.ceil(tLand / FIVE_MINUTES_IN_SECONDS) * FIVE_MINUTES_IN_SECONDS
    const tEnd = tLand + NINETY_MINS_IN_SECONDS

    for (let t = tStartSnapped; t <= tEnd; t += FIVE_MINUTES_IN_SECONDS) {
      const currentRemaining = arrivalsExitLogNormal(t, N, tLand, tEnd)
      results.push({
        flight_id: flight.flight_number,
        flight_type: flight.flight_type,
        time: t,
        time_formatted: dayjs.unix(t).utc().format('HH:mm'),
        passenger_count: Math.round(currentRemaining)
      })
    }
  } else if (fType === 'departure' || fType === 'dep') {
    const tDep = tActual
    const rawStart = tDep - THREE_HOURS_IN_SECONDS
    const tOpenSnapped = rawStart - (rawStart % SECONDS_IN_HOUR)

    // Generate time points from gate open to departure
    for (let t = tOpenSnapped; t <= tDep; t += FIVE_MINUTES_IN_SECONDS) {
      const passengerCount = passengersLogNormal(t, N, tOpenSnapped, tDep)
      results.push({
        flight_id: flight.flight_number,
        flight_type: flight.flight_type,
        time: t,
        time_formatted: dayjs.unix(t).utc().format('HH:mm'),
        passenger_count: Math.round(passengerCount)
      })
    }

    // Always add the final departure time point with N passengers if not already included
    const lastTime = results.length > 0 ? results[results.length - 1].time : 0
    if (lastTime < tDep) {
      results.push({
        flight_id: flight.flight_number,
        flight_type: flight.flight_type,
        time: tDep,
        time_formatted: dayjs.unix(tDep).utc().format('HH:mm'),
        passenger_count: Math.round(N)
      })
    }
  }

  return results
}

function calculatePassengerGridData(flights: CampaignFlight[]): PassengerGridRow[] {
  if (flights.length === 0) return []

  const FIVE_MINUTES = 300
  const TWO_HOURS = 2 * 3600
  const THREE_HOURS = 3 * 3600
  const NINETY_MINS = 90 * 60

  // For each flight, calculate its time window and actual time
  const flightData = flights.map((f, index) => {
    const timeStr = f.actual_time_utc || f.scheduled_time_utc
    const tActual = timeStr ? dayjs(timeStr).unix() : 0
    const fType = f.flight_type?.toLowerCase()
    const N = f.avg_pax_est || 100
    const isArrival = fType === 'arrival' || fType === 'arr'

    let windowStart: number
    let windowEnd: number

    if (isArrival) {
      windowStart = tActual
      windowEnd = tActual + NINETY_MINS
    } else {
      const rawStart = tActual - THREE_HOURS
      windowStart = rawStart - (rawStart % 3600)
      windowEnd = tActual
    }

    return {
      flight: f,
      index,
      columnKey: `flight_${index}`,
      tActual,
      isArrival,
      N,
      windowStart,
      windowEnd
    }
  })

  // Find overall time range: min start to max end + 2h buffer
  const minTime = Math.min(...flightData.map(f => f.windowStart))
  const maxTime = Math.max(...flightData.map(f => f.windowEnd)) + TWO_HOURS

  // Snap minTime down to 5-minute boundary
  const startTime = Math.floor(minTime / FIVE_MINUTES) * FIVE_MINUTES

  const results: PassengerGridRow[] = []

  // Generate time points every 5 minutes
  for (let t = startTime; t <= maxTime; t += FIVE_MINUTES) {
    const row: PassengerGridRow = {
      time: t,
      time_formatted: dayjs.unix(t).utc().format('HH:mm'),
    }

    let totalPassengers = 0

    // For each flight, calculate passengers at this time
    for (const fd of flightData) {
      let passengers: number

      if (fd.isArrival) {
        const tLand = fd.tActual
        if (t < tLand) {
          // Before landing, no passengers yet
          passengers = 0
        } else {
          const tEnd = tLand + NINETY_MINS
          passengers = arrivalsExitLogNormal(t, fd.N, tLand, tEnd)
        }
      } else {
        const tDep = fd.tActual
        if (t > tDep) {
          // After departure, all passengers have left the airport
          passengers = 0
        } else {
          const rawStart = tDep - THREE_HOURS
          const tOpen = rawStart - (rawStart % 3600)
          passengers = passengersLogNormal(t, fd.N, tOpen, tDep)
        }
      }

      const roundedPassengers = Math.round(passengers)
      row[fd.columnKey] = roundedPassengers
      totalPassengers += roundedPassengers
    }

    row.total = totalPassengers
    results.push(row)
  }

  return results
}

interface NivoDataPoint {
  x: string
  y: number
}

interface NivoSerie {
  id: string
  data: NivoDataPoint[]
}

function transformToNivoData(gridData: PassengerGridRow[], flights: CampaignFlight[]): NivoSerie[] {
  if (gridData.length === 0 || flights.length === 0) return []

  const series: NivoSerie[] = []

  // Create a series for each flight
  flights.forEach((flight, index) => {
    const columnKey = `flight_${index}`
    const flightData: NivoDataPoint[] = gridData.map(row => ({
      x: row.time_formatted as string,
      y: (row[columnKey] as number) || 0
    }))

    series.push({
      id: flight.flight_number,
      data: flightData
    })
  })

  return series
}

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'LIVE', label: 'Live' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'FAILED', label: 'Failed' },
]

export default function Campaigns() {
  const gridRef = useRef<AgGridReact<Campaign>>(null)
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(dayjs())
  const [statusFilter, setStatusFilter] = useState<CampaignStatus>('PENDING_REVIEW')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Campaign[]>([])
  const [massStatus, setMassStatus] = useState<Exclude<CampaignStatus, 'ALL'>>('PENDING_REVIEW')
  const [massComments, setMassComments] = useState('')
  const [updating, setUpdating] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  })
  const [pendingChanges, setPendingChanges] = useState<Map<number, Partial<Campaign>>>(new Map())
  const [savingChanges, setSavingChanges] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [campaignFlights, setCampaignFlights] = useState<CampaignFlight[]>([])
  const [loadingFlights, setLoadingFlights] = useState(false)
  const [selectedFlights, setSelectedFlights] = useState<CampaignFlight[]>([])
  const [passengerGridData, setPassengerGridData] = useState<PassengerGridRow[]>([])
  const [showPassengerGrid, setShowPassengerGrid] = useState(false)

  const fetchCampaigns = useCallback(async () => {
    if (!selectedDate) {
      setCampaigns([])
      return
    }

    setLoading(true)
    try {
      const startOfDay = selectedDate.startOf('day').toISOString()
      const endOfDay = selectedDate.endOf('day').toISOString()

      let query = supabase
        .from('campaigns')
        .select('*')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'ALL') {
        query = query.eq('campaign_status', statusFilter)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching campaigns:', error)
        setCampaigns([])
      } else {
        setCampaigns(data || [])
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err)
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [selectedDate, statusFilter])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  const handleStatusChange = (event: SelectChangeEvent) => {
    setStatusFilter(event.target.value as CampaignStatus)
  }

  const handleMassStatusChange = (event: SelectChangeEvent) => {
    setMassStatus(event.target.value as Exclude<CampaignStatus, 'ALL'>)
  }

  const formatDateTime = (value: string | null) => {
    if (!value) return '--'
    return dayjs(value).format('YYYY-MM-DD HH:mm')
  }

  const onSelectionChanged = useCallback((event: SelectionChangedEvent<Campaign>) => {
    const selected = event.api.getSelectedRows()
    setSelectedRows(selected)
  }, [])

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<Campaign>) => {
    const { data, colDef, newValue } = event
    if (!data || !colDef.field) return

    const field = colDef.field as 'campaign_status' | 'campaign_status_comments'
    const campaignId = data.campaign_id

    setPendingChanges(prev => {
      const newMap = new Map(prev)
      const existing = newMap.get(campaignId) || {}
      newMap.set(campaignId, { ...existing, [field]: newValue })
      return newMap
    })
  }, [])

  const handleSaveChanges = async () => {
    if (pendingChanges.size === 0) return

    setSavingChanges(true)
    let successCount = 0
    let errorCount = 0

    try {
      for (const [campaignId, changes] of pendingChanges.entries()) {
        const { error } = await supabase
          .from('campaigns')
          .update(changes)
          .eq('campaign_id', campaignId)

        if (error) {
          console.error('Error updating campaign:', error)
          errorCount++
        } else {
          successCount++
        }
      }

      if (errorCount > 0) {
        setSnackbar({
          open: true,
          message: `Saved ${successCount}, failed ${errorCount}`,
          severity: errorCount === pendingChanges.size ? 'error' : 'success'
        })
      } else {
        setSnackbar({ open: true, message: `Saved ${successCount} change${successCount !== 1 ? 's' : ''}`, severity: 'success' })
      }

      setPendingChanges(new Map())
      fetchCampaigns()
    } catch (err) {
      console.error('Error saving changes:', err)
      setSnackbar({ open: true, message: 'Failed to save changes', severity: 'error' })
    } finally {
      setSavingChanges(false)
    }
  }

  const handleDiscardChanges = () => {
    setPendingChanges(new Map())
    fetchCampaigns()
  }

  const fetchCampaignFlights = useCallback(async (campaign: Campaign) => {
    if (!campaign.ad_window_start || !campaign.ad_window_end) {
      setCampaignFlights([])
      setSnackbar({ open: true, message: 'Campaign missing ad window dates', severity: 'error' })
      return
    }

    setLoadingFlights(true)
    try {
      // Try the RPC function first
      const { data, error } = await supabase.rpc('get_campaign_flights', {
        p_airport_iata: campaign.ad_iata_target,
        p_ad_window_start: campaign.ad_window_start,
        p_ad_window_end: campaign.ad_window_end,
      })

      if (error) {
        console.error('Error fetching campaign flights via RPC:', error)

        // Fallback: query flights table directly
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('flights')
          .select('flight_number, uploaded_at, flight_type, airport_iata, target_airport_iata, scheduled_time_utc, actual_time_utc, flight_status, aircraft_model')
          .eq('airport_iata', campaign.ad_iata_target)
          .gte('actual_time_utc', campaign.ad_window_start)
          .lte('actual_time_utc', campaign.ad_window_end)
          .order('actual_time_utc', { ascending: true })

        if (fallbackError) {
          console.error('Fallback query also failed:', fallbackError)
          setSnackbar({ open: true, message: `Error: ${fallbackError.message}`, severity: 'error' })
          setCampaignFlights([])
        } else {
          // Map fallback data to expected format
          const mappedData = (fallbackData || []).map(f => ({
            ...f,
            avg_pax_est: 100, // Default estimate since we don't have fleet data
            country_code: null,
            country_code_target: null,
          }))
          setCampaignFlights(mappedData as CampaignFlight[])
          if (mappedData.length === 0) {
            setSnackbar({ open: true, message: `No flights found for ${campaign.ad_iata_target} in window`, severity: 'error' })
          }
        }
      } else {
        setCampaignFlights(data || [])
        if ((data || []).length === 0) {
          setSnackbar({ open: true, message: `No flights found for ${campaign.ad_iata_target} between ${campaign.ad_window_start} and ${campaign.ad_window_end}`, severity: 'error' })
        }
      }
    } catch (err) {
      console.error('Error fetching campaign flights:', err)
      setSnackbar({ open: true, message: 'Failed to fetch flights', severity: 'error' })
      setCampaignFlights([])
    } finally {
      setLoadingFlights(false)
    }
  }, [])

  const onRowClicked = useCallback((event: RowClickedEvent<Campaign>) => {
    const campaign = event.data
    if (!campaign) return

    // Don't trigger if clicking on checkbox or editable cells
    const column = event.column?.getColId()
    if (column === '0' || column === 'campaign_status' || column === 'campaign_status_comments') {
      return
    }

    setSelectedCampaign(campaign)
    setSelectedFlights([])
    setPassengerGridData([])
    fetchCampaignFlights(campaign)
  }, [fetchCampaignFlights])

  const onFlightSelectionChanged = useCallback((event: SelectionChangedEvent<CampaignFlight>) => {
    const selected = event.api.getSelectedRows()
    setSelectedFlights(selected)

    if (selected.length > 0) {
      const gridData = calculatePassengerGridData(selected)
      setPassengerGridData(gridData)
    } else {
      setPassengerGridData([])
    }
  }, [])

  const handleMassUpdate = async () => {
    if (selectedRows.length === 0) return

    setUpdating(true)
    const count = selectedRows.length
    try {
      const campaignIds = selectedRows.map(row => row.campaign_id)

      const updateData: { campaign_status?: string; campaign_status_comments?: string } = {}
      updateData.campaign_status = massStatus
      if (massComments.trim()) {
        updateData.campaign_status_comments = massComments.trim()
      }

      const { error } = await supabase
        .from('campaigns')
        .update(updateData)
        .in('campaign_id', campaignIds)

      if (error) {
        console.error('Error updating campaigns:', error)
        setSnackbar({ open: true, message: `Failed to update ${count} campaign${count !== 1 ? 's' : ''}`, severity: 'error' })
      } else {
        setSnackbar({ open: true, message: `Updated ${count} campaign${count !== 1 ? 's' : ''} successfully`, severity: 'success' })
        // Clear selection and refresh
        gridRef.current?.api?.deselectAll()
        setSelectedRows([])
        setMassComments('')
        fetchCampaigns()
      }
    } catch (err) {
      console.error('Error updating campaigns:', err)
      setSnackbar({ open: true, message: `Failed to update ${count} campaign${count !== 1 ? 's' : ''}`, severity: 'error' })
    } finally {
      setUpdating(false)
    }
  }

  const columnDefs: ColDef<Campaign>[] = useMemo(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      pinned: 'left',
      lockPosition: true,
      suppressHeaderMenuButton: true,
    },
    {
      field: 'campaign_id',
      headerName: 'ID',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 80,
    },
    {
      field: 'flight_number',
      headerName: 'Flight',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'd_scheduled_time_utc',
      headerName: 'Departure (UTC)',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 140,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
    },
    {
      field: 'ad_iata_target',
      headerName: 'Target IATA',
      filter: true,
      sortable: true,
      width: 110,
    },
    {
      field: 'campaign_status',
      headerName: 'Status',
      filter: true,
      sortable: true,
      width: 150,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: EDITABLE_STATUSES,
      },
    },
    {
      field: 'ad_window_start',
      headerName: 'Ad Start',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 140,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
    },
    {
      field: 'ad_window_end',
      headerName: 'Ad End',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 140,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
    },
    {
      field: 'min_pax_est',
      headerName: 'Min Pax',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 90,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? params.value : '--',
    },
    {
      field: 'avg_pax_est',
      headerName: 'Avg Pax',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 90,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? params.value : '--',
    },
    {
      field: 'ad_demographic',
      headerName: 'Demographic',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 120,
      valueFormatter: (params: ValueFormatterParams) => params.value || '--',
    },
    {
      field: 'created_at',
      headerName: 'Created',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 140,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
    },
    {
      field: 'campaign_status_comments',
      headerName: 'Comments',
      filter: true,
      sortable: true,
      flex: 2,
      minWidth: 200,
      editable: true,
      cellEditor: 'agTextCellEditor',
    },
  ], [])

  const defaultColDef = useMemo(() => ({
    resizable: true,
  }), [])

  const passengerColumnDefs: ColDef<PassengerGridRow>[] = useMemo(() => {
    const cols: ColDef<PassengerGridRow>[] = [
      {
        field: 'time_formatted',
        headerName: 'Time (UTC)',
        filter: true,
        sortable: true,
        width: 100,
        pinned: 'left',
      },
    ]

    // Add a column for each selected flight
    selectedFlights.forEach((flight, index) => {
      cols.push({
        field: `flight_${index}`,
        headerName: flight.flight_number,
        filter: 'agNumberColumnFilter',
        sortable: true,
        width: 100,
      })
    })

    // Add total column
    cols.push({
      field: 'total',
      headerName: 'Total',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 100,
      pinned: 'right',
      cellStyle: { fontWeight: 'bold' },
    })

    return cols
  }, [selectedFlights])

  // Transform passenger grid data to Nivo format for area chart
  const chartData = useMemo(() => {
    return transformToNivoData(passengerGridData, selectedFlights)
  }, [passengerGridData, selectedFlights])

  // Calculate ad window markers for the chart
  const adWindowMarkers = useMemo(() => {
    if (!selectedCampaign?.ad_window_start || !selectedCampaign?.ad_window_end) return []

    const adStart = dayjs(selectedCampaign.ad_window_start).utc().format('HH:mm')
    const adEnd = dayjs(selectedCampaign.ad_window_end).utc().format('HH:mm')

    // Check if these times exist in our data
    const timePoints = passengerGridData.map(r => r.time_formatted)
    const hasStart = timePoints.includes(adStart)
    const hasEnd = timePoints.includes(adEnd)

    const markers = []

    if (hasStart) {
      markers.push({
        axis: 'x' as const,
        value: adStart,
        lineStyle: { stroke: '#4caf50', strokeWidth: 2, strokeDasharray: '6 4' },
        legend: 'Ad Start',
        legendOrientation: 'vertical' as const,
        legendPosition: 'top' as const,
      })
    }

    if (hasEnd) {
      markers.push({
        axis: 'x' as const,
        value: adEnd,
        lineStyle: { stroke: '#f44336', strokeWidth: 2, strokeDasharray: '6 4' },
        legend: 'Ad End',
        legendOrientation: 'vertical' as const,
        legendPosition: 'top' as const,
      })
    }

    return markers
  }, [selectedCampaign, passengerGridData])

  const flightColumnDefs: ColDef<CampaignFlight>[] = useMemo(() => [
    {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 50,
      pinned: 'left',
      lockPosition: true,
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
      field: 'flight_type',
      headerName: 'Type',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'airport_iata',
      headerName: 'From',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'target_airport_iata',
      headerName: 'To',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'scheduled_time_utc',
      headerName: 'Scheduled (UTC)',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 140,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
    },
    {
      field: 'actual_time_utc',
      headerName: 'Actual (UTC)',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 140,
      valueFormatter: (params: ValueFormatterParams) => formatDateTime(params.value),
    },
    {
      field: 'flight_status',
      headerName: 'Status',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'avg_pax_est',
      headerName: 'Avg Pax',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 100,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? Math.round(params.value) : '--',
    },
    {
      field: 'country_code',
      headerName: 'Country',
      filter: true,
      sortable: true,
      width: 90,
    },
    {
      field: 'country_code_target',
      headerName: 'To Country',
      filter: true,
      sortable: true,
      width: 100,
    },
  ], [])

  const getRowClass = (params: RowClassParams<Campaign>): string => {
    const data = params.data
    if (!data) return ''

    const now = dayjs()
    const adWindowStart = data.ad_window_start ? dayjs(data.ad_window_start) : null
    const adWindowEnd = data.ad_window_end ? dayjs(data.ad_window_end) : null

    // Red: After ad_window_end AND status is PENDING_REVIEW
    if (adWindowEnd && now.isAfter(adWindowEnd) && data.campaign_status === 'PENDING_REVIEW') {
      return 'row-urgent'
    }

    // Yellow: After ad_window_start (but before ad_window_end or no end defined)
    if (adWindowStart && now.isAfter(adWindowStart)) {
      return 'row-active'
    }

    // Green: Before ad_window_start
    if (adWindowStart && now.isBefore(adWindowStart)) {
      return 'row-upcoming'
    }

    return ''
  }

  const getFlightRowClass = useCallback((params: RowClassParams<CampaignFlight>): string => {
    const data = params.data
    if (!data || !selectedCampaign?.ad_demographic) return ''

    const demographic = selectedCampaign.ad_demographic.toUpperCase()
    const countryCode = data.country_code?.toUpperCase()
    const countryCodeTarget = data.country_code_target?.toUpperCase()

    // Highlight if either origin or target country matches the ad demographic
    if (countryCode === demographic || countryCodeTarget === demographic) {
      return 'row-demographic-match'
    }

    return ''
  }, [selectedCampaign])

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
              maxDate={dayjs()}
            />
          </LocalizationProvider>
        </Box>
        <Box sx={{ minWidth: 200 }}>
          <FormControl fullWidth>
            <InputLabel id="status-filter-label">Campaign Status</InputLabel>
            <Select
              labelId="status-filter-label"
              id="status-filter"
              value={statusFilter}
              label="Campaign Status"
              onChange={handleStatusChange}
            >
              {STATUS_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} found
          </Typography>
        </Box>
      </Box>

      {/* Mass Update Controls */}
      {selectedRows.length > 0 && (
        <Box sx={{
          display: 'flex',
          gap: 2,
          mb: 2,
          p: 2,
          backgroundColor: '#e3f2fd',
          borderRadius: 1,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <Typography variant="body2" fontWeight="medium">
            {selectedRows.length} selected
          </Typography>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="mass-status-label">New Status</InputLabel>
            <Select
              labelId="mass-status-label"
              value={massStatus}
              label="New Status"
              onChange={handleMassStatusChange}
            >
              {EDITABLE_STATUSES.map((status) => (
                <MenuItem key={status} value={status}>
                  {STATUS_OPTIONS.find(s => s.value === status)?.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Comments (optional)"
            value={massComments}
            onChange={(e) => setMassComments(e.target.value)}
            sx={{ minWidth: 200, flex: 1 }}
          />
          <Button
            variant="contained"
            onClick={handleMassUpdate}
            disabled={updating}
          >
            {updating ? 'Updating...' : 'Apply to Selected'}
          </Button>
        </Box>
      )}

      {/* Pending Changes Controls */}
      {pendingChanges.size > 0 && (
        <Box sx={{
          display: 'flex',
          gap: 2,
          mb: 2,
          p: 2,
          backgroundColor: '#fff8e1',
          borderRadius: 1,
          alignItems: 'center',
        }}>
          <Typography variant="body2" fontWeight="medium">
            {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveChanges}
            disabled={savingChanges}
          >
            {savingChanges ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            onClick={handleDiscardChanges}
            disabled={savingChanges}
          >
            Discard
          </Button>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : campaigns.length > 0 ? (
        <Box sx={{
          height: 500,
          width: '100%',
          '& .row-urgent': {
            backgroundColor: '#f8d7da !important',
          },
          '& .row-active': {
            backgroundColor: '#fff3cd !important',
          },
          '& .row-upcoming': {
            backgroundColor: '#d4edda !important',
          },
        }}>
          <AgGridReact<Campaign>
            ref={gridRef}
            rowData={campaigns}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            pagination={true}
            paginationPageSize={20}
            theme={themeQuartz}
            rowHeight={40}
            getRowClass={getRowClass}
            rowSelection="multiple"
            onSelectionChanged={onSelectionChanged}
            onCellValueChanged={onCellValueChanged}
            onRowClicked={onRowClicked}
          />
        </Box>
      ) : (
        <Typography color="text.secondary">
          No campaigns found for {selectedDate?.format('YYYY-MM-DD')} with status "{STATUS_OPTIONS.find(s => s.value === statusFilter)?.label}"
        </Typography>
      )}

      {/* Campaign Flights Section */}
      {selectedCampaign && (
        <Box sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Flights for Campaign #{selectedCampaign.campaign_id} - {selectedCampaign.flight_number} → {selectedCampaign.ad_iata_target}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setSelectedCampaign(null)
                setCampaignFlights([])
              }}
            >
              Close
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ad Window: {formatDateTime(selectedCampaign.ad_window_start)} → {formatDateTime(selectedCampaign.ad_window_end)}
          </Typography>

          {loadingFlights ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : campaignFlights.length > 0 ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Select flights to see combined passenger distribution over time
                {selectedCampaign.ad_demographic && ` (highlighted: ${selectedCampaign.ad_demographic} flights)`}
              </Typography>
              <Box sx={{
                height: 300,
                width: '100%',
                '& .row-demographic-match': {
                  backgroundColor: '#e3f2fd !important',
                },
              }}>
                <AgGridReact<CampaignFlight>
                  rowData={campaignFlights}
                  columnDefs={flightColumnDefs}
                  defaultColDef={defaultColDef}
                  pagination={true}
                  paginationPageSize={10}
                  theme={themeQuartz}
                  rowHeight={40}
                  rowSelection="multiple"
                  onSelectionChanged={onFlightSelectionChanged}
                  getRowClass={getFlightRowClass}
                />
              </Box>
            </>
          ) : (
            <Typography color="text.secondary">
              No flights found for this campaign's ad window
            </Typography>
          )}

          {campaignFlights.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Total: {campaignFlights.length} flights |
              Estimated passengers: {Math.round(campaignFlights.reduce((sum, f) => sum + (f.avg_pax_est || 0), 0))}
            </Typography>
          )}

          {/* Passenger Distribution Section */}
          {selectedFlights.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1">
                  Passenger Distribution: {selectedFlights.length} flight{selectedFlights.length !== 1 ? 's' : ''} selected
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => setShowPassengerGrid(!showPassengerGrid)}
                  >
                    {showPassengerGrid ? 'Hide Grid' : 'Show Grid'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setSelectedFlights([])
                      setPassengerGridData([])
                      setShowPassengerGrid(false)
                    }}
                  >
                    Clear Selection
                  </Button>
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Selected: {selectedFlights.map(f => `${f.flight_number} (${f.flight_type})`).join(', ')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Total Est. Passengers: {Math.round(selectedFlights.reduce((sum, f) => sum + (f.avg_pax_est || 0), 0))} |
                Time points: {passengerGridData.length} |
                Peak: {passengerGridData.length > 0 ? Math.max(...passengerGridData.map(r => r.total as number)) : 0}
              </Typography>

              {/* Passenger Distribution Area Chart */}
              {chartData.length > 0 && (
                <Box sx={{ height: 350, width: '100%', mb: 2 }}>
                  <ResponsiveLine
                    data={chartData}
                    margin={{ top: 20, right: 120, bottom: 60, left: 60 }}
                    xScale={{ type: 'point' }}
                    yScale={{
                      type: 'linear',
                      min: 0,
                      max: 'auto',
                      stacked: true,
                    }}
                    curve="monotoneX"
                    enableArea={true}
                    areaOpacity={0.6}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: -45,
                      legend: 'Time (UTC)',
                      legendOffset: 50,
                      legendPosition: 'middle',
                      tickValues: passengerGridData
                        .filter((_, i) => i % Math.ceil(passengerGridData.length / 12) === 0)
                        .map(r => r.time_formatted),
                    }}
                    axisLeft={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: 0,
                      legend: 'Passengers',
                      legendOffset: -50,
                      legendPosition: 'middle',
                    }}
                    colors={{ scheme: 'category10' }}
                    pointSize={4}
                    pointColor={{ theme: 'background' }}
                    pointBorderWidth={2}
                    pointBorderColor={{ from: 'serieColor' }}
                    enablePointLabel={false}
                    useMesh={true}
                    enableSlices="x"
                    sliceTooltip={({ slice }: SliceTooltipProps) => (
                      <Box
                        sx={{
                          background: 'white',
                          padding: '9px 12px',
                          border: '1px solid #ccc',
                          borderRadius: 1,
                        }}
                      >
                        <Typography variant="caption" fontWeight="bold">
                          {slice.points[0]?.data.xFormatted}
                        </Typography>
                        {slice.points.map((point) => (
                          <Box key={point.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 12,
                                height: 12,
                                backgroundColor: point.serieColor,
                                borderRadius: '50%',
                              }}
                            />
                            <Typography variant="caption">
                              {point.serieId}: {point.data.yFormatted} pax
                            </Typography>
                          </Box>
                        ))}
                        <Typography variant="caption" fontWeight="bold" sx={{ mt: 0.5, display: 'block' }}>
                          Total: {slice.points.reduce((sum, p) => sum + (Number(p.data.y) || 0), 0)} pax
                        </Typography>
                      </Box>
                    )}
                    legends={[
                      {
                        anchor: 'bottom-right',
                        direction: 'column',
                        justify: false,
                        translateX: 110,
                        translateY: 0,
                        itemsSpacing: 2,
                        itemDirection: 'left-to-right',
                        itemWidth: 100,
                        itemHeight: 20,
                        itemOpacity: 0.85,
                        symbolSize: 12,
                        symbolShape: 'circle',
                      }
                    ]}
                    markers={adWindowMarkers}
                  />
                </Box>
              )}

              {showPassengerGrid && passengerGridData.length > 0 && (
                <Box sx={{ height: 400, width: '100%' }}>
                  <AgGridReact<PassengerGridRow>
                    rowData={passengerGridData}
                    columnDefs={passengerColumnDefs}
                    defaultColDef={defaultColDef}
                    pagination={true}
                    paginationPageSize={20}
                    theme={themeQuartz}
                    rowHeight={36}
                  />
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

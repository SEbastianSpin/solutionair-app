import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import dayjs, { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'
import { ResponsiveScatterPlot } from '@nivo/scatterplot'
import { supabase } from '../lib/supabase'

dayjs.extend(utc)
ModuleRegistry.registerModules([AllCommunityModule])

interface FlightData {
  id: number
  uploaded_at: string
  flight_number: string
  airline_name: string | null
  flight_type: string
  airport_iata: string
  target_airport_iata: string
  scheduled_time_utc: string
  actual_time_utc: string | null
  delay_minutes: number | null
  flight_status: string | null
  aircraft_model: string | null
  aircraft_registration: string | null
  scheduled_time_local: string
  terminal: string | null
  airline_iata: string | null
  source: string | null
}

interface AirportSituationProps {
  iata?: string
  date?: string // YYYY-MM-DD format
}

export default function AirportSituation({ iata, date }: AirportSituationProps) {
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(() => {
    if (date) {
      const parsed = dayjs(date)
      return parsed.isValid() ? parsed : dayjs()
    }
    return dayjs()
  })
  const [airportIata, setAirportIata] = useState(iata?.toUpperCase() || '')

  // Update state when props change
  useEffect(() => {
    if (iata) {
      setAirportIata(iata.toUpperCase())
    }
  }, [iata])

  useEffect(() => {
    if (date) {
      const parsed = dayjs(date)
      if (parsed.isValid()) {
        setSelectedDate(parsed)
      }
    }
  }, [date])
  const [flightsData, setFlightsData] = useState<FlightData[]>([])
  const [loading, setLoading] = useState(false)
  const [xRange, setXRange] = useState<[number, number]>([0, 24])
  const [hourFrom, setHourFrom] = useState(6)
  const [hourTo, setHourTo] = useState(18)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchControlsUnlocked, setFetchControlsUnlocked] = useState(false)
  const [chartContainer, setChartContainer] = useState<HTMLDivElement | null>(null)
  const chartContainerRef = useCallback((node: HTMLDivElement | null) => {
    setChartContainer(node)
  }, [])

  // Touch gesture state refs
  const touchStateRef = useRef<{
    initialTouches: { x: number; y: number }[]
    initialXRange: [number, number]
    initialPinchDistance: number
    lastPanX: number
  } | null>(null)

  const hourOptions = Array.from({ length: 24 }, (_, i) => i)

  const handleHourFromChange = (value: number) => {
    setHourFrom(value)
    // Ensure max 12h difference
    if (hourTo - value > 12) {
      setHourTo(value + 12)
    }
    if (value >= hourTo) {
      setHourTo(Math.min(23, value + 1))
    }
  }

  const handleHourToChange = (value: number) => {
    setHourTo(value)
    // Ensure max 12h difference
    if (value - hourFrom > 12) {
      setHourFrom(value - 12)
    }
    if (value <= hourFrom) {
      setHourFrom(Math.max(0, value - 1))
    }
  }

  const fetchFlightsFromApi = async () => {
    if (!airportIata || airportIata.length !== 3 || !selectedDate) return

    setFetching(true)
    setError(null)
    try {
      const dateStr = selectedDate.format('YYYY-MM-DD')
      const params = new URLSearchParams({
        iata: airportIata.toUpperCase(),
        date: dateStr,
        hour_from: hourFrom.toString(),
        hour_to: hourTo.toString(),
      })

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('No authenticated session. Please log in again.')
        return
      }

      const response = await fetch(
        `https://fxgezrkksmdczrcucimo.supabase.co/functions/v1/get_flights?${params}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // Re-fetch data from database after API call
      const startOfDay = `${dateStr}T00:00:00Z`
      const endOfDay = `${dateStr}T23:59:59Z`

      const { data, error } = await supabase
        .from('flights')
        .select('*')
        .eq('airport_iata', airportIata.toUpperCase())
        .gte('scheduled_time_utc', startOfDay)
        .lte('scheduled_time_utc', endOfDay)
        .order('uploaded_at', { ascending: false })

      if (!error && data) {
        const uniqueFlights = new Map<string, FlightData>()
        for (const flight of data) {
          const key = `${flight.flight_number}_${flight.scheduled_time_utc}`
          if (!uniqueFlights.has(key)) {
            uniqueFlights.set(key, flight)
          }
        }
        setFlightsData(Array.from(uniqueFlights.values()))
      }
    } catch (err) {
      console.error('Error fetching flights from API:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch flight data from API')
    } finally {
      setFetching(false)
    }
  }

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!chartContainer) return
    const rect = chartContainer.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const chartLeft = 60 // margin left
    const chartRight = rect.width - 20 // margin right
    const chartWidth = chartRight - chartLeft

    // Calculate where the mouse is as a ratio within the chart area
    const mouseRatio = Math.max(0, Math.min(1, (mouseX - chartLeft) / chartWidth))

    setXRange((prevRange) => {
      const [min, max] = prevRange
      const currentRange = max - min
      const mouseValue = min + mouseRatio * currentRange

      const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8
      const newRange = currentRange * zoomFactor

      if (newRange >= 2 && newRange <= 24) {
        // Keep the mouse position fixed while zooming
        let newMin = mouseValue - mouseRatio * newRange
        let newMax = mouseValue + (1 - mouseRatio) * newRange

        // Clamp to valid bounds
        if (newMin < 0) {
          newMin = 0
          newMax = newRange
        }
        if (newMax > 24) {
          newMax = 24
          newMin = 24 - newRange
        }

        return [newMin, newMax]
      }
      return prevRange
    })
  }, [chartContainer])

  // Touch handlers for pinch-to-zoom and pan
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!chartContainer) return
    const touches = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }))

    let initialPinchDistance = 0
    if (touches.length === 2) {
      initialPinchDistance = Math.hypot(
        touches[1].x - touches[0].x,
        touches[1].y - touches[0].y
      )
    }

    touchStateRef.current = {
      initialTouches: touches,
      initialXRange: [...xRange] as [number, number],
      initialPinchDistance,
      lastPanX: touches[0]?.x || 0,
    }
  }, [chartContainer, xRange])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!chartContainer || !touchStateRef.current) return
    e.preventDefault()

    const rect = chartContainer.getBoundingClientRect()
    const chartLeft = 60
    const chartRight = rect.width - 20
    const chartWidth = chartRight - chartLeft
    const touches = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }))

    if (touches.length === 2 && touchStateRef.current.initialTouches.length === 2) {
      // Pinch to zoom
      const currentDistance = Math.hypot(
        touches[1].x - touches[0].x,
        touches[1].y - touches[0].y
      )
      const initialDistance = touchStateRef.current.initialPinchDistance

      if (initialDistance > 0) {
        const scale = initialDistance / currentDistance
        const [initialMin, initialMax] = touchStateRef.current.initialXRange
        const initialRange = initialMax - initialMin
        const newRange = Math.min(24, Math.max(2, initialRange * scale))

        // Center of pinch in chart coordinates
        const pinchCenterX = (touches[0].x + touches[1].x) / 2 - rect.left
        const pinchRatio = Math.max(0, Math.min(1, (pinchCenterX - chartLeft) / chartWidth))
        const centerValue = initialMin + pinchRatio * initialRange

        let newMin = centerValue - pinchRatio * newRange
        let newMax = centerValue + (1 - pinchRatio) * newRange

        // Clamp to bounds
        if (newMin < 0) {
          newMin = 0
          newMax = newRange
        }
        if (newMax > 24) {
          newMax = 24
          newMin = 24 - newRange
        }

        setXRange([newMin, newMax])
      }
    } else if (touches.length === 1) {
      // Single finger pan
      const deltaX = touches[0].x - touchStateRef.current.lastPanX
      touchStateRef.current.lastPanX = touches[0].x

      setXRange((prevRange) => {
        const [min, max] = prevRange
        const currentRange = max - min
        const hoursPerPixel = currentRange / chartWidth
        const deltaHours = -deltaX * hoursPerPixel

        let newMin = min + deltaHours
        let newMax = max + deltaHours

        // Clamp to bounds
        if (newMin < 0) {
          newMin = 0
          newMax = currentRange
        }
        if (newMax > 24) {
          newMax = 24
          newMin = 24 - currentRange
        }

        return [newMin, newMax]
      })
    }
  }, [chartContainer])

  const handleTouchEnd = useCallback(() => {
    touchStateRef.current = null
  }, [])

  // Attach wheel and touch listeners
  useEffect(() => {
    if (!chartContainer) return

    chartContainer.addEventListener('wheel', handleWheel, { passive: false })
    chartContainer.addEventListener('touchstart', handleTouchStart, { passive: true })
    chartContainer.addEventListener('touchmove', handleTouchMove, { passive: false })
    chartContainer.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      chartContainer.removeEventListener('wheel', handleWheel)
      chartContainer.removeEventListener('touchstart', handleTouchStart)
      chartContainer.removeEventListener('touchmove', handleTouchMove)
      chartContainer.removeEventListener('touchend', handleTouchEnd)
    }
  }, [chartContainer, handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd])

  useEffect(() => {
    async function fetchFlights() {
      if (!airportIata || airportIata.length !== 3 || !selectedDate) {
        setFlightsData([])
        setError(null)
        return
      }

      setLoading(true)
      setError(null)
      try {
        // Use the date string directly to avoid timezone issues
        const dateStr = selectedDate.format('YYYY-MM-DD')
        const startOfDay = `${dateStr}T00:00:00Z`
        const endOfDay = `${dateStr}T23:59:59Z`

        const { data, error: fetchError } = await supabase
          .from('flights')
          .select('*')
          .eq('airport_iata', airportIata.toUpperCase())
          .gte('scheduled_time_utc', startOfDay)
          .lte('scheduled_time_utc', endOfDay)
          .order('uploaded_at', { ascending: false })

        if (fetchError) {
          console.error('Error fetching flights:', fetchError)
          setError(fetchError.message || 'Failed to fetch flights data')
          setFlightsData([])
        } else if (data) {
          // Deduplicate by flight_number + scheduled_time_utc, keeping only max uploaded_at
          const uniqueFlights = new Map<string, FlightData>()
          for (const flight of data) {
            const key = `${flight.flight_number}_${flight.scheduled_time_utc}`
            if (!uniqueFlights.has(key)) {
              uniqueFlights.set(key, flight)
            }
          }
          setFlightsData(Array.from(uniqueFlights.values()))
        }
      } catch (err) {
        console.error('Error fetching flights:', err)
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
        setFlightsData([])
      } finally {
        setLoading(false)
      }
    }

    fetchFlights()
  }, [selectedDate, airportIata])

  const columnDefs: ColDef<FlightData>[] = useMemo(() => [
    {
      field: 'flight_number',
      headerName: 'Flight',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'airline_name',
      headerName: 'Airline',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 120,
    },
    {
      field: 'flight_type',
      headerName: 'Type',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'target_airport_iata',
      headerName: 'To/From',
      filter: true,
      sortable: true,
      width: 90,
    },
    {
      field: 'scheduled_time_local',
      headerName: 'Scheduled',
      filter: true,
      sortable: true,
      width: 130,
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.value) return '--'
        return dayjs(params.value).format('HH:mm')
      },
    },
    {
      field: 'actual_time_utc',
      headerName: 'Actual (UTC)',
      filter: true,
      sortable: true,
      width: 130,
      valueFormatter: (params: ValueFormatterParams) => {
        if (!params.value) return '--'
        return dayjs(params.value).utc().format('HH:mm')
      },
    },
    {
      field: 'delay_minutes',
      headerName: 'Delay',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 80,
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
      width: 100,
    },
    {
      field: 'terminal',
      headerName: 'Terminal',
      filter: true,
      sortable: true,
      width: 90,
    },
    {
      field: 'aircraft_model',
      headerName: 'Aircraft',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 100,
    },
  ], [])

  const defaultColDef = useMemo(() => ({
    resizable: true,
  }), [])

  const { chartData, chartColors } = useMemo(() => {
    if (flightsData.length === 0) return { chartData: [], chartColors: [] }

    // Group flights by airline and flight_type
    const grouped = new Map<string, { flight: FlightData; x: number; y: number }[]>()
    const airlines = new Set<string>()

    for (const flight of flightsData) {
      const scheduledTime = dayjs(flight.scheduled_time_utc).utc()
      const hour = scheduledTime.hour() + scheduledTime.minute() / 60
      const isCancelled = flight.flight_status?.toLowerCase() === 'canceled'
      const delay = isCancelled ? 300 : (flight.delay_minutes ?? 0)

      const airlineName = flight.airline_iata || flight.airline_name || 'Unknown'
      const flightType = flight.flight_type?.toLowerCase() || 'unknown'
      const seriesId = `${airlineName} (${flightType})`

      airlines.add(airlineName)

      if (!grouped.has(seriesId)) {
        grouped.set(seriesId, [])
      }
      grouped.get(seriesId)!.push({
        flight,
        x: hour,
        y: delay,
      })
    }

    // Base colors for airlines
    const baseColors = [
      '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828',
      '#00838f', '#5d4037', '#455a64', '#1565c0', '#2e7d32',
    ]

    // Create color map: lighter for arrivals, darker for departures
    const airlineList = Array.from(airlines)
    const colorMap: Record<string, string> = {}

    airlineList.forEach((airline, index) => {
      const baseColor = baseColors[index % baseColors.length]
      colorMap[`${airline} (departure)`] = baseColor
      colorMap[`${airline} (arrival)`] = adjustBrightness(baseColor, 40)
    })

    const data = Array.from(grouped.entries()).map(([seriesId, points]) => ({
      id: seriesId,
      data: points.map((p) => ({
        x: p.x,
        y: p.y,
        flight_number: p.flight.flight_number,
        status: p.flight.flight_status,
        airline: p.flight.airline_name,
        flight_type: p.flight.flight_type,
      })),
    }))

    const colors = data.map((series) => colorMap[series.id] || '#999999')

    return { chartData: data, chartColors: colors }
  }, [flightsData])

  // Helper function to adjust color brightness
  function adjustBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.min(255, ((num >> 16) & 0xff) + amt)
    const G = Math.min(255, ((num >> 8) & 0xff) + amt)
    const B = Math.min(255, (num & 0xff) + amt)
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`
  }

  // Calculate moving average line data
  const movingAvgData = useMemo(() => {
    if (flightsData.length === 0) return []

    // Get all data points sorted by time
    const points = flightsData.map((flight) => {
      const scheduledTime = dayjs(flight.scheduled_time_utc).utc()
      const hour = scheduledTime.hour() + scheduledTime.minute() / 60
      const isCancelled = flight.flight_status?.toLowerCase() === 'canceled'
      const delay = isCancelled ? 300 : (flight.delay_minutes ?? 0)
      return { x: hour, y: delay }
    }).sort((a, b) => a.x - b.x)

    if (points.length < 3) return points

    // Calculate moving average with window of 5 points (or less if not enough data)
    const windowSize = Math.min(5, Math.floor(points.length / 3))
    const avgPoints: { x: number; y: number }[] = []

    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - Math.floor(windowSize / 2))
      const end = Math.min(points.length, i + Math.ceil(windowSize / 2))
      const window = points.slice(start, end)
      const avgY = window.reduce((sum, p) => sum + p.y, 0) / window.length
      avgPoints.push({ x: points[i].x, y: avgY })
    }

    return avgPoints
  }, [flightsData])

  // Custom layer to render moving average line
  const MovingAvgLayer = ({ xScale, yScale }: { xScale: (v: number) => number; yScale: (v: number) => number }) => {
    if (movingAvgData.length < 2) return null

    const linePoints = movingAvgData
      .map((p) => `${xScale(p.x)},${yScale(p.y)}`)
      .join(' L ')

    return (
      <path
        d={`M ${linePoints}`}
        fill="none"
        stroke="#ff9800"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 3 }}>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Select Date
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              label="IATA Code"
              value={airportIata}
              onChange={(e) => setAirportIata(e.target.value.toUpperCase())}
              placeholder="e.g. JFK"
              inputProps={{ maxLength: 3 }}
              fullWidth
            />
            <Tooltip title={fetchControlsUnlocked ? 'Lock fetch controls' : 'Unlock to fetch from API'}>
              <IconButton
                onClick={() => setFetchControlsUnlocked(!fetchControlsUnlocked)}
                color={fetchControlsUnlocked ? 'primary' : 'default'}
              >
                {fetchControlsUnlocked ? <LockOpenIcon /> : <LockIcon />}
              </IconButton>
            </Tooltip>
          </Box>
          {fetchControlsUnlocked && airportIata.length === 3 && (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>From</InputLabel>
                <Select
                  value={hourFrom}
                  label="From"
                  onChange={(e) => handleHourFromChange(e.target.value as number)}
                >
                  {hourOptions.map((h) => (
                    <MenuItem key={h} value={h}>{`${h.toString().padStart(2, '0')}:00`}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>To</InputLabel>
                <Select
                  value={hourTo}
                  label="To"
                  onChange={(e) => handleHourToChange(e.target.value as number)}
                >
                  {hourOptions.map((h) => (
                    <MenuItem key={h} value={h}>{`${h.toString().padStart(2, '0')}:00`}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary">
                (max 12h UTC)
              </Typography>
              <Button
                variant="contained"
                onClick={fetchFlightsFromApi}
                disabled={fetching}
                size="small"
              >
                {fetching ? 'Fetching...' : 'Fetch Flight Data'}
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : airportIata.length === 3 ? (
        flightsData.length > 0 ? (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {flightsData.length} flights found
            </Typography>

            <Box sx={{ height: 350, width: '100%', mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Delay Distribution (Cancelled = 300 min) — Pinch/scroll to zoom, drag to pan, double-tap to reset
              </Typography>
              <Box
                ref={chartContainerRef}
                onDoubleClick={() => setXRange([0, 24])}
                sx={{
                  height: 300,
                  cursor: 'ew-resize',
                  touchAction: 'none',
                }}
              >
              <ResponsiveScatterPlot
                data={chartData}
                margin={{ top: 20, right: 20, bottom: 50, left: 60 }}
                xScale={{ type: 'linear', min: xRange[0], max: xRange[1] }}
                yScale={{ type: 'linear', min: -30, max: 330 }}
                axisBottom={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Time (Hour UTC)',
                  legendPosition: 'middle',
                  legendOffset: 40,
                  tickValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,12, 15, 18, 21, 24],
                  format: (value) => `${value}:00`,
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Delay (minutes)',
                  legendPosition: 'middle',
                  legendOffset: -50,
                }}
                colors={chartColors}
                nodeSize={8}
                useMesh={true}
                layers={['grid', 'axes', MovingAvgLayer, 'nodes', 'markers', 'mesh', 'legends', 'annotations']}
                markers={[
                  {
                    axis: 'y',
                    value: 180,
                    lineStyle: {
                      stroke: '#d32f2f',
                      strokeWidth: 2,
                      strokeDasharray: '6 4',
                    },
                    legend: '3h threshold',
                    legendPosition: 'right',
                    textStyle: {
                      fill: '#d32f2f',
                      fontSize: 11,
                    },
                  },
                ]}
                tooltip={({ node }) => {
                  const data = node.data as { flight_number: string; status: string; airline: string; flight_type: string }
                  return (
                    <Box sx={{ background: 'white', p: 1, border: '1px solid #ccc', borderRadius: 1 }}>
                      <Typography variant="body2">
                        <strong>{data.flight_number}</strong> ({data.flight_type})
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {data.airline}
                      </Typography>
                      <Typography variant="body2">
                        Time: {Math.floor(node.data.x as number)}:{String(Math.round(((node.data.x as number) % 1) * 60)).padStart(2, '0')}
                      </Typography>
                      <Typography variant="body2">
                        {data.status?.toLowerCase() === 'canceled' ? 'Cancelled' : `Delay: ${node.data.y} min`}
                      </Typography>
                    </Box>
                  )
                }}
              />
              </Box>
            </Box>

            <Box sx={{ height: 400, width: '100%' }}>
            <AgGridReact<FlightData>
              rowData={flightsData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={20}
              theme={themeQuartz}
              rowHeight={40}
            />
            </Box>
          </Box>
        ) : (
          <Typography color="text.secondary">
            No flights found for {airportIata} on {selectedDate?.format('YYYY-MM-DD')}. Click the lock icon to fetch from API.
          </Typography>
        )
      ) : (
        <Typography color="text.secondary">
          Enter a 3-letter IATA code to view airport situation
        </Typography>
      )}
    </Box>
  )
}

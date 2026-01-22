import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import dayjs, { Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams, CellClassParams, ICellRendererParams } from 'ag-grid-community'
import { supabase } from '../lib/supabase'

dayjs.extend(utc)
ModuleRegistry.registerModules([AllCommunityModule])

interface WeatherData {
  airport_iata: string
  location_name: string | null
  location_country: string | null
  forecast_date: string
  time_epoch: string
  time: string | null
  temp_c: number | null
  condition_text: string | null
  condition_icon: string | null
  wind_kph: number | null
  wind_dir: string | null
  gust_kph: number | null
  precip_mm: string | null
  cloud: number | null
  vis_km: number | null
  chance_of_rain: string | null
  chance_of_snow: string | null
}

interface WeatherProps {
  iata?: string
  date?: string // YYYY-MM-DD format
}

export default function Weather({ iata, date }: WeatherProps) {
  const [weatherDate, setWeatherDate] = useState<Dayjs | null>(() => {
    if (date) {
      const parsed = dayjs(date)
      return parsed.isValid() ? parsed : dayjs()
    }
    return dayjs()
  })
  const [weatherIata, setWeatherIata] = useState(iata?.toUpperCase() || '')

  // Update state when props change
  useEffect(() => {
    if (iata) {
      setWeatherIata(iata.toUpperCase())
    }
  }, [iata])

  useEffect(() => {
    if (date) {
      const parsed = dayjs(date)
      if (parsed.isValid()) {
        setWeatherDate(parsed)
      }
    }
  }, [date])
  const [weatherData, setWeatherData] = useState<WeatherData[]>([])
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [fetchingFromApi, setFetchingFromApi] = useState(false)

  useEffect(() => {
    async function fetchWeatherData() {
      if (!weatherIata || weatherIata.length !== 3 || !weatherDate) {
        setWeatherData([])
        return
      }

      setWeatherLoading(true)
      try {
        const dateStr = weatherDate.format('YYYY-MM-DD')

        const { data, error } = await supabase
          .from('weather')
          .select('*')
          .eq('airport_iata', weatherIata.toUpperCase())
          .eq('forecast_date', dateStr)
          .order('time_epoch', { ascending: true })

        if (error) {
          console.error('Error fetching weather:', error)
          setWeatherData([])
        } else {
          setWeatherData(data || [])
        }
      } catch (err) {
        console.error('Error fetching weather:', err)
        setWeatherData([])
      } finally {
        setWeatherLoading(false)
      }
    }

    fetchWeatherData()
  }, [weatherDate, weatherIata])

  const fetchWeatherFromApi = async () => {
    if (!weatherIata || weatherIata.length !== 3 || !weatherDate) return

    setFetchingFromApi(true)
    try {
      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        console.error('No authenticated session')
        return
      }

      const dateStr = weatherDate.format('YYYY-MM-DD')
     
      const { data: result, error } = await supabase.functions.invoke('get_weather', {
      body: { 
        date: dateStr, 
        iata: weatherIata.toUpperCase() 
      },
      
    });

    if (error) throw error;

      // Re-fetch data from database to get the newly inserted records
      const { data, error: fetchError } = await supabase
        .from('weather')
        .select('*')
        .eq('airport_iata', weatherIata.toUpperCase())
        .eq('forecast_date', dateStr)
        .order('time_epoch', { ascending: true })

      if (!fetchError && data) {
        setWeatherData(data)
      }
    } catch (err) {
      console.error('Error fetching weather from API:', err)
    } finally {
      setFetchingFromApi(false)
    }
  }

  const getWindCellClass = (params: CellClassParams<WeatherData>) => {
    const value = params.value as number | null
    if (value === null) return ''
    if (value >= 50) return 'wind-danger'
    if (value >= 30) return 'wind-warning'
    return ''
  }

  const getVisibilityCellClass = (params: CellClassParams<WeatherData>) => {
    const value = params.value as number | null
    if (value === null) return ''
    if (value <= 1) return 'vis-danger'
    if (value <= 5) return 'vis-warning'
    return ''
  }

  const weatherColumnDefs: ColDef<WeatherData>[] = useMemo(() => [
    {
      field: 'time',
      headerName: 'Time (UTC)',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 80,
    },
    {
      field: 'condition_icon',
      headerName: '',
      sortable: false,
      filter: false,
      width: 50,
      cellRenderer: (params: ICellRendererParams<WeatherData>) => {
        if (!params.value) return null
        const iconUrl = params.value.startsWith('//') ? `https:${params.value}` : params.value
        return <img src={iconUrl} alt="weather" style={{ width: 32, height: 32 }} />
      },
    },
    {
      field: 'temp_c',
      headerName: 'Temp',
      filter: 'agNumberColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 70,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? `${params.value}°C` : '--',
    },
    {
      field: 'condition_text',
      headerName: 'Condition',
      filter: true,
      sortable: true,
      flex: 2,
      minWidth: 100,
    },
    {
      field: 'wind_kph',
      headerName: 'Wind',
      filter: 'agNumberColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 70,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? `${params.value} kph` : '--',
      cellClass: getWindCellClass,
    },
    {
      field: 'wind_dir',
      headerName: 'Dir',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 50,
    },
    {
      field: 'gust_kph',
      headerName: 'Gust',
      filter: 'agNumberColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 70,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? `${params.value} kph` : '--',
      cellClass: getWindCellClass,
    },
    {
      field: 'precip_mm',
      headerName: 'Precip',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 60,
      valueFormatter: (params: ValueFormatterParams) => params.value ? `${params.value} mm` : '--',
    },
    {
      field: 'chance_of_rain',
      headerName: 'Rain',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 50,
      valueFormatter: (params: ValueFormatterParams) => params.value ? `${params.value}%` : '--',
    },
    {
      field: 'cloud',
      headerName: 'Cloud',
      filter: 'agNumberColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 60,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? `${params.value}%` : '--',
    },
    {
      field: 'vis_km',
      headerName: 'Visibility',
      filter: 'agNumberColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 70,
      valueFormatter: (params: ValueFormatterParams) => params.value !== null ? `${params.value} km` : '--',
      cellClass: getVisibilityCellClass,
    },
  ], [])

  const defaultColDef = useMemo(() => ({
    resizable: true,
  }), [])

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 3 }}>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Select Date
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DateCalendar
              value={weatherDate}
              onChange={(newValue) => setWeatherDate(newValue)}
              maxDate={dayjs()}
              minDate={dayjs().subtract(3, 'days')}
            />
          </LocalizationProvider>
        </Box>
        <Box sx={{ minWidth: 200 }}>
          <TextField
            label="IATA Code"
            value={weatherIata}
            onChange={(e) => setWeatherIata(e.target.value.toUpperCase())}
            placeholder="e.g. JFK"
            inputProps={{ maxLength: 3 }}
            fullWidth
          />
          {weatherData.length > 0 && weatherData[0].location_name && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {weatherData[0].location_name}, {weatherData[0].location_country}
            </Typography>
          )}
        </Box>
      </Box>

      {weatherLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : weatherIata.length === 3 ? (
        weatherData.length > 0 ? (
          <>
            <Box sx={{
              height: 400,
              width: '100%',
              '& .wind-warning': {
                backgroundColor: '#fff3cd !important',
                color: '#856404',
                fontWeight: 600,
              },
              '& .wind-danger': {
                backgroundColor: '#f8d7da !important',
                color: '#721c24',
                fontWeight: 600,
              },
              '& .vis-warning': {
                backgroundColor: '#fff3cd !important',
                color: '#856404',
                fontWeight: 600,
              },
              '& .vis-danger': {
                backgroundColor: '#f8d7da !important',
                color: '#721c24',
                fontWeight: 600,
              },
            }}>
              <AgGridReact<WeatherData>
                rowData={weatherData}
                columnDefs={weatherColumnDefs}
                defaultColDef={defaultColDef}
                pagination={true}
                paginationPageSize={24}
                theme={themeQuartz}
                rowHeight={40}
              />
            </Box>
            {weatherData.length < 23 && (
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography color="text.secondary">
                  Incomplete data ({weatherData.length}/24 hours)
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={fetchWeatherFromApi}
                  disabled={fetchingFromApi}
                >
                  {fetchingFromApi ? 'Fetching...' : 'Fetch Weather Data'}
                </Button>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography color="text.secondary">
              No weather data found for {weatherIata} on {weatherDate?.format('YYYY-MM-DD')}
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={fetchWeatherFromApi}
              disabled={fetchingFromApi}
            >
              {fetchingFromApi ? 'Fetching...' : 'Fetch Weather Data'}
            </Button>
          </Box>
        )
      ) : (
        <Typography color="text.secondary">
          Enter a 3-letter IATA code to view weather data
        </Typography>
      )}
    </Box>
  )
}

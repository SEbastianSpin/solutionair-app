import { useState, useEffect, useMemo } from 'react'
import {
  Box,
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
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'
import { supabase } from '../lib/supabase'

dayjs.extend(utc)
ModuleRegistry.registerModules([AllCommunityModule])

interface NotamData {
  id: number
  location: string
  serial_number: string
  class: string | null
  issue_date_utc: string
  effective_date_utc: string
  expiry_date_utc: string
  notam_info: string
  impact: string | null
  category: string | null
  summary: string | null
  resource: string | null
  created_at: string | null
}

interface NotamsProps {
  icao?: string
  date?: string // YYYY-MM-DD format
}

export default function Notams({ icao, date }: NotamsProps) {
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(() => {
    if (date) {
      const parsed = dayjs(date)
      return parsed.isValid() ? parsed : dayjs()
    }
    return dayjs()
  })
  const [locationIcao, setLocationIcao] = useState(icao?.toUpperCase() || '')

  // Update state when props change
  useEffect(() => {
    if (icao) {
      setLocationIcao(icao.toUpperCase())
    }
  }, [icao])

  useEffect(() => {
    if (date) {
      const parsed = dayjs(date)
      if (parsed.isValid()) {
        setSelectedDate(parsed)
      }
    }
  }, [date])
  const [notamsData, setNotamsData] = useState<NotamData[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchNotams() {
      if (!locationIcao || locationIcao.length !== 4 || !selectedDate) {
        setNotamsData([])
        return
      }

      setLoading(true)
      try {
        const dateIso = selectedDate.utc().toISOString()

        const { data, error } = await supabase
          .from('notams')
          .select('*')
          .eq('location', locationIcao.toUpperCase())
          .lte('effective_date_utc', dateIso)
          .gte('expiry_date_utc', dateIso)
          .order('effective_date_utc', { ascending: false })

        if (error) {
          console.error('Error fetching NOTAMs:', error)
          setNotamsData([])
        } else {
          setNotamsData(data || [])
        }
      } catch (err) {
        console.error('Error fetching NOTAMs:', err)
        setNotamsData([])
      } finally {
        setLoading(false)
      }
    }

    fetchNotams()
  }, [selectedDate, locationIcao])

  const formatDateTime = (params: ValueFormatterParams) => {
    if (!params.value) return '--'
    return dayjs(params.value).utc().format('YYYY-MM-DD HH:mm')
  }

  const columnDefs: ColDef<NotamData>[] = useMemo(() => [
    {
      field: 'serial_number',
      headerName: 'Serial #',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'location',
      headerName: 'Location',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'class',
      headerName: 'Class',
      filter: true,
      sortable: true,
      width: 80,
    },
    {
      field: 'category',
      headerName: 'Category',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'effective_date_utc',
      headerName: 'Effective (UTC)',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'expiry_date_utc',
      headerName: 'Expiry (UTC)',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'summary',
      headerName: 'Summary',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'impact',
      headerName: 'Impact',
      filter: true,
      sortable: true,
      width: 120,
    },
    {
      field: 'notam_info',
      headerName: 'NOTAM Info',
      filter: true,
      sortable: true,
      flex: 2,
      minWidth: 300,
      tooltipField: 'notam_info',
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
              value={selectedDate}
              onChange={(newValue) => setSelectedDate(newValue)}
            />
          </LocalizationProvider>
        </Box>
        <Box sx={{ minWidth: 200 }}>
          <TextField
            label="ICAO Code"
            value={locationIcao}
            onChange={(e) => setLocationIcao(e.target.value.toUpperCase())}
            placeholder="e.g. KJFK"
            inputProps={{ maxLength: 4 }}
            fullWidth
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Enter 4-letter ICAO airport code
          </Typography>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : locationIcao.length === 4 ? (
        notamsData.length > 0 ? (
          <Box sx={{ height: 500, width: '100%' }}>
            <AgGridReact<NotamData>
              rowData={notamsData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              pagination={true}
              paginationPageSize={20}
              theme={themeQuartz}
              rowHeight={40}
              tooltipShowDelay={0}
            />
          </Box>
        ) : (
          <Typography color="text.secondary">
            No NOTAMs found for {locationIcao} on {selectedDate?.format('YYYY-MM-DD')}
          </Typography>
        )
      ) : (
        <Typography color="text.secondary">
          Enter a 4-letter ICAO code to view NOTAMs
        </Typography>
      )}
    </Box>
  )
}

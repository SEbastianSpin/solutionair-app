import { supabase } from '../lib/supabase'

export interface UnknownFlight {
  flight_number: string
  d_scheduled_time_utc: string
  d_airport_iata: string | null
  a_airport_iata: string | null
  created_at: string
  cause_code: string
}

export interface ResolvedFlight {
  flight_number: string
  d_scheduled_time_utc: string
  d_airport_iata: string | null
  a_airport_iata: string | null
  created_at: string
  resolved_at: string
  old_cause_code: string
  new_cause_code: string
  resolution_time_hours: number
}

export interface CauseCodeData {
  unknownFlights: UnknownFlight[]
  resolvedFlights: ResolvedFlight[]
}

// Cache for metrics data
let dataCache: { data: CauseCodeData; timestamp: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getThreeMonthsAgo(): Date {
  const date = new Date()
  date.setMonth(date.getMonth() - 3)
  date.setHours(0, 0, 0, 0)
  return date
}

export async function getCauseCodeData(): Promise<CauseCodeData> {
  // Return cached data if still valid
  if (dataCache && Date.now() - dataCache.timestamp < CACHE_TTL) {
    return dataCache.data
  }

  const threeMonthsAgo = getThreeMonthsAgo()

  // Query 1: Get flights with UNKNOWN cause_code
  const { data: unknownData, error: unknownError } = await supabase
    .from('disrupted_flights')
    .select('flight_number, d_scheduled_time_utc, d_airport_iata, a_airport_iata, created_at, cause_code')
    .eq('cause_code', 'UNKNOWN')
    .gte('created_at', threeMonthsAgo.toISOString())
    .order('created_at', { ascending: false })

  if (unknownError) {
    console.error('Error fetching unknown flights:', unknownError)
  }

  // Query 2: Get audit log entries where cause_code changed from UNKNOWN
  const { data: auditData, error: auditError } = await supabase
    .from('disrupted_flights_audit_log')
    .select('flight_number, d_scheduled_time_utc, old_value, new_value, changed_at')
    .eq('column_name', 'cause_code')
    .eq('old_value', 'UNKNOWN')
    .neq('new_value', 'UNKNOWN')
    .gte('changed_at', threeMonthsAgo.toISOString())
    .order('changed_at', { ascending: false })

  if (auditError) {
    console.error('Error fetching audit data:', auditError)
  }

  const unknownFlights: UnknownFlight[] = (unknownData ?? []).map((f) => ({
    flight_number: f.flight_number,
    d_scheduled_time_utc: f.d_scheduled_time_utc,
    d_airport_iata: f.d_airport_iata,
    a_airport_iata: f.a_airport_iata,
    created_at: f.created_at,
    cause_code: f.cause_code,
  }))

  // For resolved flights, we need to get the flight details and calculate resolution time
  const resolvedFlights: ResolvedFlight[] = []

  if (auditData && auditData.length > 0) {
    // Batch fetch flight details
    for (const audit of auditData) {
      const { data: flightData } = await supabase
        .from('disrupted_flights')
        .select('d_airport_iata, a_airport_iata, created_at')
        .eq('flight_number', audit.flight_number)
        .eq('d_scheduled_time_utc', audit.d_scheduled_time_utc)
        .single()

      if (flightData?.created_at) {
        const createdAt = new Date(flightData.created_at)
        const changedAt = new Date(audit.changed_at)
        const resolutionHours = (changedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

        resolvedFlights.push({
          flight_number: audit.flight_number,
          d_scheduled_time_utc: audit.d_scheduled_time_utc,
          d_airport_iata: flightData.d_airport_iata,
          a_airport_iata: flightData.a_airport_iata,
          created_at: flightData.created_at,
          resolved_at: audit.changed_at,
          old_cause_code: audit.old_value,
          new_cause_code: audit.new_value,
          resolution_time_hours: resolutionHours >= 0 ? resolutionHours : 0,
        })
      }
    }
  }

  const data: CauseCodeData = {
    unknownFlights,
    resolvedFlights,
  }

  // Cache the result
  dataCache = { data, timestamp: Date.now() }

  return data
}

export function clearCauseCodeDataCache(): void {
  dataCache = null
}

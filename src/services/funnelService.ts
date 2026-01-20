import { supabase } from '../lib/supabase'

export type Period =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'this_year'
  | 'all_time'

export interface FunnelRow {
  period: Period
  flights_count: number
  disrupted_count: number
  campaigns_count: number
}

export interface FunnelData {
  flights: number
  disruptedFlights: number
  campaigns: number
}

// Simple cache for funnel data
let funnelCache: { data: FunnelRow[]; timestamp: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getFunnelSummary(): Promise<FunnelRow[]> {
  // Return cached data if still valid
  if (funnelCache && Date.now() - funnelCache.timestamp < CACHE_TTL) {
    return funnelCache.data
  }

  const { data, error } = await supabase.rpc('get_funnel_summary')

  console.log('Funnel RPC response:', { data, error })

  if (error) {
    console.error('Error fetching funnel summary:', error)
    return []
  }

  // Cache the result
  funnelCache = { data: data ?? [], timestamp: Date.now() }

  return data ?? []
}

export function clearFunnelCache(): void {
  funnelCache = null
}

export function getFunnelDataForPeriod(rows: FunnelRow[], period: Period): FunnelData {
  const row = rows.find((r) => r.period === period)

  return {
    flights: row?.flights_count ?? 0,
    disruptedFlights: row?.disrupted_count ?? 0,
    campaigns: row?.campaigns_count ?? 0,
  }
}

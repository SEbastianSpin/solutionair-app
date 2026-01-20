import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fxgezrkksmdczrcucimo.supabase.co'
const supabaseAnonKey = 'sb_publishable_pf458SeZk0_8rMYm6_bH2Q_Hn8AfSt4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

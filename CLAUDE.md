# SolutionAir Internal App

## Project Overview
Simple internal website for SolutionAir.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Library**: MUI (Material UI)
- **Tables**: AG Grid Community (free)
- **Charts**: Nivo (bar, line, pie, funnel)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)

## Supabase Configuration
- Project URL: https://fxgezrkksmdczrcucimo.supabase.co
- Anon Key: sb_publishable_pf458SeZk0_8rMYm6_bH2Q_Hn8AfSt4

## Project Structure
```
solutionair-app/
├── src/
│   ├── assets/        # Static assets
│   ├── components/    # React components
│   ├── lib/           # Supabase client and utilities
│   ├── pages/         # Page components
│   ├── App.tsx        # Main app component
│   └── main.tsx       # Entry point
├── public/            # Public static files
├── CLAUDE.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Commands
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

## Development Guidelines
- Keep it simple - internal use only
- Use Supabase client SDK for all backend operations
- Use MUI components for consistent UI
- Follow existing code patterns

## Notes
- This is an internal tool, not public-facing

## db INFO 

CREATE TABLE public.campaigns (
  flight_number text NOT NULL,
  d_scheduled_time_utc timestamp with time zone NOT NULL,
  ad_window_start timestamp with time zone,
  ad_window_end timestamp with time zone,
  ad_iata_target text NOT NULL,
  created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone,
  campaign_status USER-DEFINED NOT NULL DEFAULT 'PENDING_REVIEW'::campaign_status,
  min_pax_est smallint,
  avg_pax_est smallint,
  campaign_id bigint NOT NULL DEFAULT nextval('campaigns_campaign_id_seq'::regclass),
  campaign_status_comments text,
  ad_demographic text,
  CONSTRAINT campaigns_pkey PRIMARY KEY (campaign_id),
  CONSTRAINT fk_campaigns_flight FOREIGN KEY (flight_number) REFERENCES public.disrupted_flights(flight_number),
  CONSTRAINT fk_campaigns_flight FOREIGN KEY (d_scheduled_time_utc) REFERENCES public.disrupted_flights(flight_number),
  CONSTRAINT fk_campaigns_flight FOREIGN KEY (flight_number) REFERENCES public.disrupted_flights(d_scheduled_time_utc),
  CONSTRAINT fk_campaigns_flight FOREIGN KEY (d_scheduled_time_utc) REFERENCES public.disrupted_flights(d_scheduled_time_utc)
);
CREATE TABLE public.campaigns_audit_log (
  audit_id bigint NOT NULL DEFAULT nextval('campaigns_audit_log_audit_id_seq'::regclass),
  campaign_id bigint NOT NULL,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT campaigns_audit_log_pkey PRIMARY KEY (audit_id),
  CONSTRAINT fk_campaigns_audit_log_campaign FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id)
);
CREATE TABLE public.cases (
  case_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  short_id text NOT NULL DEFAULT encode(gen_random_bytes(4), 'hex'::text) UNIQUE,
  case_type text NOT NULL CHECK (case_type = ANY (ARRAY['flight_delay'::text, 'flight_cancellation'::text, 'denied_boarding'::text, 'baggage'::text])),
  flight_number text,
  d_scheduled_time_utc timestamp with time zone,
  campaign_id bigint,
  source_channel text NOT NULL,
  source_details jsonb,
  customer_email text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  compensation_amount_eur numeric DEFAULT 0,
  other_amount_eur numeric DEFAULT 0,
  other_amount_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  internal_notes text,
  access_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'::text) UNIQUE,
  CONSTRAINT cases_pkey PRIMARY KEY (case_id),
  CONSTRAINT fk_case_flight FOREIGN KEY (flight_number) REFERENCES public.disrupted_flights(flight_number),
  CONSTRAINT fk_case_flight FOREIGN KEY (d_scheduled_time_utc) REFERENCES public.disrupted_flights(flight_number),
  CONSTRAINT fk_case_flight FOREIGN KEY (flight_number) REFERENCES public.disrupted_flights(d_scheduled_time_utc),
  CONSTRAINT fk_case_flight FOREIGN KEY (d_scheduled_time_utc) REFERENCES public.disrupted_flights(d_scheduled_time_utc),
  CONSTRAINT fk_case_campaign FOREIGN KEY (campaign_id) REFERENCES public.campaigns(campaign_id)
);
CREATE TABLE public.cases_audit_log (
  audit_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  case_id bigint NOT NULL,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  changed_by text DEFAULT CURRENT_USER,
  CONSTRAINT cases_audit_log_pkey PRIMARY KEY (audit_id)
);

CREATE TABLE public.disrupted_flights (
  flight_number text NOT NULL,
  call_sign text,
  flight_status text,
  code_share_status text,
  last_updated_api_utc timestamp with time zone,
  data_source text,
  airline_icao text,
  airline_iata text,
  aircraft_reg text,
  aircraft_mode_s text,
  aircraft_model text,
  d_terminal text,
  d_gate text,
  d_airport_icao text,
  d_airport_iata text,
  d_country_code text,
  d_scheduled_time_utc timestamp with time zone NOT NULL,
  d_scheduled_time_local timestamp without time zone,
  d_runway_time_utc timestamp with time zone,
  d_runway text,
  d_revised_time_local timestamp without time zone,
  d_actual_time_utc timestamp with time zone,
  a_terminal text,
  a_gate text,
  a_airport_icao text,
  a_airport_iata text,
  a_airport_country_code text,
  a_scheduled_time_utc timestamp with time zone,
  a_scheduled_time_local timestamp without time zone,
  a_runway text,
  a_runway_time_utc timestamp with time zone,
  a_revised_time_local timestamp without time zone,
  a_predicted_time_utc timestamp with time zone,
  a_predicted_time_local timestamp without time zone,
  a_actual_time_utc timestamp with time zone,
  created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text),
  num_seats smallint,
  plane_age_years real,
  compensation smallint CHECK (compensation >= 0),
  cause_code text DEFAULT 'UNKNOWN'::text,
  updated_at timestamp with time zone,
  rc_details text,
  CONSTRAINT disrupted_flights_pkey PRIMARY KEY (flight_number, d_scheduled_time_utc),
  CONSTRAINT fk_disrupted_flights_cause_code FOREIGN KEY (cause_code) REFERENCES public.disruption_causes(cause_code)
);
CREATE TABLE public.disrupted_flights_audit_log (
  audit_id bigint NOT NULL DEFAULT nextval('disrupted_flights_audit_log_audit_id_seq'::regclass),
  flight_number text NOT NULL,
  d_scheduled_time_utc timestamp with time zone NOT NULL,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  changed_by text DEFAULT CURRENT_USER,
  CONSTRAINT disrupted_flights_audit_log_pkey PRIMARY KEY (audit_id)
);
CREATE TABLE public.disruption_causes (
  cause_code text NOT NULL,
  cause_text text NOT NULL,
  cause_category text NOT NULL,
  ec261_compensable boolean DEFAULT false,
  description text,
  created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT disruption_causes_pkey PRIMARY KEY (cause_code)
);

CREATE TABLE public.flights (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  flight_number text NOT NULL,
  airline_name text,
  flight_type text NOT NULL,
  airport_iata text NOT NULL,
  target_airport_iata text NOT NULL,
  scheduled_time_utc timestamp with time zone NOT NULL,
  actual_time_utc timestamp with time zone,
  delay_minutes smallint,
  flight_status text,
  aircraft_model text,
  aircraft_registration text,
  scheduled_time_local timestamp without time zone NOT NULL,
  terminal text CHECK (length(terminal) < 50),
  airline_iata text,
  processed_for_campaign boolean DEFAULT false,
  source text,
  CONSTRAINT flights_pkey PRIMARY KEY (id)
);




export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      approvals: {
        Row: {
          amount: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          entity_id: string
          entity_type: string
          id: string
          requested_by: string | null
          required_permission: string
          site_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          summary: string | null
          title: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id: string
          entity_type: string
          id?: string
          requested_by?: string | null
          required_permission: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          summary?: string | null
          title: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          requested_by?: string | null
          required_permission?: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_days: {
        Row: {
          computed_at: string
          day_type: Database["public"]["Enums"]["day_type"]
          first_in: string | null
          holiday_hours: number
          id: string
          is_late: boolean
          is_manual: boolean
          last_out: string | null
          locked: boolean
          minutes_late: number
          note: string | null
          ot_hours: number
          profile_id: string
          regular_hours: number
          shift_id: string | null
          site_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          weekend_hours: number
          work_date: string
        }
        Insert: {
          computed_at?: string
          day_type?: Database["public"]["Enums"]["day_type"]
          first_in?: string | null
          holiday_hours?: number
          id?: string
          is_late?: boolean
          is_manual?: boolean
          last_out?: string | null
          locked?: boolean
          minutes_late?: number
          note?: string | null
          ot_hours?: number
          profile_id: string
          regular_hours?: number
          shift_id?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          weekend_hours?: number
          work_date: string
        }
        Update: {
          computed_at?: string
          day_type?: Database["public"]["Enums"]["day_type"]
          first_in?: string | null
          holiday_hours?: number
          id?: string
          is_late?: boolean
          is_manual?: boolean
          last_out?: string | null
          locked?: boolean
          minutes_late?: number
          note?: string | null
          ot_hours?: number
          profile_id?: string
          regular_hours?: number
          shift_id?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          weekend_hours?: number
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "attendance_days_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          entity_id: string | null
          entity_type: string
          id: number
          note: string | null
          occurred_at: string
          site_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: number
          note?: string | null
          occurred_at?: string
          site_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: number
          note?: string | null
          occurred_at?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_days: {
        Row: {
          created_at: string
          created_by: string | null
          day: string
          day_type: Database["public"]["Enums"]["day_type"]
          id: string
          rate_multiplier: number | null
          reason: string | null
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day: string
          day_type: Database["public"]["Enums"]["day_type"]
          id?: string
          rate_multiplier?: number | null
          reason?: string | null
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day?: string
          day_type?: Database["public"]["Enums"]["day_type"]
          id?: string
          rate_multiplier?: number | null
          reason?: string | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_days_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_days_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "calendar_days_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_days_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      department_kpis: {
        Row: {
          actual: number
          department_id: string
          id: string
          label: string
          metric: string
          month: string
          target: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          actual?: number
          department_id: string
          id?: string
          label: string
          metric: string
          month: string
          target?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          actual?: number
          department_id?: string
          id?: string
          label?: string
          metric?: string
          month?: string
          target?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_kpis_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          default_worker_type: Database["public"]["Enums"]["worker_type"]
          id: string
          is_active: boolean
          name: string
          site_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_worker_type?: Database["public"]["Enums"]["worker_type"]
          id?: string
          is_active?: boolean
          name: string
          site_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_worker_type?: Database["public"]["Enums"]["worker_type"]
          id?: string
          is_active?: boolean
          name?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      device_enrollments: {
        Row: {
          device_id: string
          device_user_id: string
          enrolled_at: string
          id: string
          profile_id: string
        }
        Insert: {
          device_id: string
          device_user_id: string
          enrolled_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          device_id?: string
          device_user_id?: string
          enrolled_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_enrollments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "device_enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          auto_sync: boolean
          comm_key: string | null
          consecutive_failures: number
          created_at: string
          id: string
          ip_address: unknown
          is_active: boolean
          last_error: string | null
          last_seen_at: string | null
          last_sync_at: string | null
          last_sync_count: number
          mode: Database["public"]["Enums"]["device_mode"]
          model: string
          name: string
          port: number
          serial_number: string | null
          site_id: string
          status: Database["public"]["Enums"]["device_status"]
          sync_interval_seconds: number
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_sync?: boolean
          comm_key?: string | null
          consecutive_failures?: number
          created_at?: string
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          last_sync_at?: string | null
          last_sync_count?: number
          mode?: Database["public"]["Enums"]["device_mode"]
          model?: string
          name: string
          port?: number
          serial_number?: string | null
          site_id: string
          status?: Database["public"]["Enums"]["device_status"]
          sync_interval_seconds?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_sync?: boolean
          comm_key?: string | null
          consecutive_failures?: number
          created_at?: string
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          last_sync_at?: string | null
          last_sync_count?: number
          mode?: Database["public"]["Enums"]["device_mode"]
          model?: string
          name?: string
          port?: number
          serial_number?: string | null
          site_id?: string
          status?: Database["public"]["Enums"]["device_status"]
          sync_interval_seconds?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          month: string
          site_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          month: string
          site_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          month?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      late_penalty_rules: {
        Row: {
          basis: Database["public"]["Enums"]["penalty_basis"]
          created_at: string
          from_minutes: number
          id: string
          is_active: boolean
          label: string
          penalty_percent: number
          shift_id: string | null
          site_id: string
          to_minutes: number | null
          updated_at: string
        }
        Insert: {
          basis?: Database["public"]["Enums"]["penalty_basis"]
          created_at?: string
          from_minutes: number
          id?: string
          is_active?: boolean
          label: string
          penalty_percent: number
          shift_id?: string | null
          site_id: string
          to_minutes?: number | null
          updated_at?: string
        }
        Update: {
          basis?: Database["public"]["Enums"]["penalty_basis"]
          created_at?: string
          from_minutes?: number
          id?: string
          is_active?: boolean
          label?: string
          penalty_percent?: number
          shift_id?: string | null
          site_id?: string
          to_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "late_penalty_rules_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_penalty_rules_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_date: string
          id: string
          leave_type_id: string
          profile_id: string
          reason: string | null
          status: Database["public"]["Enums"]["request_status"]
          to_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date: string
          id?: string
          leave_type_id: string
          profile_id: string
          reason?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          to_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date?: string
          id?: string
          leave_type_id?: string
          profile_id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          annual_quota: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_paid: boolean
          name: string
          site_id: string | null
        }
        Insert: {
          annual_quota?: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name: string
          site_id?: string | null
        }
        Update: {
          annual_quota?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_paid?: boolean
          name?: string
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_components: {
        Row: {
          amount: number
          applies_to: Database["public"]["Enums"]["pay_class"] | null
          calc: Database["public"]["Enums"]["component_calc"]
          code: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          is_active: boolean
          is_statutory: boolean
          kind: Database["public"]["Enums"]["component_kind"]
          label: string
          percent: number
          site_id: string | null
          slabs: Json | null
          sort_order: number
        }
        Insert: {
          amount?: number
          applies_to?: Database["public"]["Enums"]["pay_class"] | null
          calc?: Database["public"]["Enums"]["component_calc"]
          code: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          is_statutory?: boolean
          kind: Database["public"]["Enums"]["component_kind"]
          label: string
          percent?: number
          site_id?: string | null
          slabs?: Json | null
          sort_order?: number
        }
        Update: {
          amount?: number
          applies_to?: Database["public"]["Enums"]["pay_class"] | null
          calc?: Database["public"]["Enums"]["component_calc"]
          code?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          is_statutory?: boolean
          kind?: Database["public"]["Enums"]["component_kind"]
          label?: string
          percent?: number
          site_id?: string | null
          slabs?: Json | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "pay_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pay_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_components_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_rules: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          holiday_hourly_rate: number
          id: string
          late_grace_minutes: number
          night_hourly_rate: number
          ot_daily_cap_hours: number
          ot_hourly_rate: number
          ot_threshold_minutes: number
          round_to_minutes: number
          site_id: string
          standard_days_per_month: number
          standard_hours_per_day: number
          weekend_hourly_rate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          holiday_hourly_rate?: number
          id?: string
          late_grace_minutes?: number
          night_hourly_rate?: number
          ot_daily_cap_hours?: number
          ot_hourly_rate?: number
          ot_threshold_minutes?: number
          round_to_minutes?: number
          site_id: string
          standard_days_per_month?: number
          standard_hours_per_day?: number
          weekend_hourly_rate?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          holiday_hourly_rate?: number
          id?: string
          late_grace_minutes?: number
          night_hourly_rate?: number
          ot_daily_cap_hours?: number
          ot_hourly_rate?: number
          ot_threshold_minutes?: number
          round_to_minutes?: number
          site_id?: string
          standard_days_per_month?: number
          standard_hours_per_day?: number
          weekend_hourly_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "pay_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "pay_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_rules_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          allowances: number
          base_pay: number
          base_rate: number
          breakdown: Json
          computed_at: string
          days_absent: number
          days_leave: number
          days_present: number
          deductions: number
          gross: number
          holiday_hours: number
          holiday_pay: number
          id: string
          net: number
          note: string | null
          ot_hours: number
          ot_pay: number
          pay_class: Database["public"]["Enums"]["pay_class"]
          period_id: string
          profile_id: string
          regular_hours: number
          status: Database["public"]["Enums"]["payroll_status"]
          tax: number
          weekend_hours: number
          weekend_pay: number
        }
        Insert: {
          allowances?: number
          base_pay?: number
          base_rate?: number
          breakdown?: Json
          computed_at?: string
          days_absent?: number
          days_leave?: number
          days_present?: number
          deductions?: number
          gross?: number
          holiday_hours?: number
          holiday_pay?: number
          id?: string
          net?: number
          note?: string | null
          ot_hours?: number
          ot_pay?: number
          pay_class: Database["public"]["Enums"]["pay_class"]
          period_id: string
          profile_id: string
          regular_hours?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          tax?: number
          weekend_hours?: number
          weekend_pay?: number
        }
        Update: {
          allowances?: number
          base_pay?: number
          base_rate?: number
          breakdown?: Json
          computed_at?: string
          days_absent?: number
          days_leave?: number
          days_present?: number
          deductions?: number
          gross?: number
          holiday_hours?: number
          holiday_pay?: number
          id?: string
          net?: number
          note?: string | null
          ot_hours?: number
          ot_pay?: number
          pay_class?: Database["public"]["Enums"]["pay_class"]
          period_id?: string
          profile_id?: string
          regular_hours?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          tax?: number
          weekend_hours?: number
          weekend_pay?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payroll_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          budget: number
          calculated_at: string | null
          created_at: string
          created_by: string | null
          headcount: number
          id: string
          label: string
          locked: boolean
          paid_at: string | null
          period_end: string
          period_start: string
          site_id: string
          status: Database["public"]["Enums"]["payroll_status"]
          total_deductions: number
          total_gross: number
          total_net: number
          total_tax: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          budget?: number
          calculated_at?: string | null
          created_at?: string
          created_by?: string | null
          headcount?: number
          id?: string
          label: string
          locked?: boolean
          paid_at?: string | null
          period_end: string
          period_start: string
          site_id: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          total_tax?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          budget?: number
          calculated_at?: string | null
          created_at?: string
          created_by?: string | null
          headcount?: number
          id?: string
          label?: string
          locked?: boolean
          paid_at?: string | null
          period_end?: string
          period_start?: string
          site_id?: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          total_tax?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payroll_periods_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payroll_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          id: string
          issued_at: string
          issued_by: string | null
          payroll_item_id: string
          period_id: string
          profile_id: string
          reference: string
          snapshot: Json
        }
        Insert: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          payroll_item_id: string
          period_id: string
          profile_id: string
          reference: string
          snapshot: Json
        }
        Update: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          payroll_item_id?: string
          period_id?: string
          profile_id?: string
          reference?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payslips_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payslips_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: true
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payslips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          description: string | null
          id: string
          key: string
          label: string
          module: string
        }
        Insert: {
          action: string
          description?: string | null
          id?: string
          key: string
          label: string
          module: string
        }
        Update: {
          action?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      profile_pay_components: {
        Row: {
          amount: number
          code: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          kind: Database["public"]["Enums"]["component_kind"]
          label: string
          note: string | null
          profile_id: string
        }
        Insert: {
          amount?: number
          code: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          kind: Database["public"]["Enums"]["component_kind"]
          label: string
          note?: string | null
          profile_id: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["component_kind"]
          label?: string
          note?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_pay_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_pay_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_pay_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_pay_components_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_pay_components_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profile_pay_components_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cnic: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          duty_hours: number
          email: string | null
          employee_code: string
          flexible_hours: boolean
          full_name: string
          holiday_hourly_rate: number | null
          hourly_rate: number
          id: string
          joined_on: string
          left_on: string | null
          manager_id: string | null
          monthly_salary: number
          ot_hourly_rate: number | null
          overtime_eligible: boolean
          pay_class: Database["public"]["Enums"]["pay_class"]
          phone: string | null
          photo_url: string | null
          pin_hash: string | null
          requires_attendance: boolean
          roles_changed_at: string
          shift_id: string | null
          site_id: string | null
          status: Database["public"]["Enums"]["employment_status"]
          sunday_policy: Database["public"]["Enums"]["sunday_policy"]
          updated_at: string
          weekend_hourly_rate: number | null
          worker_type: Database["public"]["Enums"]["worker_type"]
        }
        Insert: {
          cnic?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          duty_hours?: number
          email?: string | null
          employee_code: string
          flexible_hours?: boolean
          full_name: string
          holiday_hourly_rate?: number | null
          hourly_rate?: number
          id: string
          joined_on?: string
          left_on?: string | null
          manager_id?: string | null
          monthly_salary?: number
          ot_hourly_rate?: number | null
          overtime_eligible?: boolean
          pay_class?: Database["public"]["Enums"]["pay_class"]
          phone?: string | null
          photo_url?: string | null
          pin_hash?: string | null
          requires_attendance?: boolean
          roles_changed_at?: string
          shift_id?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["employment_status"]
          sunday_policy?: Database["public"]["Enums"]["sunday_policy"]
          updated_at?: string
          weekend_hourly_rate?: number | null
          worker_type?: Database["public"]["Enums"]["worker_type"]
        }
        Update: {
          cnic?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          duty_hours?: number
          email?: string | null
          employee_code?: string
          flexible_hours?: boolean
          full_name?: string
          holiday_hourly_rate?: number | null
          hourly_rate?: number
          id?: string
          joined_on?: string
          left_on?: string | null
          manager_id?: string | null
          monthly_salary?: number
          ot_hourly_rate?: number | null
          overtime_eligible?: boolean
          pay_class?: Database["public"]["Enums"]["pay_class"]
          phone?: string | null
          photo_url?: string | null
          pin_hash?: string | null
          requires_attendance?: boolean
          roles_changed_at?: string
          shift_id?: string | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["employment_status"]
          sunday_policy?: Database["public"]["Enums"]["sunday_policy"]
          updated_at?: string
          weekend_hourly_rate?: number | null
          worker_type?: Database["public"]["Enums"]["worker_type"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      punches: {
        Row: {
          created_at: string
          device_id: string | null
          device_user_id: string | null
          direction: Database["public"]["Enums"]["punch_direction"]
          id: number
          profile_id: string | null
          punched_at: string
          raw: Json | null
          recorded_by: string | null
          source: Database["public"]["Enums"]["punch_source"]
          verify_mode: string | null
          work_date: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          device_user_id?: string | null
          direction?: Database["public"]["Enums"]["punch_direction"]
          id?: number
          profile_id?: string | null
          punched_at: string
          raw?: Json | null
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["punch_source"]
          verify_mode?: string | null
          work_date: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          device_user_id?: string | null
          direction?: Database["public"]["Enums"]["punch_direction"]
          id?: number
          profile_id?: string | null
          punched_at?: string
          raw?: Json | null
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["punch_source"]
          verify_mode?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "punches_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "punches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punches_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "punches_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_superuser: boolean
          is_system: boolean
          key: string
          name: string
          rank: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_superuser?: boolean
          is_system?: boolean
          key: string
          name: string
          rank?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_superuser?: boolean
          is_system?: boolean
          key?: string
          name?: string
          rank?: number
        }
        Relationships: []
      }
      shifts: {
        Row: {
          break_minutes: number
          code: string
          created_at: string
          ends_at: string
          grace_minutes: number
          id: string
          is_active: boolean
          name: string
          site_id: string
          sort_order: number
          starts_at: string
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          code: string
          created_at?: string
          ends_at: string
          grace_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          site_id: string
          sort_order?: number
          starts_at: string
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          code?: string
          created_at?: string
          ends_at?: string
          grace_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          site_id?: string
          sort_order?: number
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_permission_overrides: {
        Row: {
          effect: Database["public"]["Enums"]["permission_effect"]
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          permission_id: string
          reason: string | null
          site_id: string | null
          user_id: string
        }
        Insert: {
          effect: Database["public"]["Enums"]["permission_effect"]
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission_id: string
          reason?: string | null
          site_id?: string | null
          user_id: string
        }
        Update: {
          effect?: Database["public"]["Enums"]["permission_effect"]
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission_id?: string
          reason?: string | null
          site_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role_id: string
          site_id: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id: string
          site_id?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role_id?: string
          site_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_week: {
        Row: {
          is_working: boolean
          site_id: string
          weekday: number
        }
        Insert: {
          is_working?: boolean
          site_id: string
          weekday: number
        }
        Update: {
          is_working?: boolean
          site_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_week_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employee_directory: {
        Row: {
          department_id: string | null
          designation: string | null
          employee_code: string | null
          full_name: string | null
          id: string | null
          joined_on: string | null
          manager_id: string | null
          pay_class: Database["public"]["Enums"]["pay_class"] | null
          photo_url: string | null
          requires_attendance: boolean | null
          site_id: string | null
          status: Database["public"]["Enums"]["employment_status"] | null
        }
        Insert: {
          department_id?: string | null
          designation?: string | null
          employee_code?: string | null
          full_name?: string | null
          id?: string | null
          joined_on?: string | null
          manager_id?: string | null
          pay_class?: Database["public"]["Enums"]["pay_class"] | null
          photo_url?: string | null
          requires_attendance?: boolean | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["employment_status"] | null
        }
        Update: {
          department_id?: string | null
          designation?: string | null
          employee_code?: string | null
          full_name?: string | null
          id?: string | null
          joined_on?: string | null
          manager_id?: string | null
          pay_class?: Database["public"]["Enums"]["pay_class"] | null
          photo_url?: string | null
          requires_attendance?: boolean | null
          site_id?: string | null
          status?: Database["public"]["Enums"]["employment_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employee_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "live_attendance"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      live_attendance: {
        Row: {
          department_id: string | null
          employee_code: string | null
          first_in: string | null
          full_name: string | null
          is_late: boolean | null
          last_out: string | null
          live_status: string | null
          minutes_late: number | null
          profile_id: string | null
          regular_hours: number | null
          shift_ends_at: string | null
          shift_id: string | null
          shift_name: string | null
          shift_starts_at: string | null
          site_id: string | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      my_permissions: { Args: never; Returns: string[] }
      my_roles: {
        Args: never
        Returns: {
          is_superuser: boolean
          key: string
          name: string
          rank: number
        }[]
      }
    }
    Enums: {
      attendance_status:
        | "present"
        | "absent"
        | "leave"
        | "holiday"
        | "off"
        | "partial"
        | "pending"
      component_calc: "fixed" | "percent" | "slab" | "formula"
      component_kind: "earning" | "deduction" | "tax"
      day_type:
        | "workday"
        | "off"
        | "holiday"
        | "weekend_working"
        | "special_working"
      device_mode: "push" | "pull"
      device_status: "online" | "offline" | "unknown" | "disabled"
      employment_status: "active" | "suspended" | "terminated"
      pay_class: "monthly" | "hourly"
      payroll_status:
        | "draft"
        | "calculating"
        | "review"
        | "approved"
        | "paid"
        | "cancelled"
      penalty_basis: "day" | "month"
      permission_effect: "grant" | "deny"
      punch_direction: "in" | "out" | "unknown"
      punch_source: "device" | "manual" | "import"
      request_status: "pending" | "approved" | "rejected" | "cancelled"
      sunday_policy: "off" | "optional" | "compulsory" | "adjust_in_leave"
      worker_type: "employee" | "contractor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attendance_status: [
        "present",
        "absent",
        "leave",
        "holiday",
        "off",
        "partial",
        "pending",
      ],
      component_calc: ["fixed", "percent", "slab", "formula"],
      component_kind: ["earning", "deduction", "tax"],
      day_type: [
        "workday",
        "off",
        "holiday",
        "weekend_working",
        "special_working",
      ],
      device_mode: ["push", "pull"],
      device_status: ["online", "offline", "unknown", "disabled"],
      employment_status: ["active", "suspended", "terminated"],
      pay_class: ["monthly", "hourly"],
      payroll_status: [
        "draft",
        "calculating",
        "review",
        "approved",
        "paid",
        "cancelled",
      ],
      penalty_basis: ["day", "month"],
      permission_effect: ["grant", "deny"],
      punch_direction: ["in", "out", "unknown"],
      punch_source: ["device", "manual", "import"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      sunday_policy: ["off", "optional", "compulsory", "adjust_in_leave"],
      worker_type: ["employee", "contractor"],
    },
  },
} as const

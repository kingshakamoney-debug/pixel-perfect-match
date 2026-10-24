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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      draw_results: {
        Row: {
          correction_reason: string | null
          created_at: string
          draw_id: string
          id: string
          source_url: string | null
          status: string
          submitted_by: string | null
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          correction_reason?: string | null
          created_at?: string
          draw_id: string
          id?: string
          source_url?: string | null
          status?: string
          submitted_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          correction_reason?: string | null
          created_at?: string
          draw_id?: string
          id?: string
          source_url?: string | null
          status?: string
          submitted_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "draw_results_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "draws"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_schedules: {
        Row: {
          effective_from: string
          effective_until: string | null
          game_id: string
          id: string
          local_draw_time: string
          recurrence_config: Json
          status: string
          timezone: string
        }
        Insert: {
          effective_from?: string
          effective_until?: string | null
          game_id: string
          id?: string
          local_draw_time: string
          recurrence_config?: Json
          status?: string
          timezone: string
        }
        Update: {
          effective_from?: string
          effective_until?: string | null
          game_id?: string
          id?: string
          local_draw_time?: string
          recurrence_config?: Json
          status?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_schedules_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      draws: {
        Row: {
          created_at: string
          draw_status: string
          game_id: string
          id: string
          publication_cutoff_at: string
          result_verified_at: string | null
          scheduled_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draw_status?: string
          game_id: string
          id?: string
          publication_cutoff_at: string
          result_verified_at?: string | null
          scheduled_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draw_status?: string
          game_id?: string
          id?: string
          publication_cutoff_at?: string
          result_verified_at?: string | null
          scheduled_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draws_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_combinations: {
        Row: {
          combination_number: number
          created_at: string
          forecast_id: string
          id: string
        }
        Insert: {
          combination_number: number
          created_at?: string
          forecast_id: string
          id?: string
        }
        Update: {
          combination_number?: number
          created_at?: string
          forecast_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_combinations_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_numbers: {
        Row: {
          combination_id: string
          id: string
          number_type: string
          number_value: number
        }
        Insert: {
          combination_id: string
          id?: string
          number_type?: string
          number_value: number
        }
        Update: {
          combination_id?: string
          id?: string
          number_type?: string
          number_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_numbers_combination_id_fkey"
            columns: ["combination_id"]
            isOneToOne: false
            referencedRelation: "forecast_combinations"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_scores: {
        Row: {
          classification: string
          combination_id: string
          forecast_id: string
          hit_count: number
          id: string
          is_success: boolean
          result_id: string
          scored_at: string
          scoring_version: number
        }
        Insert: {
          classification: string
          combination_id: string
          forecast_id: string
          hit_count: number
          id?: string
          is_success: boolean
          result_id: string
          scored_at?: string
          scoring_version?: number
        }
        Update: {
          classification?: string
          combination_id?: string
          forecast_id?: string
          hit_count?: number
          id?: string
          is_success?: boolean
          result_id?: string
          scored_at?: string
          scoring_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_scores_combination_id_fkey"
            columns: ["combination_id"]
            isOneToOne: false
            referencedRelation: "forecast_combinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_scores_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_scores_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "draw_results"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          correction_reason: string | null
          created_at: string
          created_by: string | null
          cutoff_at: string | null
          draw_id: string
          forecast_type: string
          id: string
          publish_at: string | null
          published_at: string | null
          published_by: string | null
          status: string
          supersedes_forecast_id: string | null
          version: number
        }
        Insert: {
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_at?: string | null
          draw_id: string
          forecast_type: string
          id?: string
          publish_at?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          supersedes_forecast_id?: string | null
          version?: number
        }
        Update: {
          correction_reason?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_at?: string | null
          draw_id?: string
          forecast_type?: string
          id?: string
          publish_at?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          supersedes_forecast_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_draw_id_fkey"
            columns: ["draw_id"]
            isOneToOne: false
            referencedRelation: "draws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecasts_supersedes_forecast_id_fkey"
            columns: ["supersedes_forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          bonus_number_rules: Json | null
          created_at: string
          id: string
          max_number: number
          min_match_threshold: number
          min_number: number
          name: string
          numbers_drawn: number
          numbers_per_combination: number
          provider_id: string
          slug: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          bonus_number_rules?: Json | null
          created_at?: string
          id?: string
          max_number: number
          min_match_threshold?: number
          min_number?: number
          name: string
          numbers_drawn: number
          numbers_per_combination: number
          provider_id: string
          slug: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          bonus_number_rules?: Json | null
          created_at?: string
          id?: string
          max_number?: number
          min_match_threshold?: number
          min_number?: number
          name?: string
          numbers_drawn?: number
          numbers_per_combination?: number
          provider_id?: string
          slug?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_type: string
          id: string
          processed_at: string | null
          processing_status: string
          provider_event_id: string
          provider_name: string
          received_at: string
        }
        Insert: {
          event_type: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          provider_event_id: string
          provider_name: string
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          processed_at?: string | null
          processing_status?: string
          provider_event_id?: string
          provider_name?: string
          received_at?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          claimed_amount: number
          created_at: string
          currency: string
          description: string | null
          granted_months: number | null
          id: string
          plan_id: string | null
          receipt_path: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transfer_date: string
          transfer_reference: string
          user_id: string
          verified_amount: number | null
          verified_currency: string | null
          verified_reference: string | null
        }
        Insert: {
          claimed_amount: number
          created_at?: string
          currency?: string
          description?: string | null
          granted_months?: number | null
          id?: string
          plan_id?: string | null
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transfer_date: string
          transfer_reference: string
          user_id: string
          verified_amount?: number | null
          verified_currency?: string | null
          verified_reference?: string | null
        }
        Update: {
          claimed_amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          granted_months?: number | null
          id?: string
          plan_id?: string | null
          receipt_path?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transfer_date?: string
          transfer_reference?: string
          user_id?: string
          verified_amount?: number | null
          verified_currency?: string | null
          verified_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          id: number
          instructions: string
          reminder_days: number[]
          updated_at: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          bank_name?: string
          id?: number
          instructions?: string
          reminder_days?: number[]
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          id?: number
          instructions?: string
          reminder_days?: number[]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: string
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: string
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          source_url: string | null
          status: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          source_url?: string | null
          status?: string
          timezone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          source_url?: string | null
          status?: string
          timezone?: string
        }
        Relationships: []
      }
      reminder_logs: {
        Row: {
          created_at: string
          days_before: number
          expires_at: string
          id: string
          reminder_key: string
          status: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          days_before: number
          expires_at: string
          id?: string
          reminder_key: string
          status?: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          days_before?: number
          expires_at?: string
          id?: string
          reminder_key?: string
          status?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      result_numbers: {
        Row: {
          id: string
          number_type: string
          number_value: number
          result_id: string
        }
        Insert: {
          id?: string
          number_type?: string
          number_value: number
          result_id: string
        }
        Update: {
          id?: string
          number_type?: string
          number_value?: number
          result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "result_numbers_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "draw_results"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          duration_months: number
          id: string
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          duration_months: number
          id?: string
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          duration_months?: number
          id?: string
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_code: string | null
          provider_customer_reference: string | null
          provider_name: string
          provider_subscription_reference: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_code?: string | null
          provider_customer_reference?: string | null
          provider_name?: string
          provider_subscription_reference?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_code?: string | null
          provider_customer_reference?: string | null
          provider_name?: string
          provider_subscription_reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trial_grants: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          starts_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          starts_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          starts_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_payment: {
        Args: {
          _currency: string
          _months: number
          _reference: string
          _request_id: string
          _verified_amount: number
        }
        Returns: undefined
      }
      bootstrap_admin: { Args: never; Returns: boolean }
      can_view_forecast_numbers: {
        Args: { _forecast_id: string }
        Returns: boolean
      }
      create_forecast_correction: {
        Args: { _forecast_id: string; _reason: string }
        Returns: string
      }
      get_entitlement: {
        Args: { _user_id: string }
        Returns: {
          allowed: boolean
          expires_at: string
          reason: string
        }[]
      }
      has_premium: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      publish_forecast: { Args: { _forecast_id: string }; Returns: undefined }
      reject_payment: {
        Args: { _reason: string; _request_id: string }
        Returns: undefined
      }
      score_result: { Args: { _result_id: string }; Returns: number }
      verify_result: { Args: { _result_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "member"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
    },
  },
} as const

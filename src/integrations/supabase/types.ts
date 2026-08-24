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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      client_users: {
        Row: {
          client_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          cedula: string | null
          city: string | null
          created_at: string
          email: string | null
          external_source: string | null
          full_name: string
          id: string
          IdContactKommo: string | null
          is_active: boolean
          is_fleet: boolean
          is_manual: boolean
          kommo_conversation_lead_id: number | null
          phone: string | null
          profile_id: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cedula?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          external_source?: string | null
          full_name: string
          id?: string
          IdContactKommo?: string | null
          is_active?: boolean
          is_fleet?: boolean
          is_manual?: boolean
          kommo_conversation_lead_id?: number | null
          phone?: string | null
          profile_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cedula?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          external_source?: string | null
          full_name?: string
          id?: string
          IdContactKommo?: string | null
          is_active?: boolean
          is_fleet?: boolean
          is_manual?: boolean
          kommo_conversation_lead_id?: number | null
          phone?: string | null
          profile_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_layout_prefs: {
        Row: {
          chart_key: string
          profile_id: string
          sort_order: number
          updated_at: string
          view_type: string
        }
        Insert: {
          chart_key: string
          profile_id: string
          sort_order?: number
          updated_at?: string
          view_type?: string
        }
        Update: {
          chart_key?: string
          profile_id?: string
          sort_order?: number
          updated_at?: string
          view_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layout_prefs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          aggregation: string
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          filters: Json
          group_by: string | null
          icon: string | null
          id: string
          is_active: boolean
          size: string
          sort_order: number
          source_table: string
          title: string
          updated_at: string
          widget_type: string
        }
        Insert: {
          aggregation?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          group_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          size?: string
          sort_order?: number
          source_table: string
          title: string
          updated_at?: string
          widget_type: string
        }
        Update: {
          aggregation?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json
          group_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          size?: string
          sort_order?: number
          source_table?: string
          title?: string
          updated_at?: string
          widget_type?: string
        }
        Relationships: []
      }
      dealership_users: {
        Row: {
          created_at: string
          dealership_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          dealership_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          dealership_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealership_users_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealership_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dealerships: {
        Row: {
          address: string | null
          bays: number | null
          brand: string[]
          city: string | null
          closing_hour: number
          created_at: string | null
          email: string | null
          google_maps_url: string | null
          id: string
          instagram: string | null
          is_active: boolean | null
          is_service_center: boolean
          kommo_concesionario_enum_id: number | null
          kommo_contact_id: number | null
          kommo_notification_lead_id: number | null
          name: string
          opening_hour: number
          phone: string | null
          schedule: string | null
          state: string | null
          type: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bays?: number | null
          brand?: string[]
          city?: string | null
          closing_hour?: number
          created_at?: string | null
          email?: string | null
          google_maps_url?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean | null
          is_service_center?: boolean
          kommo_concesionario_enum_id?: number | null
          kommo_contact_id?: number | null
          kommo_notification_lead_id?: number | null
          name: string
          opening_hour?: number
          phone?: string | null
          schedule?: string | null
          state?: string | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bays?: number | null
          brand?: string[]
          city?: string | null
          closing_hour?: number
          created_at?: string | null
          email?: string | null
          google_maps_url?: string | null
          id?: string
          instagram?: string | null
          is_active?: boolean | null
          is_service_center?: boolean
          kommo_concesionario_enum_id?: number | null
          kommo_contact_id?: number | null
          kommo_notification_lead_id?: number | null
          name?: string
          opening_hour?: number
          phone?: string | null
          schedule?: string | null
          state?: string | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          cedula: string | null
          client_id: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          cedula?: string | null
          client_id: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          cedula?: string | null
          client_id?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      external_portal_attempts: {
        Row: {
          attempted_at: string
          id: number
          plate: string
        }
        Insert: {
          attempted_at?: string
          id?: number
          plate: string
        }
        Update: {
          attempted_at?: string
          id?: number
          plate?: string
        }
        Relationships: []
      }
      external_portal_sessions: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          config: Json
          created_at: string
          id: string
          integration_name: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          integration_name: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          integration_name?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          integration_name: string
          kommo_lead_id: number | null
          prospect_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          integration_name: string
          kommo_lead_id?: number | null
          prospect_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          integration_name?: string
          kommo_lead_id?: number | null
          prospect_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          id: string
          identifier: string | null
          ip: string | null
          kind: string
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          identifier?: string | null
          ip?: string | null
          kind: string
          success?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string | null
          ip?: string | null
          kind?: string
          success?: boolean
        }
        Relationships: []
      }
      magic_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          token?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          content: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          template_key: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          template_key: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          recipient_dealership_id: string | null
          recipient_profile_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          recipient_dealership_id?: string | null
          recipient_profile_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          recipient_dealership_id?: string | null
          recipient_profile_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_dealership_id_fkey"
            columns: ["recipient_dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_profile_id_fkey"
            columns: ["recipient_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          module: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          module: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          module?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          pin_code: string | null
          role_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          pin_code?: string | null
          role_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          pin_code?: string | null
          role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_events: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      prospect_loss_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kommo_loss_reason_id: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kommo_loss_reason_id: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kommo_loss_reason_id?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      prospect_models: {
        Row: {
          brand: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      prospect_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      prospect_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      prospect_updates: {
        Row: {
          content: string | null
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          mentions: string[] | null
          parent_id: string | null
          prospect_id: string
          type: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          mentions?: string[] | null
          parent_id?: string | null
          prospect_id: string
          type?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          mentions?: string[] | null
          parent_id?: string | null
          prospect_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_updates_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "prospect_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_updates_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_updates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_vehicles: {
        Row: {
          brand: string | null
          created_at: string
          id: string
          model: string | null
          plate: string | null
          prospect_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          id?: string
          model?: string | null
          plate?: string | null
          prospect_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          id?: string
          model?: string | null
          plate?: string | null
          prospect_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_vehicles_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          age_range: string | null
          cedula: string | null
          client_id: string | null
          company_name: string | null
          created_at: string
          dealership_id: string | null
          email: string | null
          "Estado de Vnzla": string | null
          event_name: string | null
          gender: string | null
          id: string
          IdLeadkommo: string | null
          is_fleet: boolean
          kommo_lead_id: number | null
          loss_reason: string | null
          loss_reason_id: number | null
          model_interest: string | null
          name: string
          notes: string | null
          payment_modality: string | null
          person_type: string | null
          phone: string | null
          salesperson: string | null
          sold_plate: string | null
          source: string
          status: string
          status_updated_at: string | null
          test_drive: boolean
          updated_at: string
          visited_showroom: boolean
        }
        Insert: {
          age_range?: string | null
          cedula?: string | null
          client_id?: string | null
          company_name?: string | null
          created_at?: string
          dealership_id?: string | null
          email?: string | null
          "Estado de Vnzla"?: string | null
          event_name?: string | null
          gender?: string | null
          id?: string
          IdLeadkommo?: string | null
          is_fleet?: boolean
          kommo_lead_id?: number | null
          loss_reason?: string | null
          loss_reason_id?: number | null
          model_interest?: string | null
          name: string
          notes?: string | null
          payment_modality?: string | null
          person_type?: string | null
          phone?: string | null
          salesperson?: string | null
          sold_plate?: string | null
          source?: string
          status?: string
          status_updated_at?: string | null
          test_drive?: boolean
          updated_at?: string
          visited_showroom?: boolean
        }
        Update: {
          age_range?: string | null
          cedula?: string | null
          client_id?: string | null
          company_name?: string | null
          created_at?: string
          dealership_id?: string | null
          email?: string | null
          "Estado de Vnzla"?: string | null
          event_name?: string | null
          gender?: string | null
          id?: string
          IdLeadkommo?: string | null
          is_fleet?: boolean
          kommo_lead_id?: number | null
          loss_reason?: string | null
          loss_reason_id?: number | null
          model_interest?: string | null
          name?: string
          notes?: string | null
          payment_modality?: string | null
          person_type?: string | null
          phone?: string | null
          salesperson?: string | null
          sold_plate?: string | null
          source?: string
          status?: string
          status_updated_at?: string | null
          test_drive?: boolean
          updated_at?: string
          visited_showroom?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prospects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_settings: {
        Row: {
          id: boolean
          open_reservations_enabled: boolean
          open_reservations_hour: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          open_reservations_enabled?: boolean
          open_reservations_hour?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          open_reservations_enabled?: boolean
          open_reservations_hour?: number
          updated_at?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cancellation_reason: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by_name: string | null
          created_by_profile_id: string | null
          created_by_role: string | null
          current_mileage: number | null
          dealership_id: string
          dealership_notified_at: string | null
          id: string
          IdLeadkommo: string | null
          internal_notes: string | null
          kommo_lead_id: number | null
          notes: string | null
          recommendation: string | null
          reservation_date: string
          reservation_time: string
          satisfaction_rating: number | null
          service_notes: string | null
          service_type: string
          state: string | null
          status: string
          technical_report_url: string | null
          updated_at: string | null
          vehicle_id: string | null
          walkin_client_name: string | null
          walkin_client_phone: string | null
          walkin_plate: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_profile_id?: string | null
          created_by_role?: string | null
          current_mileage?: number | null
          dealership_id: string
          dealership_notified_at?: string | null
          id?: string
          IdLeadkommo?: string | null
          internal_notes?: string | null
          kommo_lead_id?: number | null
          notes?: string | null
          recommendation?: string | null
          reservation_date: string
          reservation_time: string
          satisfaction_rating?: number | null
          service_notes?: string | null
          service_type: string
          state?: string | null
          status?: string
          technical_report_url?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          walkin_client_name?: string | null
          walkin_client_phone?: string | null
          walkin_plate?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_profile_id?: string | null
          created_by_role?: string | null
          current_mileage?: number | null
          dealership_id?: string
          dealership_notified_at?: string | null
          id?: string
          IdLeadkommo?: string | null
          internal_notes?: string | null
          kommo_lead_id?: number | null
          notes?: string | null
          recommendation?: string | null
          reservation_date?: string
          reservation_time?: string
          satisfaction_rating?: number | null
          service_notes?: string | null
          service_type?: string
          state?: string | null
          status?: string
          technical_report_url?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
          walkin_client_name?: string | null
          walkin_client_phone?: string | null
          walkin_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_module_scopes: {
        Row: {
          module: string
          role_id: string
          scope: string
        }
        Insert: {
          module: string
          role_id: string
          scope?: string
        }
        Update: {
          module?: string
          role_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_module_scopes_role_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          name: string
          redirect_portal: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          redirect_portal?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          redirect_portal?: string
        }
        Relationships: []
      }
      salespersons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salespersons_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      satisfaction_responses: {
        Row: {
          comment: string | null
          created_at: string
          has_low_score: boolean | null
          id: string
          nps_recomienda: boolean
          overall_score: number | null
          q_atencion_digital: number
          q_bienvenida_presencial: number
          q_experiencia_entrega: number
          q_financiamiento_tramites: number
          q_negociacion_asesoria: number
          survey_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          has_low_score?: boolean | null
          id?: string
          nps_recomienda: boolean
          overall_score?: number | null
          q_atencion_digital: number
          q_bienvenida_presencial: number
          q_experiencia_entrega: number
          q_financiamiento_tramites: number
          q_negociacion_asesoria: number
          survey_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          has_low_score?: boolean | null
          id?: string
          nps_recomienda?: boolean
          overall_score?: number | null
          q_atencion_digital?: number
          q_bienvenida_presencial?: number
          q_experiencia_entrega?: number
          q_financiamiento_tramites?: number
          q_negociacion_asesoria?: number
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "satisfaction_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "satisfaction_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      satisfaction_surveys: {
        Row: {
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          created_at: string
          dealership_id: string | null
          delivered_at: string | null
          dispatch_attempts: number
          eligible_at: string
          id: string
          kommo_lead_id: number | null
          last_dispatch_at: string | null
          origin: string
          prospect_id: string | null
          reservation_id: string | null
          responded_at: string | null
          salesperson: string | null
          sent_at: string | null
          sold_plate: string | null
          status: string
          suppressed_reason: string | null
          token: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          dealership_id?: string | null
          delivered_at?: string | null
          dispatch_attempts?: number
          eligible_at: string
          id?: string
          kommo_lead_id?: number | null
          last_dispatch_at?: string | null
          origin?: string
          prospect_id?: string | null
          reservation_id?: string | null
          responded_at?: string | null
          salesperson?: string | null
          sent_at?: string | null
          sold_plate?: string | null
          status?: string
          suppressed_reason?: string | null
          token?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          created_at?: string
          dealership_id?: string | null
          delivered_at?: string | null
          dispatch_attempts?: number
          eligible_at?: string
          id?: string
          kommo_lead_id?: number | null
          last_dispatch_at?: string | null
          origin?: string
          prospect_id?: string | null
          reservation_id?: string | null
          responded_at?: string | null
          salesperson?: string | null
          sent_at?: string | null
          sold_plate?: string | null
          status?: string
          suppressed_reason?: string | null
          token?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "satisfaction_surveys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_surveys_dealership_id_fkey"
            columns: ["dealership_id"]
            isOneToOne: false
            referencedRelation: "dealerships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_surveys_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_surveys_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satisfaction_surveys_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_survey_responses: {
        Row: {
          comment: string | null
          created_at: string
          has_low_score: boolean | null
          id: string
          legacy_answers: Json | null
          overall_score: number | null
          q_conclusion_tecnica: string | null
          q_explicacion_tecnica: string | null
          q_garantia_repuestos: string | null
          q_informe_tecnico: string | null
          q_limpieza_entrega: string | null
          q_precio_mano_obra: string | null
          q_presentacion_equipo: string | null
          q_recepcion_imagen: string | null
          survey_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          has_low_score?: boolean | null
          id?: string
          legacy_answers?: Json | null
          overall_score?: number | null
          q_conclusion_tecnica?: string | null
          q_explicacion_tecnica?: string | null
          q_garantia_repuestos?: string | null
          q_informe_tecnico?: string | null
          q_limpieza_entrega?: string | null
          q_precio_mano_obra?: string | null
          q_presentacion_equipo?: string | null
          q_recepcion_imagen?: string | null
          survey_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          has_low_score?: boolean | null
          id?: string
          legacy_answers?: Json | null
          overall_score?: number | null
          q_conclusion_tecnica?: string | null
          q_explicacion_tecnica?: string | null
          q_garantia_repuestos?: string | null
          q_informe_tecnico?: string | null
          q_limpieza_entrega?: string | null
          q_precio_mano_obra?: string | null
          q_presentacion_equipo?: string | null
          q_recepcion_imagen?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "satisfaction_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          created_at: string
          duration_minutes: number
          id: number
          is_active: boolean
          is_internal: boolean
          name: string
          requires_description: boolean
          sends_postventa_survey: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: never
          is_active?: boolean
          is_internal?: boolean
          name: string
          requires_description?: boolean
          sends_postventa_survey?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: never
          is_active?: boolean
          is_internal?: boolean
          name?: string
          requires_description?: boolean
          sends_postventa_survey?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          permission_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_models: {
        Row: {
          brand: string
          created_at: string
          engine: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_manual: boolean
          name: string
          transmission: string | null
          warranty_condition_id: number | null
          warranty_km: number | null
          warranty_months: number | null
          warranty_service_interval_km: number | null
          year: number | null
        }
        Insert: {
          brand?: string
          created_at?: string
          engine?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_manual?: boolean
          name: string
          transmission?: string | null
          warranty_condition_id?: number | null
          warranty_km?: number | null
          warranty_months?: number | null
          warranty_service_interval_km?: number | null
          year?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          engine?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_manual?: boolean
          name?: string
          transmission?: string | null
          warranty_condition_id?: number | null
          warranty_km?: number | null
          warranty_months?: number | null
          warranty_service_interval_km?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_warranty_condition_id_fkey"
            columns: ["warranty_condition_id"]
            isOneToOne: false
            referencedRelation: "warranty_conditions"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          client_id: string
          color: string | null
          created_at: string
          driver_id: string | null
          id: string
          is_active: boolean
          is_manual: boolean
          mileage: number
          model_id: string
          plate: string | null
          purchase_date: string | null
          updated_at: string
          vin: string | null
          warranty_active: boolean
          year: number
        }
        Insert: {
          client_id: string
          color?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          is_manual?: boolean
          mileage?: number
          model_id: string
          plate?: string | null
          purchase_date?: string | null
          updated_at?: string
          vin?: string | null
          warranty_active?: boolean
          year: number
        }
        Update: {
          client_id?: string
          color?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          is_manual?: boolean
          mileage?: number
          model_id?: string
          plate?: string | null
          purchase_date?: string | null
          updated_at?: string
          vin?: string | null
          warranty_active?: boolean
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_conditions: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          max_km: number
          max_months: number
          name: string
          service_interval_km: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          max_km: number
          max_months: number
          name: string
          service_interval_km?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: never
          is_active?: boolean
          max_km?: number
          max_months?: number
          name?: string
          service_interval_km?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_duplicate_clients: {
        Row: {
          cedula: string | null
          created_at: string | null
          dup_count: number | null
          dup_key: string | null
          dup_value: string | null
          full_name: string | null
          id: string | null
          kommo_conversation_lead_id: number | null
          phone: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_vehicle_driver: {
        Args: { p_driver_id: string; p_vehicle_id: string }
        Returns: undefined
      }
      backfill_satisfaction_surveys: { Args: never; Returns: number }
      can_access_prospect: { Args: { p_prospect_id: string }; Returns: boolean }
      create_public_reservation: {
        Args: {
          p_date: string
          p_dealership_id: string
          p_mileage: number
          p_notes: string
          p_plate: string
          p_service_type: string
          p_time: string
        }
        Returns: string
      }
      current_user_client_ids: { Args: never; Returns: string[] }
      current_user_dealership_ids: { Args: never; Returns: string[] }
      current_user_salesperson_names: { Args: never; Returns: string[] }
      dealership_salesperson_names: {
        Args: { p_dealership_id: string }
        Returns: {
          name: string
        }[]
      }
      ensure_sales_survey: {
        Args: { p_client_id: string }
        Returns: {
          reason: string
          survey_id: string
        }[]
      }
      ensure_service_survey: {
        Args: { p_reservation_id: string }
        Returns: {
          reason: string
          survey_id: string
        }[]
      }
      external_portal_client: { Args: { p_token: string }; Returns: string }
      external_portal_fleet: {
        Args: { p_token: string }
        Returns: {
          color: string
          last_service_date: string
          mileage: number
          model_brand: string
          model_name: string
          plate: string
          services_count: number
          vehicle_id: string
          warranty_active: boolean
          year: number
        }[]
      }
      external_portal_history: {
        Args: { p_token: string; p_vehicle_id: string }
        Returns: {
          current_mileage: number
          dealership_name: string
          reservation_date: string
          reservation_time: string
          service_notes: string
          service_type: string
          status: string
        }[]
      }
      external_portal_login: {
        Args: { p_phone: string; p_plate: string }
        Returns: {
          client_name: string
          error_code: string
          expires_at: string
          token: string
        }[]
      }
      external_sources: {
        Args: never
        Returns: {
          clientes: number
          source: string
        }[]
      }
      find_prospects_by_phone: {
        Args: { p_phone: string }
        Returns: {
          dealership_id: string
          id: string
          name: string
          phone: string
          salesperson: string
          status: string
        }[]
      }
      fn_claim_survey_slot:
        | { Args: { p_client_id: string }; Returns: string }
        | { Args: { p_client_id: string; p_kind: string }; Returns: string }
      fn_dispatch_eligible_surveys: {
        Args: never
        Returns: {
          dispatched: number
          skipped_reason: string
        }[]
      }
      fn_notify_open_reservations: {
        Args: never
        Returns: {
          notified: number
          skipped_reason: string
        }[]
      }
      fn_resolve_or_create_client_for_prospect: {
        Args: { p_prospect_id: string }
        Returns: string
      }
      get_reminder_settings: {
        Args: never
        Returns: {
          open_reservations_enabled: boolean
          open_reservations_hour: number
        }[]
      }
      get_survey_by_token: {
        Args: { p_token: string }
        Returns: {
          already_responded: boolean
          brand: string
          client_name: string
          dealership_name: string
          origin: string
          plate: string
          service_type: string
          status: string
          survey_id: string
        }[]
      }
      get_survey_delivery_config: {
        Args: never
        Returns: {
          delivery_enabled: boolean
          sales_auto_send: boolean
          sales_enabled: boolean
          sales_ready: boolean
          service_auto_send: boolean
          service_enabled: boolean
          service_ready: boolean
          survey_base_url: string
          survey_link_field_id: string
          survey_link_field_id_service: string
          survey_stage_id: string
          survey_stage_id_service: string
        }[]
      }
      get_taken_reservation_times: {
        Args: { p_date: string; p_dealership_id: string }
        Returns: {
          reservation_time: string
          service_type: string
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      has_permission: { Args: { perm_name: string }; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_internal_service_type: {
        Args: { p_service_type: string }
        Returns: boolean
      }
      lookup_vehicle_by_plate: {
        Args: { p_plate: string }
        Returns: {
          client_id: string
          client_masked_name: string
          color: string
          mileage: number
          model_brand: string
          model_name: string
          plate: string
          vehicle_id: string
          warranty_active: boolean
          year: number
        }[]
      }
      mark_survey_sent: { Args: { p_survey_id: string }; Returns: undefined }
      normalize_external_source: { Args: { p_value: string }; Returns: string }
      notify_reservation_cancellation: {
        Args: { p_reservation_id: string }
        Returns: undefined
      }
      prospect_phone_exists: { Args: { p_phone: string }; Returns: boolean }
      register_client_repurchase: {
        Args: {
          p_client_id: string
          p_dealership_id?: string
          p_send_survey?: boolean
          p_vehicles?: Json
        }
        Returns: {
          suppressed_reason: string
          survey_id: string
          survey_token: string
          vehicles_created: number
        }[]
      }
      register_won_prospect: {
        Args: { p_is_fleet?: boolean; p_prospect_id: string; p_vehicles?: Json }
        Returns: {
          client_id: string
          suppressed_reason: string
          survey_id: string
          survey_token: string
          vehicles_created: number
        }[]
      }
      search_clients_page: {
        Args: {
          p_city?: string
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_source?: string
          p_status?: string
          p_warranty?: string
        }
        Returns: {
          client_id: string
          total_count: number
        }[]
      }
      set_client_external: {
        Args: { p_client_id: string; p_value: boolean }
        Returns: undefined
      }
      set_clients_external: {
        Args: { p_client_ids: string[]; p_value: boolean }
        Returns: number
      }
      set_open_reservations_reminder: {
        Args: { p_enabled: boolean; p_hour: number }
        Returns: boolean
      }
      set_postventa_survey_config: {
        Args: { p_link_field_id: string; p_stage_id: string }
        Returns: boolean
      }
      set_sales_survey_auto_send: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      set_sales_survey_enabled: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      set_service_survey_auto_send: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      set_service_survey_enabled: {
        Args: { p_enabled: boolean }
        Returns: boolean
      }
      staff_lookup_client_vehicles: {
        Args: { p_client_id: string }
        Returns: {
          client_cedula: string
          client_full_name: string
          client_id: string
          client_phone: string
          color: string
          model_brand: string
          model_name: string
          plate: string
          vehicle_id: string
          year: number
        }[]
      }
      staff_lookup_vehicle_by_plate: {
        Args: { p_plate: string }
        Returns: {
          client_cedula: string
          client_full_name: string
          client_id: string
          client_phone: string
          color: string
          mileage: number
          model_brand: string
          model_id: string
          model_name: string
          plate: string
          vehicle_id: string
          vin: string
          warranty_active: boolean
          year: number
        }[]
      }
      staff_resolve_client: {
        Args: { p_cedula: string; p_phone: string }
        Returns: string
      }
      staff_resolve_vehicle_by_plate: {
        Args: { p_plate: string }
        Returns: {
          client_id: string
          vehicle_id: string
        }[]
      }
      staff_search_clients: {
        Args: { p_query: string }
        Returns: {
          cedula: string
          client_id: string
          full_name: string
          is_manual: boolean
          phone: string
        }[]
      }
      staff_search_vehicles_by_plate: {
        Args: { p_query: string }
        Returns: {
          client_full_name: string
          client_id: string
          model_brand: string
          model_id: string
          model_name: string
          plate: string
          vehicle_id: string
          year: number
        }[]
      }
      submit_service_survey_response: {
        Args: {
          p_comment: string
          p_conclusion_tecnica: string
          p_explicacion_tecnica: string
          p_garantia_repuestos: string
          p_informe_tecnico: string
          p_limpieza_entrega: string
          p_precio_mano_obra: string
          p_presentacion_equipo: string
          p_recepcion_imagen: string
          p_token: string
        }
        Returns: string
      }
      submit_survey_response: {
        Args: {
          p_atencion_digital: number
          p_bienvenida_presencial: number
          p_comment: string
          p_experiencia_entrega: number
          p_financiamiento_tramites: number
          p_negociacion_asesoria: number
          p_nps: boolean
          p_token: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const

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
      bill_overrides: {
        Row: {
          amount: number | null
          bill_id: string
          hidden: boolean
          month: string
          status: string | null
        }
        Insert: {
          amount?: number | null
          bill_id: string
          hidden?: boolean
          month: string
          status?: string | null
        }
        Update: {
          amount?: number | null
          bill_id?: string
          hidden?: boolean
          month?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_overrides_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_splits: {
        Row: {
          bill_id: string
          id: string
          person_key: string
          type: string
          value: number
        }
        Insert: {
          bill_id: string
          id?: string
          person_key: string
          type?: string
          value?: number
        }
        Update: {
          bill_id?: string
          id?: string
          person_key?: string
          type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_splits_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          auto_pay: boolean
          base: number
          category: string
          due_day: number
          household_id: string
          id: string
          name: string
          position: number
        }
        Insert: {
          auto_pay?: boolean
          base?: number
          category: string
          due_day?: number
          household_id: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          auto_pay?: boolean
          base?: number
          category?: string
          due_day?: number
          household_id?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "bills_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      chores: {
        Row: {
          done: boolean
          household_id: string
          id: string
          member_key: string
          position: number
          title: string
          when_label: string
        }
        Insert: {
          done?: boolean
          household_id: string
          id?: string
          member_key: string
          position?: number
          title: string
          when_label?: string
        }
        Update: {
          done?: boolean
          household_id?: string
          id?: string
          member_key?: string
          position?: number
          title?: string
          when_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "chores_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          amount: number
          household_id: string
          id: string
          month: string
          note: string
          person_key: string
        }
        Insert: {
          amount?: number
          household_id: string
          id?: string
          month: string
          note?: string
          person_key: string
        }
        Update: {
          amount?: number
          household_id?: string
          id?: string
          month?: string
          note?: string
          person_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
          revoked: boolean
          token_hash: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
          revoked?: boolean
          token_hash: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          revoked?: boolean
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          date: string
          household_id: string
          id: string
          member_key: string
          note: string
          time: string
          title: string
        }
        Insert: {
          date: string
          household_id: string
          id?: string
          member_key: string
          note?: string
          time?: string
          title: string
        }
        Update: {
          date?: string
          household_id?: string
          id?: string
          member_key?: string
          note?: string
          time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_accounts: {
        Row: {
          created_at: string
          household_id: string
          member_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          member_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          member_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_by: string
          expires_at: string
          household_id: string
          member_name: string
          role: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_by: string
          expires_at: string
          household_id: string
          member_name: string
          role?: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          member_name?: string
          role?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          household_id: string
          id: string
          key: string
          name: string
          pin_hash: string
          role: string
        }
        Insert: {
          household_id: string
          id?: string
          key: string
          name: string
          pin_hash: string
          role?: string
        }
        Update: {
          household_id?: string
          id?: string
          key?: string
          name?: string
          pin_hash?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          household_id: string
          id: string
          member_key: string
          pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          household_id: string
          id?: string
          member_key: string
          pinned?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          household_id?: string
          id?: string
          member_key?: string
          pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      pairing_codes: {
        Row: {
          code: string
          expires_at: string
          household_id: string
          max_uses: number
          uses: number
        }
        Insert: {
          code: string
          expires_at: string
          household_id: string
          max_uses?: number
          uses?: number
        }
        Update: {
          code?: string
          expires_at?: string
          household_id?: string
          max_uses?: number
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "pairing_codes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_items: {
        Row: {
          done: boolean
          household_id: string
          id: string
          name: string
          position: number
        }
        Insert: {
          done?: boolean
          household_id: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          done?: boolean
          household_id?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household: {
        Args: { _member_name: string; _name: string; _pin: string }
        Returns: string
      }
      create_invite: {
        Args: { _member_name: string; _role: string }
        Returns: string
      }
      create_pairing_code: { Args: never; Returns: string }
      current_household_ids: { Args: never; Returns: string[] }
      household_members: {
        Args: never
        Returns: {
          key: string
          name: string
          role: string
        }[]
      }
      is_household_admin: { Args: { _household: string }; Returns: boolean }
      list_devices: {
        Args: never
        Returns: {
          created_at: string
          id: string
          name: string
          revoked: boolean
        }[]
      }
      my_context: {
        Args: never
        Returns: {
          household_id: string
          household_name: string
          member_key: string
          mode: string
        }[]
      }
      pair_device: { Args: { _code: string; _name: string }; Returns: string }
      redeem_invite: { Args: { _code: string; _pin: string }; Returns: string }
      revoke_device: { Args: { _id: string }; Returns: undefined }
      verify_pin: {
        Args: { _admin_only?: boolean; _pin: string }
        Returns: {
          key: string
          name: string
          role: string
        }[]
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
    Enums: {},
  },
} as const

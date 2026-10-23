export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      bill_overrides: {
        Row: {
          amount: number | null;
          bill_id: string;
          hidden: boolean;
          month: string;
          status: string | null;
        };
        Insert: {
          amount?: number | null;
          bill_id: string;
          hidden?: boolean;
          month: string;
          status?: string | null;
        };
        Update: {
          amount?: number | null;
          bill_id?: string;
          hidden?: boolean;
          month?: string;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bill_overrides_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id"];
          },
        ];
      };
      bill_splits: {
        Row: {
          bill_id: string;
          household_id: string;
          id: string;
          person_key: string;
          type: string;
          value: number;
        };
        Insert: {
          bill_id: string;
          household_id: string;
          id?: string;
          person_key: string;
          type?: string;
          value?: number;
        };
        Update: {
          bill_id?: string;
          household_id?: string;
          id?: string;
          person_key?: string;
          type?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bill_splits_bill_id_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "split_household_valid";
            columns: ["bill_id", "household_id"];
            isOneToOne: false;
            referencedRelation: "bills";
            referencedColumns: ["id", "household_id"];
          },
          {
            foreignKeyName: "split_member_valid";
            columns: ["household_id", "person_key"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["household_id", "key"];
          },
        ];
      };
      bills: {
        Row: {
          auto_pay: boolean;
          base: number;
          category: string;
          due_day: number;
          household_id: string;
          id: string;
          name: string;
          position: number;
          revision: number;
        };
        Insert: {
          auto_pay?: boolean;
          base?: number;
          category: string;
          due_day?: number;
          household_id: string;
          id?: string;
          name: string;
          position?: number;
          revision?: number;
        };
        Update: {
          auto_pay?: boolean;
          base?: number;
          category?: string;
          due_day?: number;
          household_id?: string;
          id?: string;
          name?: string;
          position?: number;
          revision?: number;
        };
        Relationships: [
          {
            foreignKeyName: "bills_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      chores: {
        Row: {
          completed_at: string | null;
          done: boolean;
          due_date: string | null;
          household_id: string;
          id: string;
          member_key: string;
          position: number;
          revision: number;
          title: string;
          when_label: string;
        };
        Insert: {
          completed_at?: string | null;
          done?: boolean;
          due_date?: string | null;
          household_id: string;
          id?: string;
          member_key: string;
          position?: number;
          revision?: number;
          title: string;
          when_label?: string;
        };
        Update: {
          completed_at?: string | null;
          done?: boolean;
          due_date?: string | null;
          household_id?: string;
          id?: string;
          member_key?: string;
          position?: number;
          revision?: number;
          title?: string;
          when_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chore_member_valid";
            columns: ["household_id", "member_key"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["household_id", "key"];
          },
          {
            foreignKeyName: "chores_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      contributions: {
        Row: {
          amount: number;
          household_id: string;
          id: string;
          month: string;
          note: string;
          occurred_on: string | null;
          person_key: string;
          revision: number;
        };
        Insert: {
          amount?: number;
          household_id: string;
          id?: string;
          month: string;
          note?: string;
          occurred_on?: string | null;
          person_key: string;
          revision?: number;
        };
        Update: {
          amount?: number;
          household_id?: string;
          id?: string;
          month?: string;
          note?: string;
          occurred_on?: string | null;
          person_key?: string;
          revision?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contribution_member_valid";
            columns: ["household_id", "person_key"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["household_id", "key"];
          },
          {
            foreignKeyName: "contributions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      devices: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          name: string;
          revoked: boolean;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          name: string;
          revoked?: boolean;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          name?: string;
          revoked?: boolean;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devices_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          date: string;
          household_id: string;
          id: string;
          member_key: string;
          note: string;
          revision: number;
          time: string;
          title: string;
        };
        Insert: {
          date: string;
          household_id: string;
          id?: string;
          member_key: string;
          note?: string;
          revision?: number;
          time?: string;
          title: string;
        };
        Update: {
          date?: string;
          household_id?: string;
          id?: string;
          member_key?: string;
          note?: string;
          revision?: number;
          time?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_member_valid";
            columns: ["household_id", "member_key"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["household_id", "key"];
          },
          {
            foreignKeyName: "events_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      finance_sessions: {
        Row: {
          auth_session: string | null;
          authorized_by: string | null;
          created_at: string;
          device_id: string | null;
          expires_at: string;
          household_id: string;
          revoked: boolean;
          token_hash: string;
          user_id: string | null;
        };
        Insert: {
          auth_session?: string | null;
          authorized_by?: string | null;
          created_at?: string;
          device_id?: string | null;
          expires_at?: string;
          household_id: string;
          revoked?: boolean;
          token_hash: string;
          user_id?: string | null;
        };
        Update: {
          auth_session?: string | null;
          authorized_by?: string | null;
          created_at?: string;
          device_id?: string | null;
          expires_at?: string;
          household_id?: string;
          revoked?: boolean;
          token_hash?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "finance_sessions_authorized_by_fkey";
            columns: ["authorized_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_sessions_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "finance_sessions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_accounts: {
        Row: {
          created_at: string;
          household_id: string;
          member_key: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          member_key: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          member_key?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_member_valid";
            columns: ["household_id", "member_key"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["household_id", "key"];
          },
          {
            foreignKeyName: "household_accounts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      household_photos: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
          path: string;
          position: number;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
          path: string;
          position?: number;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
          path?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "household_photos_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan: string;
          suspended: boolean;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          plan?: string;
          suspended?: boolean;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan?: string;
          suspended?: boolean;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          code: string;
          created_by: string;
          delivery_status: string;
          email_delivery_id: string;
          email_message_id: string | null;
          expires_at: string;
          household_id: string;
          last_email_attempt_at: string | null;
          member_name: string;
          recipient_email: string | null;
          revoked_at: string | null;
          role: string;
          used_at: string | null;
        };
        Insert: {
          code: string;
          created_by: string;
          delivery_status?: string;
          email_delivery_id?: string;
          email_message_id?: string | null;
          expires_at: string;
          household_id: string;
          last_email_attempt_at?: string | null;
          member_name: string;
          recipient_email?: string | null;
          revoked_at?: string | null;
          role?: string;
          used_at?: string | null;
        };
        Update: {
          code?: string;
          created_by?: string;
          delivery_status?: string;
          email_delivery_id?: string;
          email_message_id?: string | null;
          expires_at?: string;
          household_id?: string;
          last_email_attempt_at?: string | null;
          member_name?: string;
          recipient_email?: string | null;
          revoked_at?: string | null;
          role?: string;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invites_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          household_id: string;
          id: string;
          key: string;
          name: string;
          pin_hash: string;
          role: string;
        };
        Insert: {
          household_id: string;
          id?: string;
          key: string;
          name: string;
          pin_hash: string;
          role?: string;
        };
        Update: {
          household_id?: string;
          id?: string;
          key?: string;
          name?: string;
          pin_hash?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          body: string;
          household_id: string;
          id: string;
          member_key: string;
          pinned: boolean;
          revision: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          body?: string;
          household_id: string;
          id?: string;
          member_key: string;
          pinned?: boolean;
          revision?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          household_id?: string;
          id?: string;
          member_key?: string;
          pinned?: boolean;
          revision?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "note_member_valid";
            columns: ["household_id", "member_key"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["household_id", "key"];
          },
          {
            foreignKeyName: "notes_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      pairing_codes: {
        Row: {
          code: string;
          expires_at: string;
          household_id: string;
          max_uses: number;
          uses: number;
        };
        Insert: {
          code: string;
          expires_at: string;
          household_id: string;
          max_uses?: number;
          uses?: number;
        };
        Update: {
          code?: string;
          expires_at?: string;
          household_id?: string;
          max_uses?: number;
          uses?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pairing_codes_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      pin_attempts: {
        Row: {
          created_at: string;
          household_id: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          household_id: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          household_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pin_attempts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          id: string;
          preferred_view: string;
          time_format: string;
        };
        Insert: {
          avatar_path?: string | null;
          id: string;
          preferred_view?: string;
          time_format?: string;
        };
        Update: {
          avatar_path?: string | null;
          id?: string;
          preferred_view?: string;
          time_format?: string;
        };
        Relationships: [];
      };
      shopping_items: {
        Row: {
          done: boolean;
          household_id: string;
          id: string;
          name: string;
          position: number;
          revision: number;
        };
        Insert: {
          done?: boolean;
          household_id: string;
          id?: string;
          name: string;
          position?: number;
          revision?: number;
        };
        Update: {
          done?: boolean;
          household_id?: string;
          id?: string;
          name?: string;
          position?: number;
          revision?: number;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_items_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_household_photo: { Args: { _path: string }; Returns: string };
      admin_list_accounts: {
        Args: never;
        Returns: {
          confirmed: boolean;
          created_at: string;
          email: string;
          household_name: string;
          is_admin: boolean;
          last_sign_in_at: string;
          user_id: string;
        }[];
      };
      admin_list_households: {
        Args: never;
        Returns: {
          accounts: number;
          created_at: string;
          devices: number;
          id: string;
          members: number;
          name: string;
          plan: string;
          suspended: boolean;
        }[];
      };
      admin_revoke_household_devices: {
        Args: { _id: string };
        Returns: undefined;
      };
      admin_set_household: {
        Args: { _id: string; _plan: string; _suspended: boolean };
        Returns: undefined;
      };
      admin_set_platform_admin: {
        Args: { _grant: boolean; _user: string };
        Returns: undefined;
      };
      admin_stats: {
        Args: never;
        Returns: {
          accounts: number;
          devices: number;
          households: number;
          members: number;
          new_accounts_30d: number;
          new_households_30d: number;
          pro: number;
          suspended: number;
        }[];
      };
      am_platform_admin: { Args: never; Returns: boolean };
      approve_tablet_pairing: {
        Args: { _approval_secret: string; _id: string };
        Returns: undefined;
      };
      authorize_finances: { Args: { _pin: string }; Returns: string };
      can_access_finances: { Args: { _household: string }; Returns: boolean };
      cancel_tablet_pairing: {
        Args: { _claim_secret: string; _id: string };
        Returns: undefined;
      };
      claim_platform_admin: { Args: never; Returns: boolean };
      claim_tablet_pairing: {
        Args: { _claim_secret: string; _id: string };
        Returns: Json;
      };
      create_household: {
        Args: { _member_name: string; _name: string; _pin: string };
        Returns: string;
      };
      create_invite: {
        Args: { _member_name: string; _role: string };
        Returns: string;
      };
      create_member: {
        Args: { _name: string; _pin: string; _role: string };
        Returns: string;
      };
      create_pairing_code: { Args: never; Returns: string };
      create_tablet_pairing: {
        Args: {
          _approval_hash: string;
          _claim_hash: string;
          _id: string;
          _name: string;
          _server_key: string;
        };
        Returns: Json;
      };
      current_household_ids: { Args: never; Returns: string[] };
      delete_bill: {
        Args: { _expected_revision: number; _id: string };
        Returns: undefined;
      };
      delete_member: { Args: { _key: string }; Returns: undefined };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      household_members: {
        Args: never;
        Returns: {
          key: string;
          name: string;
          role: string;
        }[];
      };
      is_household_admin: { Args: { _household: string }; Returns: boolean };
      leave_household: { Args: never; Returns: undefined };
      list_devices: {
        Args: never;
        Returns: {
          created_at: string;
          id: string;
          name: string;
          revoked: boolean;
        }[];
      };
      list_email_invites: {
        Args: never;
        Returns: {
          code: string;
          delivery_status: string;
          expires_at: string;
          member_name: string;
          recipient_email: string;
          revoked_at: string;
          role: string;
          used_at: string;
        }[];
      };
      list_household_photos: {
        Args: never;
        Returns: {
          id: string;
          path: string;
          position: number;
        }[];
      };
      list_invites: {
        Args: never;
        Returns: {
          code: string;
          expires_at: string;
          member_name: string;
          revoked_at: string;
          role: string;
          used_at: string;
        }[];
      };
      list_member_accounts: {
        Args: never;
        Returns: {
          key: string;
          linked: boolean;
        }[];
      };
      mark_invite_email_sent: {
        Args: { _code: string; _delivery_id: string; _message_id: string };
        Returns: undefined;
      };
      my_context: {
        Args: never;
        Returns: {
          household_id: string;
          household_name: string;
          member_key: string;
          mode: string;
        }[];
      };
      pair_device: { Args: { _code: string; _name: string }; Returns: string };
      pair_tablet_with_passkey: { Args: { _name?: string }; Returns: string };
      pin_lock_status: { Args: never; Returns: Json };
      platform_admin_exists: { Args: never; Returns: boolean };
      prepare_email_invite: {
        Args: {
          _code?: string;
          _email: string;
          _member_name: string;
          _role: string;
        };
        Returns: Json;
      };
      redeem_invite: { Args: { _code: string; _pin: string }; Returns: string };
      remove_household_photo: { Args: { _id: string }; Returns: undefined };
      reorder_household_photos: { Args: { _ids: string[] }; Returns: undefined };
      require_platform_admin: { Args: never; Returns: undefined };
      revoke_device: { Args: { _id: string }; Returns: undefined };
      revoke_finance_session: { Args: { _token: string }; Returns: undefined };
      revoke_invite: { Args: { _code: string }; Returns: undefined };
      save_bill: {
        Args: { _bill: Json; _expected_revision?: number; _household: string };
        Returns: Json;
      };
      save_collection: {
        Args: { _changes: Json; _household: string; _table: string };
        Returns: Json;
      };
      sync_shopping: {
        Args: {
          _changes: Json;
          _household: string;
          _member_key?: string;
          _mutation_id: string;
        };
        Returns: Json;
      };
      tablet_pairing_preview: {
        Args: { _approval_secret: string; _id: string };
        Returns: Json;
      };
      tablet_pairing_status: {
        Args: { _claim_secret: string; _id: string };
        Returns: Json;
      };
      unlink_member: { Args: { _key: string }; Returns: undefined };
      update_member: {
        Args: { _key: string; _name?: string; _pin?: string; _role?: string };
        Returns: undefined;
      };
      verify_pin: {
        Args: { _admin_only?: boolean; _pin: string };
        Returns: {
          key: string;
          name: string;
          role: string;
        }[];
      };
    };
    Enums: {
      app_role: "platform_admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["platform_admin"],
    },
  },
} as const;

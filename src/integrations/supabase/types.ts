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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_reports: {
        Row: {
          content: Json
          created_at: string
          game_id: string | null
          id: string
          model_version: string | null
          owner_id: string
          player_id: string | null
          report_type: string
          reviewed_clip_count: number
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          game_id?: string | null
          id?: string
          model_version?: string | null
          owner_id?: string
          player_id?: string | null
          report_type: string
          reviewed_clip_count?: number
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          game_id?: string | null
          id?: string
          model_version?: string | null
          owner_id?: string
          player_id?: string | null
          report_type?: string
          reviewed_clip_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reports_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          analysis_type: string
          completed_at: string | null
          created_at: string
          current_stage: string | null
          error_code: string | null
          error_message: string | null
          external_job_id: string | null
          game_id: string
          id: string
          identity_context: Json
          is_demo: boolean
          model_version: string | null
          player_id: string | null
          progress_percent: number
          provider: string
          requested_by: string | null
          result_summary: Json
          settings: Json
          sport_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
          video_asset_id: string | null
        }
        Insert: {
          analysis_type?: string
          completed_at?: string | null
          created_at?: string
          current_stage?: string | null
          error_code?: string | null
          error_message?: string | null
          external_job_id?: string | null
          game_id: string
          id?: string
          identity_context?: Json
          is_demo?: boolean
          model_version?: string | null
          player_id?: string | null
          progress_percent?: number
          provider?: string
          requested_by?: string | null
          result_summary?: Json
          settings?: Json
          sport_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_job_status"]
          updated_at?: string
          video_asset_id?: string | null
        }
        Update: {
          analysis_type?: string
          completed_at?: string | null
          created_at?: string
          current_stage?: string | null
          error_code?: string | null
          error_message?: string | null
          external_job_id?: string | null
          game_id?: string
          id?: string
          identity_context?: Json
          is_demo?: boolean
          model_version?: string | null
          player_id?: string | null
          progress_percent?: number
          provider?: string
          requested_by?: string | null
          result_summary?: Json
          settings?: Json
          sport_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_job_status"]
          updated_at?: string
          video_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user_connections: {
        Row: {
          account_label: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_label?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_label?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      candidate_clips: {
        Row: {
          ai_confidence: number | null
          ai_prediction: Json
          analysis_job_id: string
          candidate_reason: string | null
          clip_id: string | null
          corrected_player_id: string | null
          correction_notes: string | null
          created_at: string
          end_time: number
          game_id: string
          id: string
          is_demo: boolean
          metadata: Json
          original_end_time: number
          original_player_id: string | null
          original_start_time: number
          player_id: string | null
          review_status: Database["public"]["Enums"]["candidate_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          sequence_number: number
          start_time: number
          tags: string[]
          track_id: string | null
          updated_at: string
          user_decision: string | null
          video_asset_id: string | null
          wrong_player: boolean
        }
        Insert: {
          ai_confidence?: number | null
          ai_prediction?: Json
          analysis_job_id: string
          candidate_reason?: string | null
          clip_id?: string | null
          corrected_player_id?: string | null
          correction_notes?: string | null
          created_at?: string
          end_time: number
          game_id: string
          id?: string
          is_demo?: boolean
          metadata?: Json
          original_end_time: number
          original_player_id?: string | null
          original_start_time: number
          player_id?: string | null
          review_status?: Database["public"]["Enums"]["candidate_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          sequence_number?: number
          start_time: number
          tags?: string[]
          track_id?: string | null
          updated_at?: string
          user_decision?: string | null
          video_asset_id?: string | null
          wrong_player?: boolean
        }
        Update: {
          ai_confidence?: number | null
          ai_prediction?: Json
          analysis_job_id?: string
          candidate_reason?: string | null
          clip_id?: string | null
          corrected_player_id?: string | null
          correction_notes?: string | null
          created_at?: string
          end_time?: number
          game_id?: string
          id?: string
          is_demo?: boolean
          metadata?: Json
          original_end_time?: number
          original_player_id?: string | null
          original_start_time?: number
          player_id?: string | null
          review_status?: Database["public"]["Enums"]["candidate_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          sequence_number?: number
          start_time?: number
          tags?: string[]
          track_id?: string | null
          updated_at?: string
          user_decision?: string | null
          video_asset_id?: string | null
          wrong_player?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "candidate_clips_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_clips_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_clips_corrected_player_id_fkey"
            columns: ["corrected_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_clips_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_clips_original_player_id_fkey"
            columns: ["original_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_clips_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_clips_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "player_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_clips_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      clips: {
        Row: {
          approved: boolean
          asset_url: string | null
          category: string | null
          created_at: string
          created_by: string | null
          end_time: number | null
          event_id: string | null
          game_id: string
          id: string
          manually_edited: boolean
          metadata: Json
          model_version: string | null
          player_id: string | null
          source: Database["public"]["Enums"]["data_source"]
          start_time: number
          status: Database["public"]["Enums"]["workflow_status"]
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          video_asset_id: string | null
          video_id: string | null
        }
        Insert: {
          approved?: boolean
          asset_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: number | null
          event_id?: string | null
          game_id: string
          id?: string
          manually_edited?: boolean
          metadata?: Json
          model_version?: string | null
          player_id?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          start_time: number
          status?: Database["public"]["Enums"]["workflow_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_asset_id?: string | null
          video_id?: string | null
        }
        Update: {
          approved?: boolean
          asset_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: number | null
          event_id?: string | null
          game_id?: string
          id?: string
          manually_edited?: boolean
          metadata?: Json
          model_version?: string | null
          player_id?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          start_time?: number
          status?: Database["public"]["Enums"]["workflow_status"]
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          video_asset_id?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clips_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "game_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          clip_id: string | null
          confidence_score: number | null
          created_at: string
          created_by: string | null
          decision_score: number | null
          event_id: string | null
          game_id: string
          id: string
          impact_score: number | null
          manually_edited: boolean
          metadata: Json
          model_version: string | null
          notes: string | null
          outcome_score: number | null
          overall_score: number | null
          player_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["data_source"]
          updated_at: string
        }
        Insert: {
          clip_id?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          decision_score?: number | null
          event_id?: string | null
          game_id: string
          id?: string
          impact_score?: number | null
          manually_edited?: boolean
          metadata?: Json
          model_version?: string | null
          notes?: string | null
          outcome_score?: number | null
          overall_score?: number | null
          player_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
        }
        Update: {
          clip_id?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          decision_score?: number | null
          event_id?: string | null
          game_id?: string
          id?: string
          impact_score?: number | null
          manually_edited?: boolean
          metadata?: Json
          model_version?: string | null
          notes?: string | null
          outcome_score?: number | null
          overall_score?: number | null
          player_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      event_types: {
        Row: {
          default_side: Database["public"]["Enums"]["play_side"]
          id: string
          key: string
          name: string
          outcomes: Json
          sort_order: number
          sport_id: string
          subtypes: Json
        }
        Insert: {
          default_side?: Database["public"]["Enums"]["play_side"]
          id?: string
          key: string
          name: string
          outcomes?: Json
          sort_order?: number
          sport_id: string
          subtypes?: Json
        }
        Update: {
          default_side?: Database["public"]["Enums"]["play_side"]
          id?: string
          key?: string
          name?: string
          outcomes?: Json
          sort_order?: number
          sport_id?: string
          subtypes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "event_types_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          approved: boolean
          confidence_score: number | null
          created_at: string
          created_by: string | null
          end_time: number | null
          event_subtype: string | null
          event_type_id: string | null
          event_type_key: string | null
          game_id: string
          id: string
          manually_edited: boolean
          metadata: Json
          model_version: string | null
          notes: string | null
          offense_or_defense: Database["public"]["Enums"]["play_side"]
          outcome: string | null
          player_id: string | null
          possession_type: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["data_source"]
          sport_id: string
          start_time: number
          tags: string[]
          updated_at: string
          video_asset_id: string | null
          video_id: string | null
        }
        Insert: {
          approved?: boolean
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          end_time?: number | null
          event_subtype?: string | null
          event_type_id?: string | null
          event_type_key?: string | null
          game_id: string
          id?: string
          manually_edited?: boolean
          metadata?: Json
          model_version?: string | null
          notes?: string | null
          offense_or_defense?: Database["public"]["Enums"]["play_side"]
          outcome?: string | null
          player_id?: string | null
          possession_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          sport_id: string
          start_time: number
          tags?: string[]
          updated_at?: string
          video_asset_id?: string | null
          video_id?: string | null
        }
        Update: {
          approved?: boolean
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          end_time?: number | null
          event_subtype?: string | null
          event_type_id?: string | null
          event_type_key?: string | null
          game_id?: string
          id?: string
          manually_edited?: boolean
          metadata?: Json
          model_version?: string | null
          notes?: string | null
          offense_or_defense?: Database["public"]["Enums"]["play_side"]
          outcome?: string | null
          player_id?: string | null
          possession_type?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["data_source"]
          sport_id?: string
          start_time?: number
          tags?: string[]
          updated_at?: string
          video_asset_id?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "game_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      external_reference_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          notes: string | null
          player_id: string
          provider: Database["public"]["Enums"]["external_link_provider"]
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          player_id: string
          provider?: Database["public"]["Enums"]["external_link_provider"]
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          player_id?: string
          provider?: Database["public"]["Enums"]["external_link_provider"]
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_reference_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          created_at: string
          game_id: string
          id: string
          is_primary: boolean
          player_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          is_primary?: boolean
          player_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          is_primary?: boolean
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_videos: {
        Row: {
          created_at: string
          duration_seconds: number | null
          game_id: string
          id: string
          is_primary: boolean
          label: string
          metadata: Json
          offset_seconds: number
          provider: string | null
          source_ref: string | null
          status: Database["public"]["Enums"]["workflow_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          game_id: string
          id?: string
          is_primary?: boolean
          label?: string
          metadata?: Json
          offset_seconds?: number
          provider?: string | null
          source_ref?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          game_id?: string
          id?: string
          is_primary?: boolean
          label?: string
          metadata?: Json
          offset_seconds?: number
          provider?: string | null
          source_ref?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_videos_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          analysis_status: Database["public"]["Enums"]["workflow_status"]
          clip_count: number
          coach_name: string | null
          created_at: string
          game_date: string | null
          id: string
          is_home: boolean | null
          jersey_number: string | null
          metadata: Json
          notes: string | null
          opponent: string | null
          owner_id: string
          position_id: string | null
          season: string | null
          sport_id: string
          team_id: string | null
          title: string
          uniform_primary_color: string | null
          uniform_secondary_color: string | null
          updated_at: string
          video_status: Database["public"]["Enums"]["workflow_status"]
        }
        Insert: {
          analysis_status?: Database["public"]["Enums"]["workflow_status"]
          clip_count?: number
          coach_name?: string | null
          created_at?: string
          game_date?: string | null
          id?: string
          is_home?: boolean | null
          jersey_number?: string | null
          metadata?: Json
          notes?: string | null
          opponent?: string | null
          owner_id?: string
          position_id?: string | null
          season?: string | null
          sport_id: string
          team_id?: string | null
          title: string
          uniform_primary_color?: string | null
          uniform_secondary_color?: string | null
          updated_at?: string
          video_status?: Database["public"]["Enums"]["workflow_status"]
        }
        Update: {
          analysis_status?: Database["public"]["Enums"]["workflow_status"]
          clip_count?: number
          coach_name?: string | null
          created_at?: string
          game_date?: string | null
          id?: string
          is_home?: boolean | null
          jersey_number?: string | null
          metadata?: Json
          notes?: string | null
          opponent?: string | null
          owner_id?: string
          position_id?: string | null
          season?: string | null
          sport_id?: string
          team_id?: string | null
          title?: string
          uniform_primary_color?: string | null
          uniform_secondary_color?: string | null
          updated_at?: string
          video_status?: Database["public"]["Enums"]["workflow_status"]
        }
        Relationships: [
          {
            foreignKeyName: "games_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "sport_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_identity_confirmations: {
        Row: {
          analysis_job_id: string | null
          bounding_box: Json
          candidate_clip_id: string | null
          confidence: number
          created_at: string
          created_by: string | null
          frame_image_path: string | null
          game_id: string
          id: string
          metadata: Json
          notes: string | null
          player_id: string
          saved_to_reference_id: string | null
          source: Database["public"]["Enums"]["identity_confirmation_source"]
          timestamp_seconds: number
          updated_at: string
          video_asset_id: string | null
        }
        Insert: {
          analysis_job_id?: string | null
          bounding_box?: Json
          candidate_clip_id?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          frame_image_path?: string | null
          game_id: string
          id?: string
          metadata?: Json
          notes?: string | null
          player_id: string
          saved_to_reference_id?: string | null
          source?: Database["public"]["Enums"]["identity_confirmation_source"]
          timestamp_seconds: number
          updated_at?: string
          video_asset_id?: string | null
        }
        Update: {
          analysis_job_id?: string | null
          bounding_box?: Json
          candidate_clip_id?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          frame_image_path?: string | null
          game_id?: string
          id?: string
          metadata?: Json
          notes?: string | null
          player_id?: string
          saved_to_reference_id?: string | null
          source?: Database["public"]["Enums"]["identity_confirmation_source"]
          timestamp_seconds?: number
          updated_at?: string
          video_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identity_confirmations_candidate_fk"
            columns: ["candidate_clip_id"]
            isOneToOne: false
            referencedRelation: "candidate_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_confirmations_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_confirmations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_confirmations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_confirmations_saved_to_reference_id_fkey"
            columns: ["saved_to_reference_id"]
            isOneToOne: false
            referencedRelation: "player_reference_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_identity_confirmations_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      player_reference_media: {
        Row: {
          active: boolean
          ai_generated: boolean
          confidence_score: number | null
          created_at: string
          file_reference: string | null
          id: string
          metadata: Json
          mime_type: string | null
          notes: string | null
          player_id: string
          provider: string
          reference_type: Database["public"]["Enums"]["player_reference_type"]
          source_game_id: string | null
          thumbnail_url: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          active?: boolean
          ai_generated?: boolean
          confidence_score?: number | null
          created_at?: string
          file_reference?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          player_id: string
          provider?: string
          reference_type?: Database["public"]["Enums"]["player_reference_type"]
          source_game_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          active?: boolean
          ai_generated?: boolean
          confidence_score?: number | null
          created_at?: string
          file_reference?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          player_id?: string
          provider?: string
          reference_type?: Database["public"]["Enums"]["player_reference_type"]
          source_game_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_reference_media_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_reference_media_source_game_id_fkey"
            columns: ["source_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      player_team_memberships: {
        Row: {
          active: boolean
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          jersey_number: string | null
          metadata: Json
          player_id: string
          position_id: string | null
          position_label: string | null
          season: string | null
          start_date: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          jersey_number?: string | null
          metadata?: Json
          player_id: string
          position_id?: string | null
          position_label?: string | null
          season?: string | null
          start_date?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          jersey_number?: string | null
          metadata?: Json
          player_id?: string
          position_id?: string | null
          position_label?: string | null
          season?: string | null
          start_date?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_team_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_memberships_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "sport_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_tracks: {
        Row: {
          analysis_job_id: string
          average_confidence: number | null
          created_at: string
          end_time: number
          game_id: string
          id: string
          identity_confidence: number | null
          is_demo: boolean
          metadata: Json
          needs_confirmation: boolean
          player_id: string | null
          start_time: number
          track_id: string
          tracking_confidence: number | null
          updated_at: string
          video_asset_id: string | null
        }
        Insert: {
          analysis_job_id: string
          average_confidence?: number | null
          created_at?: string
          end_time: number
          game_id: string
          id?: string
          identity_confidence?: number | null
          is_demo?: boolean
          metadata?: Json
          needs_confirmation?: boolean
          player_id?: string | null
          start_time: number
          track_id: string
          tracking_confidence?: number | null
          updated_at?: string
          video_asset_id?: string | null
        }
        Update: {
          analysis_job_id?: string
          average_confidence?: number | null
          created_at?: string
          end_time?: number
          game_id?: string
          id?: string
          identity_confidence?: number | null
          is_demo?: boolean
          metadata?: Json
          needs_confirmation?: boolean
          player_id?: string | null
          start_time?: number
          track_id?: string
          tracking_confidence?: number | null
          updated_at?: string
          video_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_tracks_analysis_job_id_fkey"
            columns: ["analysis_job_id"]
            isOneToOne: false
            referencedRelation: "analysis_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tracks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tracks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tracks_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birthday: string | null
          created_at: string
          dominant_hand: string | null
          first_name: string
          graduation_year: number | null
          height: string | null
          id: string
          image_url: string | null
          jersey_number: string | null
          last_name: string
          metadata: Json
          notes: string | null
          owner_id: string
          position_id: string | null
          sport_id: string
          team_name: string | null
          updated_at: string
          weight: string | null
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          dominant_hand?: string | null
          first_name: string
          graduation_year?: number | null
          height?: string | null
          id?: string
          image_url?: string | null
          jersey_number?: string | null
          last_name: string
          metadata?: Json
          notes?: string | null
          owner_id?: string
          position_id?: string | null
          sport_id: string
          team_name?: string | null
          updated_at?: string
          weight?: string | null
        }
        Update: {
          birthday?: string | null
          created_at?: string
          dominant_hand?: string | null
          first_name?: string
          graduation_year?: number | null
          height?: string | null
          id?: string
          image_url?: string | null
          jersey_number?: string | null
          last_name?: string
          metadata?: Json
          notes?: string | null
          owner_id?: string
          position_id?: string | null
          sport_id?: string
          team_name?: string | null
          updated_at?: string
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "sport_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_clips: {
        Row: {
          clip_id: string
          created_at: string
          id: string
          playlist_id: string
          position: number
        }
        Insert: {
          clip_id: string
          created_at?: string
          id?: string
          playlist_id: string
          position?: number
        }
        Update: {
          clip_id?: string
          created_at?: string
          id?: string
          playlist_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "playlist_clips_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_clips_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string
          description: string | null
          filter_definition: Json
          game_id: string | null
          id: string
          is_system: boolean
          metadata: Json
          name: string
          owner_id: string
          player_id: string | null
          sport_id: string | null
          system_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          filter_definition?: Json
          game_id?: string | null
          id?: string
          is_system?: boolean
          metadata?: Json
          name: string
          owner_id?: string
          player_id?: string | null
          sport_id?: string | null
          system_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          filter_definition?: Json
          game_id?: string | null
          id?: string
          is_system?: boolean
          metadata?: Json
          name?: string
          owner_id?: string
          player_id?: string | null
          sport_id?: string | null
          system_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          game_id: string | null
          id: string
          job_type: string
          metadata: Json
          model_version: string | null
          progress: number
          requested_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_status"]
          updated_at: string
          video_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          game_id?: string | null
          id?: string
          job_type: string
          metadata?: Json
          model_version?: string | null
          progress?: number
          requested_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          game_id?: string | null
          id?: string
          job_type?: string
          metadata?: Json
          model_version?: string | null
          progress?: number
          requested_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_jobs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "game_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          demo_mode: boolean
          first_name: string | null
          id: string
          last_name: string | null
          onboarding_completed: boolean
          organization_name: string | null
          position_id: string | null
          primary_role: Database["public"]["Enums"]["app_role"] | null
          primary_sport_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          demo_mode?: boolean
          first_name?: string | null
          id: string
          last_name?: string | null
          onboarding_completed?: boolean
          organization_name?: string | null
          position_id?: string | null
          primary_role?: Database["public"]["Enums"]["app_role"] | null
          primary_sport_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          demo_mode?: boolean
          first_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean
          organization_name?: string | null
          position_id?: string | null
          primary_role?: Database["public"]["Enums"]["app_role"] | null
          primary_sport_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "sport_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_primary_sport_id_fkey"
            columns: ["primary_sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_clips: {
        Row: {
          ai_reason: string | null
          clip_id: string
          created_at: string
          id: string
          position: number
          reel_id: string
        }
        Insert: {
          ai_reason?: string | null
          clip_id: string
          created_at?: string
          id?: string
          position?: number
          reel_id: string
        }
        Update: {
          ai_reason?: string | null
          clip_id?: string
          created_at?: string
          id?: string
          position?: number
          reel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_clips_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_clips_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
        ]
      }
      reels: {
        Row: {
          created_at: string
          game_id: string | null
          generation_prompt: string | null
          id: string
          metadata: Json
          model_version: string | null
          owner_id: string
          parent_reel_id: string | null
          player_id: string | null
          reel_type: string
          reviewed_clip_count: number
          source_game_ids: string[]
          summary: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          game_id?: string | null
          generation_prompt?: string | null
          id?: string
          metadata?: Json
          model_version?: string | null
          owner_id?: string
          parent_reel_id?: string | null
          player_id?: string | null
          reel_type?: string
          reviewed_clip_count?: number
          source_game_ids?: string[]
          summary?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          game_id?: string | null
          generation_prompt?: string | null
          id?: string
          metadata?: Json
          model_version?: string | null
          owner_id?: string
          parent_reel_id?: string | null
          player_id?: string | null
          reel_type?: string
          reviewed_clip_count?: number
          source_game_ids?: string[]
          summary?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reels_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_parent_reel_id_fkey"
            columns: ["parent_reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_resources: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          note: string | null
          permission: Database["public"]["Enums"]["share_permission"]
          resource_id: string
          resource_type: Database["public"]["Enums"]["shared_resource_type"]
          shared_by_user_id: string
          shared_with_email: string | null
          shared_with_user_id: string | null
          source_access_state: Database["public"]["Enums"]["source_permission_state"]
          status: Database["public"]["Enums"]["share_status"]
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          permission?: Database["public"]["Enums"]["share_permission"]
          resource_id: string
          resource_type: Database["public"]["Enums"]["shared_resource_type"]
          shared_by_user_id: string
          shared_with_email?: string | null
          shared_with_user_id?: string | null
          source_access_state?: Database["public"]["Enums"]["source_permission_state"]
          status?: Database["public"]["Enums"]["share_status"]
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          permission?: Database["public"]["Enums"]["share_permission"]
          resource_id?: string
          resource_type?: Database["public"]["Enums"]["shared_resource_type"]
          shared_by_user_id?: string
          shared_with_email?: string | null
          shared_with_user_id?: string | null
          source_access_state?: Database["public"]["Enums"]["source_permission_state"]
          status?: Database["public"]["Enums"]["share_status"]
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: []
      }
      sport_positions: {
        Row: {
          abbreviation: string | null
          id: string
          key: string
          name: string
          sort_order: number
          sport_id: string
        }
        Insert: {
          abbreviation?: string | null
          id?: string
          key: string
          name: string
          sort_order?: number
          sport_id: string
        }
        Update: {
          abbreviation?: string | null
          id?: string
          key?: string
          name?: string
          sort_order?: number
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_positions_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
      }
      sports: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          metadata: Json
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          metadata?: Json
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          metadata?: Json
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      teams: {
        Row: {
          coach_name: string | null
          created_at: string
          id: string
          level: string | null
          metadata: Json
          notes: string | null
          organization_name: string | null
          owner_id: string
          primary_color: string | null
          season: string | null
          secondary_color: string | null
          sport_id: string | null
          team_name: string
          updated_at: string
        }
        Insert: {
          coach_name?: string | null
          created_at?: string
          id?: string
          level?: string | null
          metadata?: Json
          notes?: string | null
          organization_name?: string | null
          owner_id: string
          primary_color?: string | null
          season?: string | null
          secondary_color?: string | null
          sport_id?: string | null
          team_name: string
          updated_at?: string
        }
        Update: {
          coach_name?: string | null
          created_at?: string
          id?: string
          level?: string | null
          metadata?: Json
          notes?: string | null
          organization_name?: string | null
          owner_id?: string
          primary_color?: string | null
          season?: string | null
          secondary_color?: string | null
          sport_id?: string | null
          team_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports"
            referencedColumns: ["id"]
          },
        ]
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
      video_assets: {
        Row: {
          access_level: Database["public"]["Enums"]["provider_access_level"]
          cleanup_status: Database["public"]["Enums"]["cleanup_state"]
          created_at: string
          created_by: string | null
          duration: number | null
          embed_url: string | null
          error: string | null
          expires_at: string | null
          external_url: string | null
          external_video_id: string | null
          file_size: number | null
          game_id: string
          height: number | null
          id: string
          ingestion_status: Database["public"]["Enums"]["video_ingestion_status"]
          is_primary: boolean
          is_temporary: boolean
          label: string
          mime_type: string | null
          original_filename: string | null
          permissions_status: Database["public"]["Enums"]["source_permission_state"]
          playback_url: string | null
          processing_status: Database["public"]["Enums"]["video_ingestion_status"]
          provider: Database["public"]["Enums"]["video_provider"]
          provider_connection_id: string | null
          provider_metadata: Json
          rights_confirmed_at: string | null
          rights_confirmed_by: string | null
          source_type: string
          storage_path: string | null
          thumbnail_url: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["provider_access_level"]
          cleanup_status?: Database["public"]["Enums"]["cleanup_state"]
          created_at?: string
          created_by?: string | null
          duration?: number | null
          embed_url?: string | null
          error?: string | null
          expires_at?: string | null
          external_url?: string | null
          external_video_id?: string | null
          file_size?: number | null
          game_id: string
          height?: number | null
          id?: string
          ingestion_status?: Database["public"]["Enums"]["video_ingestion_status"]
          is_primary?: boolean
          is_temporary?: boolean
          label?: string
          mime_type?: string | null
          original_filename?: string | null
          permissions_status?: Database["public"]["Enums"]["source_permission_state"]
          playback_url?: string | null
          processing_status?: Database["public"]["Enums"]["video_ingestion_status"]
          provider: Database["public"]["Enums"]["video_provider"]
          provider_connection_id?: string | null
          provider_metadata?: Json
          rights_confirmed_at?: string | null
          rights_confirmed_by?: string | null
          source_type?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          access_level?: Database["public"]["Enums"]["provider_access_level"]
          cleanup_status?: Database["public"]["Enums"]["cleanup_state"]
          created_at?: string
          created_by?: string | null
          duration?: number | null
          embed_url?: string | null
          error?: string | null
          expires_at?: string | null
          external_url?: string | null
          external_video_id?: string | null
          file_size?: number | null
          game_id?: string
          height?: number | null
          id?: string
          ingestion_status?: Database["public"]["Enums"]["video_ingestion_status"]
          is_primary?: boolean
          is_temporary?: boolean
          label?: string
          mime_type?: string | null
          original_filename?: string | null
          permissions_status?: Database["public"]["Enums"]["source_permission_state"]
          playback_url?: string | null
          processing_status?: Database["public"]["Enums"]["video_ingestion_status"]
          provider?: Database["public"]["Enums"]["video_provider"]
          provider_connection_id?: string | null
          provider_metadata?: Json
          rights_confirmed_at?: string | null
          rights_confirmed_by?: string | null
          source_type?: string
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_assets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_assets_provider_connection_id_fkey"
            columns: ["provider_connection_id"]
            isOneToOne: false
            referencedRelation: "video_provider_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      video_provider_connections: {
        Row: {
          config: Json
          connected_at: string | null
          created_at: string
          external_account_id: string | null
          id: string
          owner_id: string
          provider: Database["public"]["Enums"]["video_provider"]
          status: Database["public"]["Enums"]["provider_connection_status"]
          updated_at: string
        }
        Insert: {
          config?: Json
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          owner_id?: string
          provider: Database["public"]["Enums"]["video_provider"]
          status?: Database["public"]["Enums"]["provider_connection_status"]
          updated_at?: string
        }
        Update: {
          config?: Json
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          owner_id?: string
          provider?: Database["public"]["Enums"]["video_provider"]
          status?: Database["public"]["Enums"]["provider_connection_status"]
          updated_at?: string
        }
        Relationships: []
      }
      video_source_metadata: {
        Row: {
          created_at: string
          id: string
          key: string
          retrieved_at: string
          retrieved_from: string | null
          updated_at: string
          value: Json
          video_asset_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          retrieved_at?: string
          retrieved_from?: string | null
          updated_at?: string
          value?: Json
          video_asset_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          retrieved_at?: string
          retrieved_from?: string | null
          updated_at?: string
          value?: Json
          video_asset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_source_metadata_video_asset_id_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "video_assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_clip: { Args: { _clip_id: string }; Returns: boolean }
      can_view_game: { Args: { _game_id: string }; Returns: boolean }
      can_view_player: { Args: { _player_id: string }; Returns: boolean }
      can_view_playlist: { Args: { _playlist_id: string }; Returns: boolean }
      can_view_reel: { Args: { _reel_id: string }; Returns: boolean }
      has_resource_share: {
        Args: {
          _id: string
          _type: Database["public"]["Enums"]["shared_resource_type"]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_game: { Args: { _game_id: string }; Returns: boolean }
      owns_player: { Args: { _player_id: string }; Returns: boolean }
      owns_playlist: { Args: { _playlist_id: string }; Returns: boolean }
      owns_reel: { Args: { _reel_id: string }; Returns: boolean }
      shares_identity_with: {
        Args: { _other_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      analysis_job_status:
        | "not_started"
        | "queued"
        | "preparing_video"
        | "identifying_player"
        | "tracking_player"
        | "generating_candidates"
        | "ready_for_review"
        | "needs_confirmation"
        | "failed"
        | "cancelled"
        | "completed"
      app_role: "athlete" | "parent" | "coach" | "trainer" | "admin"
      candidate_review_status: "pending" | "approved" | "rejected" | "edited"
      cleanup_state:
        | "not_required"
        | "pending"
        | "in_progress"
        | "done"
        | "failed"
      data_source: "manual" | "ai" | "ai_corrected"
      external_link_provider:
        | "instagram"
        | "youtube"
        | "hudl"
        | "twitter"
        | "other"
      identity_confirmation_source:
        | "user_confirmation"
        | "user_correction"
        | "ai_suggestion"
      play_side: "offense" | "defense" | "neutral" | "special"
      player_reference_type:
        | "headshot"
        | "full_body"
        | "practice"
        | "game_crop"
        | "reference_video"
        | "other"
      provider_access_level:
        | "link_only"
        | "embed_available"
        | "authorized_api"
        | "raw_video_available"
        | "unsupported"
      provider_connection_status:
        | "not_connected"
        | "connected"
        | "needs_configuration"
      share_permission: "view" | "comment"
      share_status: "pending" | "active" | "revoked"
      shared_resource_type:
        | "game"
        | "playlist"
        | "film_review"
        | "reel"
        | "development_report"
      source_permission_state:
        | "unknown"
        | "owner"
        | "shared"
        | "no_access"
        | "not_applicable"
      video_ingestion_status:
        | "waiting"
        | "uploading"
        | "uploaded"
        | "processing"
        | "ready"
        | "failed"
      video_provider:
        | "upload"
        | "youtube"
        | "hudl"
        | "external"
        | "google_drive"
      workflow_status:
        | "upload_pending"
        | "uploaded"
        | "processing"
        | "ready_for_review"
        | "reviewed"
        | "error"
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
    Enums: {
      analysis_job_status: [
        "not_started",
        "queued",
        "preparing_video",
        "identifying_player",
        "tracking_player",
        "generating_candidates",
        "ready_for_review",
        "needs_confirmation",
        "failed",
        "cancelled",
        "completed",
      ],
      app_role: ["athlete", "parent", "coach", "trainer", "admin"],
      candidate_review_status: ["pending", "approved", "rejected", "edited"],
      cleanup_state: [
        "not_required",
        "pending",
        "in_progress",
        "done",
        "failed",
      ],
      data_source: ["manual", "ai", "ai_corrected"],
      external_link_provider: [
        "instagram",
        "youtube",
        "hudl",
        "twitter",
        "other",
      ],
      identity_confirmation_source: [
        "user_confirmation",
        "user_correction",
        "ai_suggestion",
      ],
      play_side: ["offense", "defense", "neutral", "special"],
      player_reference_type: [
        "headshot",
        "full_body",
        "practice",
        "game_crop",
        "reference_video",
        "other",
      ],
      provider_access_level: [
        "link_only",
        "embed_available",
        "authorized_api",
        "raw_video_available",
        "unsupported",
      ],
      provider_connection_status: [
        "not_connected",
        "connected",
        "needs_configuration",
      ],
      share_permission: ["view", "comment"],
      share_status: ["pending", "active", "revoked"],
      shared_resource_type: [
        "game",
        "playlist",
        "film_review",
        "reel",
        "development_report",
      ],
      source_permission_state: [
        "unknown",
        "owner",
        "shared",
        "no_access",
        "not_applicable",
      ],
      video_ingestion_status: [
        "waiting",
        "uploading",
        "uploaded",
        "processing",
        "ready",
        "failed",
      ],
      video_provider: ["upload", "youtube", "hudl", "external", "google_drive"],
      workflow_status: [
        "upload_pending",
        "uploaded",
        "processing",
        "ready_for_review",
        "reviewed",
        "error",
      ],
    },
  },
} as const

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase client as the workbench sees it: possibly absent, because
 * accounts are optional and the app must run fully signed-out.
 */
export type AuthClient = SupabaseClient | null;

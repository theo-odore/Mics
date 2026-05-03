import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function createNoopQuery(result = { data: [], error: null }) {
	const chain = {
		select() { return chain },
		eq() { return chain },
		order() { return chain },
		limit() { return chain },
		insert() { return Promise.resolve({ data: null, error: null }) },
		delete() { return Promise.resolve({ data: null, error: null }) },
		then(resolve) {
			return Promise.resolve(result).then(resolve)
		},
	}
	return chain
}

function createFallbackSupabase() {
	return {
		__configured: false,
		auth: {
			getSession: async () => ({ data: { session: null }, error: null }),
			onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
			signInWithOAuth: async () => ({ data: null, error: { message: 'Supabase is not configured in this environment.' } }),
			signUp: async () => ({ data: null, error: { message: 'Supabase is not configured in this environment.' } }),
			signInWithPassword: async () => ({ data: null, error: { message: 'Supabase is not configured in this environment.' } }),
			resetPasswordForEmail: async () => ({ data: null, error: { message: 'Supabase is not configured in this environment.' } }),
			signOut: async () => ({ data: null, error: null }),
		},
		from() {
			return createNoopQuery()
		},
	}
}

export const supabase = supabaseUrl && supabaseAnonKey
	? createClient(supabaseUrl, supabaseAnonKey)
	: createFallbackSupabase()

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

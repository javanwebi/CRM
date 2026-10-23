-- Supabase's postgres login is not a superuser; allow explicit scoped transactions.
GRANT crm_runtime TO postgres;

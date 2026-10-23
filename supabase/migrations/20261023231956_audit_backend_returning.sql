-- INSERT ... RETURNING id requires SELECT privilege and a SELECT policy.
GRANT SELECT(id) ON public.audit_logs TO crm_server;
CREATE POLICY server_audit_returning ON public.audit_logs FOR SELECT TO crm_server USING(true);

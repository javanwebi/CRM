-- A writer may read the ID of their own inserted audit row for transactional RETURNING.
ALTER POLICY scoped_read ON public.audit_logs USING(private.can(tenant_id,'team.manage') OR (private.can(tenant_id,'crm.read') AND actor_id=private.identity()));

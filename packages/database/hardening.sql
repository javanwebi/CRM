-- Split write policies by operation so SELECT never evaluates two permissive policies.
DO $$ DECLARE tab text; perm text; BEGIN
 FOREACH tab IN ARRAY ARRAY['accounts','contacts','leads','pipelines','pipeline_stages','deals','activities','tasks','notes','tenant_settings'] LOOP
  perm:=CASE WHEN tab='tenant_settings' THEN 'settings.manage' ELSE 'crm.write' END;
  EXECUTE format('DROP POLICY scoped_write ON public.%I',tab);
  EXECUTE format('CREATE POLICY scoped_insert ON public.%I FOR INSERT TO crm_runtime WITH CHECK(private.can(tenant_id,%L))',tab,perm);
  EXECUTE format('CREATE POLICY scoped_update ON public.%I FOR UPDATE TO crm_runtime USING(private.can(tenant_id,%L)) WITH CHECK(private.can(tenant_id,%L))',tab,perm,perm);
  EXECUTE format('CREATE POLICY scoped_delete ON public.%I FOR DELETE TO crm_runtime USING(private.can(tenant_id,%L))',tab,perm);
 END LOOP;
END $$;
ALTER POLICY scoped_read ON public.audit_logs USING(private.can(tenant_id,'team.manage'));
ALTER TABLE public.ai_runs ADD UNIQUE(tenant_id,id);
ALTER TABLE public.tool_registry ADD UNIQUE(tenant_id,id);
ALTER TABLE public.ai_runs ADD CONSTRAINT ai_run_member FOREIGN KEY(tenant_id,requested_by) REFERENCES public.memberships(tenant_id,user_id);
ALTER TABLE public.tool_permissions DROP CONSTRAINT tool_permissions_tool_id_fkey;
ALTER TABLE public.tool_permissions ADD CONSTRAINT tool_permission_tool FOREIGN KEY(tenant_id,tool_id) REFERENCES public.tool_registry(tenant_id,id);
ALTER TABLE public.tool_permissions ADD CONSTRAINT tool_permission_role FOREIGN KEY(tenant_id,role_id) REFERENCES public.roles(tenant_id,id);
ALTER TABLE public.approval_requests DROP CONSTRAINT approval_requests_run_id_fkey;
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_run FOREIGN KEY(tenant_id,run_id) REFERENCES public.ai_runs(tenant_id,id);
ALTER TABLE public.approval_requests ADD CONSTRAINT approval_member FOREIGN KEY(tenant_id,approved_by) REFERENCES public.memberships(tenant_id,user_id);
ALTER TABLE public.execution_logs DROP CONSTRAINT execution_logs_run_id_fkey;
ALTER TABLE public.execution_logs ADD CONSTRAINT execution_run FOREIGN KEY(tenant_id,run_id) REFERENCES public.ai_runs(tenant_id,id);
CREATE INDEX invitations_role ON private.invitations(tenant_id,role_id);
CREATE INDEX activities_account ON public.activities(tenant_id,account_id);
CREATE INDEX contacts_account ON public.contacts(tenant_id,account_id);
CREATE INDEX notes_account ON public.notes(tenant_id,account_id);
CREATE INDEX deals_account ON public.deals(tenant_id,account_id);
CREATE INDEX deals_stage ON public.deals(tenant_id,pipeline_id,stage_id);
CREATE INDEX memberships_role ON public.memberships(tenant_id,role_id);
CREATE INDEX audit_actor ON public.audit_logs(actor_id);
CREATE INDEX ai_runs_requester ON public.ai_runs(requested_by);
CREATE INDEX ai_runs_member ON public.ai_runs(tenant_id,requested_by);
CREATE INDEX approval_run ON public.approval_requests(tenant_id,run_id);
CREATE INDEX approval_member ON public.approval_requests(tenant_id,approved_by);
CREATE INDEX approval_user ON public.approval_requests(approved_by);
CREATE INDEX execution_run ON public.execution_logs(tenant_id,run_id);
CREATE INDEX tool_permissions_tool ON public.tool_permissions(tenant_id,tool_id);
CREATE INDEX tool_permissions_role ON public.tool_permissions(tenant_id,role_id);
CREATE INDEX background_jobs_tenant ON public.background_jobs(tenant_id);

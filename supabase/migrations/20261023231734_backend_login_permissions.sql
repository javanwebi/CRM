-- Trusted API login. Business queries explicitly SET LOCAL ROLE crm_runtime.
-- Set its password using a secret manager; never include a password in migrations.
CREATE ROLE crm_server LOGIN NOINHERIT NOBYPASSRLS;
GRANT crm_runtime TO crm_server;
GRANT USAGE ON SCHEMA public,private TO crm_server;
GRANT SELECT,INSERT ON public.users TO crm_server;
CREATE POLICY server_auth ON public.users FOR ALL TO crm_server USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE ON private.sessions TO crm_server;
GRANT SELECT,INSERT,UPDATE ON private.invitations TO crm_server;
GRANT SELECT,INSERT,UPDATE ON public.tenants,public.roles,public.memberships,public.tenant_settings,public.pipelines,public.pipeline_stages TO crm_server;
CREATE POLICY server_bootstrap ON public.tenants FOR ALL TO crm_server USING(true) WITH CHECK(true);
CREATE POLICY server_bootstrap ON public.roles FOR ALL TO crm_server USING(true) WITH CHECK(true);
CREATE POLICY server_bootstrap ON public.memberships FOR ALL TO crm_server USING(true) WITH CHECK(true);
CREATE POLICY server_bootstrap ON public.tenant_settings FOR ALL TO crm_server USING(true) WITH CHECK(true);
CREATE POLICY server_bootstrap ON public.pipelines FOR ALL TO crm_server USING(true) WITH CHECK(true);
CREATE POLICY server_bootstrap ON public.pipeline_stages FOR ALL TO crm_server USING(true) WITH CHECK(true);
GRANT INSERT ON public.audit_logs TO crm_server;
CREATE POLICY server_audit ON public.audit_logs FOR INSERT TO crm_server WITH CHECK(true);
CREATE INDEX sessions_expiry ON private.sessions(expires_at);
CREATE INDEX sessions_user ON private.sessions(user_id);
CREATE INDEX invitations_tenant ON private.invitations(tenant_id,email);

-- Phase two: additive only. Run on development before production approval.
CREATE TABLE public.channels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,kind text NOT NULL CHECK(kind IN ('email','sms','whatsapp','internal')),enabled boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id));
CREATE TABLE public.conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,channel_id uuid NOT NULL,account_id uuid,contact_id uuid,deal_id uuid,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','closed')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,channel_id) REFERENCES channels(tenant_id,id),FOREIGN KEY(tenant_id,account_id) REFERENCES accounts(tenant_id,id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id),FOREIGN KEY(tenant_id,deal_id) REFERENCES deals(tenant_id,id));
CREATE TABLE public.participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,conversation_id uuid NOT NULL,address text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),UNIQUE(tenant_id,conversation_id,address),FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id));
CREATE TABLE public.messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL DEFAULT 'Draft',conversation_id uuid NOT NULL,body text NOT NULL CHECK(length(body)<=20000),direction text NOT NULL DEFAULT 'draft' CHECK(direction IN ('draft','internal')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id));
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,user_id uuid NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id));
CREATE TABLE public.call_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,account_id uuid,outcome text NOT NULL CHECK(outcome IN ('answered','no_answer','busy','follow_up')),duration_seconds integer NOT NULL DEFAULT 0 CHECK(duration_seconds>=0),description text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(tenant_id,account_id) REFERENCES accounts(tenant_id,id));
CREATE TABLE public.workflows(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,trigger text NOT NULL CHECK(trigger IN ('conversation.created','manual')),condition_status text NOT NULL DEFAULT 'open' CHECK(condition_status IN ('open','pending','closed')),action text NOT NULL CHECK(action IN ('task.create','notification.create')),enabled boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id));
CREATE TABLE public.operation_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,workflow_id uuid NOT NULL,conversation_id uuid NOT NULL,requested_by uuid NOT NULL,idempotency_key text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','retry','dead')),attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,idempotency_key),FOREIGN KEY(tenant_id,workflow_id) REFERENCES workflows(tenant_id,id),FOREIGN KEY(tenant_id,conversation_id) REFERENCES conversations(tenant_id,id),FOREIGN KEY(tenant_id,requested_by) REFERENCES memberships(tenant_id,user_id));
ALTER TABLE tasks ADD COLUMN account_id uuid, ADD COLUMN reminder_at timestamptz, ADD CONSTRAINT task_account FOREIGN KEY(tenant_id,account_id) REFERENCES accounts(tenant_id,id);
DO $$ DECLARE tab text; perm text; BEGIN
 FOREACH tab IN ARRAY ARRAY['channels','conversations','participants','messages','notifications','call_logs','workflows','operation_jobs'] LOOP
  perm:=CASE WHEN tab IN ('channels','workflows','operation_jobs') THEN 'settings.manage' ELSE 'crm.write' END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,crm_server',tab);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO crm_runtime',tab);
  EXECUTE format('CREATE POLICY scoped_read ON public.%I FOR SELECT TO crm_runtime USING(private.can(tenant_id,''crm.read''))',tab);
  EXECUTE format('CREATE POLICY scoped_insert ON public.%I FOR INSERT TO crm_runtime WITH CHECK(private.can(tenant_id,%L))',tab,perm);
  EXECUTE format('CREATE POLICY scoped_update ON public.%I FOR UPDATE TO crm_runtime USING(private.can(tenant_id,%L)) WITH CHECK(private.can(tenant_id,%L))',tab,perm,perm);
  EXECUTE format('CREATE INDEX ON public.%I(tenant_id,created_at)',tab);
 END LOOP;
END $$;
DROP POLICY scoped_read ON notifications;
CREATE POLICY scoped_read ON notifications FOR SELECT TO crm_runtime USING(private.can(tenant_id,'crm.read') AND user_id=private.identity());
DROP POLICY scoped_update ON notifications;
CREATE POLICY scoped_update ON notifications FOR UPDATE TO crm_runtime USING(private.can(tenant_id,'crm.read') AND user_id=private.identity()) WITH CHECK(private.can(tenant_id,'crm.read') AND user_id=private.identity());
CREATE INDEX conversations_account ON conversations(tenant_id,account_id);
CREATE INDEX messages_conversation ON messages(tenant_id,conversation_id,created_at);
CREATE INDEX jobs_pending ON operation_jobs(tenant_id,status,available_at);

-- Queue discovery reveals only routing metadata. Business data remains under runtime RLS.
GRANT SELECT(id,tenant_id,requested_by,status,available_at) ON operation_jobs TO crm_server;
CREATE POLICY server_queue_discovery ON operation_jobs FOR SELECT TO crm_server USING(true);
DROP POLICY scoped_read ON operation_jobs;
CREATE POLICY scoped_read ON operation_jobs FOR SELECT TO crm_runtime USING(private.can(tenant_id,'crm.read') AND requested_by=private.identity());
DROP POLICY scoped_insert ON operation_jobs;
CREATE POLICY scoped_insert ON operation_jobs FOR INSERT TO crm_runtime WITH CHECK(private.can(tenant_id,'crm.write') AND requested_by=private.identity());
DROP POLICY scoped_update ON operation_jobs;
CREATE POLICY scoped_update ON operation_jobs FOR UPDATE TO crm_runtime USING(private.can(tenant_id,'crm.write') AND requested_by=private.identity()) WITH CHECK(private.can(tenant_id,'crm.write') AND requested_by=private.identity());
CREATE FUNCTION private.enqueue_conversation_workflows() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 INSERT INTO public.operation_jobs(tenant_id,name,workflow_id,conversation_id,requested_by,idempotency_key)
 SELECT NEW.tenant_id,w.name,w.id,NEW.id,private.identity(),'conversation:'||NEW.id||':'||w.id FROM public.workflows w WHERE w.tenant_id=NEW.tenant_id AND w.enabled AND w.trigger='conversation.created';
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enqueue_conversation_workflows() FROM PUBLIC;
CREATE TRIGGER conversation_workflows AFTER INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION private.enqueue_conversation_workflows();

ALTER TABLE tasks ADD COLUMN owner_id uuid DEFAULT private.identity(),ADD COLUMN reminder_sent_at timestamptz,ADD CONSTRAINT task_owner FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,user_id);
GRANT SELECT(tenant_id,owner_id,reminder_at,reminder_sent_at,status) ON tasks TO crm_server;
CREATE POLICY server_reminder_discovery ON tasks FOR SELECT TO crm_server USING(reminder_at IS NOT NULL AND reminder_sent_at IS NULL);
CREATE INDEX tasks_reminder ON tasks(tenant_id,owner_id,reminder_at) WHERE reminder_at IS NOT NULL AND reminder_sent_at IS NULL;

BEGIN;
DO $$
DECLARE ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid(); ta uuid:=gen_random_uuid(); tb uuid:=gen_random_uuid(); ra uuid:=gen_random_uuid(); rb uuid:=gen_random_uuid(); n integer;
BEGIN
 INSERT INTO public.users(id,email,name,password_hash) VALUES(ua,ua::text||'@example.invalid','Isolation A','disabled'),(ub,ub::text||'@example.invalid','Isolation B','disabled');
 INSERT INTO public.tenants(id,name) VALUES(ta,'Isolation A'),(tb,'Isolation B');
 INSERT INTO public.roles(id,tenant_id,name,grants) VALUES(ra,ta,'Owner',ARRAY['crm.read','crm.write']),(rb,tb,'Owner',ARRAY['crm.read','crm.write']);
 INSERT INTO public.memberships(tenant_id,user_id,role_id) VALUES(ta,ua,ra),(tb,ub,rb);
 INSERT INTO public.accounts(tenant_id,name) VALUES(ta,'Private A');
 PERFORM set_config('app.user_id',ub::text,true);
 SET LOCAL ROLE crm_runtime;
 SELECT count(*) INTO n FROM public.accounts WHERE tenant_id=ta;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant SELECT succeeded'; END IF;
 UPDATE public.accounts SET name='intrusion' WHERE tenant_id=ta;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant UPDATE succeeded'; END IF;
 BEGIN
  INSERT INTO public.accounts(tenant_id,name) VALUES(ta,'intrusion');
  RAISE EXCEPTION 'Cross-tenant INSERT succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
END $$;
ROLLBACK;
SELECT 'RLS SELECT, UPDATE, INSERT isolation passed; all fixtures rolled back' AS result;

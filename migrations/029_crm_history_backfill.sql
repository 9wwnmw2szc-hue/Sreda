CREATE TEMP TABLE crm_conversation_backfill ON COMMIT DROP AS
 SELECT c.id AS source_id,c.business_id,coalesce(i.client_id,gen_random_uuid()) AS client_id
 FROM communication_conversation c LEFT JOIN client_identity i ON i.business_id=c.business_id AND i.kind=c.platform AND i.value=c.external_user_id
 WHERE c.client_id IS NULL;
INSERT INTO client(id,business_id,name,first_seen_at,last_seen_at,created_at,updated_at)
 SELECT m.client_id,m.business_id,coalesce(nullif(c.external_username,''),'Клиент'),c.created_at,c.last_message_at,c.created_at,c.last_message_at
 FROM crm_conversation_backfill m JOIN communication_conversation c ON c.id=m.source_id
 WHERE NOT EXISTS(SELECT 1 FROM client existing WHERE existing.id=m.client_id);
INSERT INTO client_identity(business_id,client_id,kind,value,username)
 SELECT m.business_id,m.client_id,c.platform,c.external_user_id,c.external_username FROM crm_conversation_backfill m JOIN communication_conversation c ON c.id=m.source_id
 ON CONFLICT(business_id,kind,value) DO NOTHING;
UPDATE communication_conversation c SET client_id=i.client_id FROM client_identity i
 WHERE c.client_id IS NULL AND i.business_id=c.business_id AND i.kind=c.platform AND i.value=c.external_user_id;
CREATE TEMP TABLE crm_lead_backfill ON COMMIT DROP AS SELECT id AS source_id,business_id,gen_random_uuid() AS client_id FROM lead WHERE client_id IS NULL;
INSERT INTO client(id,business_id,name,phone,first_seen_at,last_seen_at,created_at,updated_at)
 SELECT m.client_id,m.business_id,l.name,l.phone,l.created_at,l.updated_at,l.created_at,l.updated_at FROM crm_lead_backfill m JOIN lead l ON l.id=m.source_id;
UPDATE lead l SET client_id=m.client_id FROM crm_lead_backfill m WHERE l.id=m.source_id;
INSERT INTO client_activity(id,business_id,client_id,type,target_id,event_key,created_at)
 SELECT gen_random_uuid(),m.business_id,m.client_id,'lead.created',l.id,'legacy-lead:'||l.id,l.created_at FROM crm_lead_backfill m JOIN lead l ON l.id=m.source_id ON CONFLICT(business_id,event_key) DO NOTHING;
INSERT INTO client_activity(id,business_id,client_id,type,target_id,event_key,created_at)
 SELECT gen_random_uuid(),c.business_id,c.client_id,'message.received',c.id,'legacy-conversation:'||c.id,c.created_at FROM crm_conversation_backfill m JOIN communication_conversation c ON c.id=m.source_id ON CONFLICT(business_id,event_key) DO NOTHING;

ALTER TABLE post_target DROP CONSTRAINT post_target_connection_id_fkey;
ALTER TABLE post_target ADD CONSTRAINT post_target_connection_scope
 FOREIGN KEY(business_id,connection_id) REFERENCES business_connection(business_id,id);

-- =========================================================================
-- 008_sync_database_sequences.sql
-- Synchronizes all sequences with the maximum value in their associated tables
-- Guarantees primary key unique constraints never fail on sequence-driven tables
-- =========================================================================

DO $$
DECLARE
    rec RECORD;
    v_max BIGINT;
    v_sql TEXT;
BEGIN
    FOR rec IN 
        SELECT 
            t.relname AS table_name,
            a.attname AS col_name,
            s.relname AS seq_name
        FROM pg_class s
        JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass
        JOIN pg_class t ON t.oid = d.refobjid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
        WHERE s.relkind = 'S' AND t.relnamespace = 'public'::regnamespace
    LOOP
        v_sql := format('SELECT COALESCE(MAX(%I), 1) FROM public.%I', rec.col_name, rec.table_name);
        EXECUTE v_sql INTO v_max;
        
        PERFORM setval(
            format('public.%I', rec.seq_name),
            GREATEST(v_max, 1),
            true
        );
        
        RAISE NOTICE 'Synchronized sequence % for %.% to %', rec.seq_name, rec.table_name, rec.col_name, GREATEST(v_max, 1);
    END LOOP;
END $$;

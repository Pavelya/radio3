-- Rollback: Drop DLQ table

DROP TABLE IF EXISTS dead_letter_queue;

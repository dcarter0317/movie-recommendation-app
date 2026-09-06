/**
 * Database schema.
 *
 * Feature 3 (data model) defines the tables, relations, and row level
 * security policies here: users (internal uuid id + `clerk_user_id`),
 * movies (with a `vector(1536)` embedding column and an HNSW index),
 * ratings, swipe reactions, taste profile, feed feedback, watchlist,
 * and `usage_counters`. Left empty on purpose for the scaffold.
 */
export {};

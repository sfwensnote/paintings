PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    share_id TEXT UNIQUE,
    question_set_version TEXT NOT NULL,
    question_order_version TEXT NOT NULL,
    scoring_model_version TEXT NOT NULL,
    artwork_set_version TEXT NOT NULL,
    artwork_vector_version TEXT NOT NULL,
    report_version TEXT NOT NULL,
    answers_json TEXT NOT NULL DEFAULT '{}',
    scores_json TEXT,
    type_id TEXT,
    primary_artwork_id TEXT,
    secondary_artwork_ids_json TEXT,
    similarity_scores_json TEXT,
    completion_time_seconds INTEGER,
    result_rating INTEGER CHECK (result_rating BETWEEN 1 AND 5),
    feedback_text TEXT,
    share_event INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(primary_artwork_id) REFERENCES artworks(artwork_id)
);

CREATE TABLE IF NOT EXISTS artworks (
    artwork_id TEXT PRIMARY KEY,
    type_id TEXT,
    name_cn TEXT NOT NULL,
    name_en TEXT NOT NULL,
    artist_cn TEXT NOT NULL,
    artist_en TEXT NOT NULL,
    year TEXT NOT NULL,
    dimensions_json TEXT NOT NULL,
    keywords_json TEXT NOT NULL,
    archetype_name TEXT NOT NULL,
    hit_line TEXT NOT NULL,
    life_narrative TEXT NOT NULL,
    why_this_artwork TEXT NOT NULL,
    art_context TEXT NOT NULL,
    image_url TEXT NOT NULL,
    image_source TEXT NOT NULL,
    copyright_status TEXT NOT NULL,
    image_layout TEXT NOT NULL DEFAULT 'fit',
    status TEXT NOT NULL DEFAULT 'draft',
    catalog_kind TEXT NOT NULL DEFAULT 'formal',
    type_code TEXT,
    culture_and_style TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending_human_review',
    version TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
    session_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    answer_option TEXT NOT NULL,
    raw_score INTEGER NOT NULL CHECK (raw_score BETWEEN 0 AND 3),
    created_at TEXT NOT NULL,
    PRIMARY KEY(session_id, question_id),
    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artwork_set_versions (
    version TEXT PRIMARY KEY,
    artworks_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    published_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_set_versions (
    version TEXT PRIMARY KEY,
    questions_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id TEXT,
    event_name TEXT NOT NULL,
    question_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS payment_events (
    payment_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    amount_minor_units INTEGER,
    currency TEXT,
    provider_reference TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_events_name_time ON events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_completed ON sessions(completed_at);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id, answer_option);

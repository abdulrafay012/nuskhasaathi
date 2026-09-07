const pool = require('./db');

const initDB = () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      age INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      image_url TEXT NOT NULL,
      raw_ocr_text TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      prescription_id TEXT REFERENCES prescriptions(id),
      name TEXT NOT NULL,
      dosage TEXT,
      frequency TEXT,
      duration TEXT,
      purpose_explanation TEXT,
      confidence TEXT CHECK (confidence IN ('confident','uncertain')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS interaction_flags (
      id TEXT PRIMARY KEY,
      prescription_id TEXT REFERENCES prescriptions(id),
      medicine_a TEXT,
      medicine_b TEXT,
      warning_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  try {
    for (const query of queries) {
      pool.query(query);
    }
    console.log('All tables created successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }

  try {
    const { rows: columns } = pool.query('PRAGMA table_info(users)');
    const columnNames = columns.map((column) => column.name);

    if (!columnNames.includes('reset_token')) {
      pool.query('ALTER TABLE users ADD COLUMN reset_token TEXT');
    }

    if (!columnNames.includes('reset_token_expiry')) {
      pool.query('ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME');
    }

    if (!columnNames.includes('caregiver_token')) {
      pool.query('ALTER TABLE users ADD COLUMN caregiver_token TEXT');
    }
    pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_caregiver_token ON users(caregiver_token)');

    console.log('Users table migrations completed successfully');
  } catch (err) {
    console.error('Error migrating users table:', err);
    throw err;
  }
};

module.exports = initDB;

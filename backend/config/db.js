const Database = require('better-sqlite3');
const path = require('path');

// SQLITE_PATH lets the automated test suite point the app at a throwaway
// database; unset (normal dev/prod runs) the path is unchanged.
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'nuskhasaathi.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function convertParams(sql, params = []) {
  const convertedParams = [];
  const convertedSql = sql.replace(
    /=\s*ANY\(\$(\d+)::uuid\[\]\)|\$(\d+)(?:::[\w[\]]+)?/gi,
    (placeholder, arrayNumber, scalarNumber) => {
      if (arrayNumber) {
        const values = params[Number(arrayNumber) - 1] || [];
        convertedParams.push(...values);
        return values.length > 0 ? `IN (${values.map(() => '?').join(', ')})` : 'IN (NULL)';
      }

      convertedParams.push(params[Number(scalarNumber) - 1]);
      return '?';
    }
  );

  return {
    sql: convertedSql,
    params: convertedParams.length > 0 ? convertedParams : params,
  };
}

function handleReturning(sql, params) {
  const returningMatch = sql.match(/\s+RETURNING\s+(.+?)\s*;?\s*$/is);
  if (!returningMatch) return null;

  const cleanSql = sql.slice(0, returningMatch.index);
  const converted = convertParams(cleanSql, params);
  const info = db.prepare(converted.sql).run(...converted.params);

  const insertMatch = cleanSql.match(/INSERT\s+INTO\s+(\w+)/i);
  const updateMatch = cleanSql.match(/UPDATE\s+(\w+)/i);
  const tableName = (insertMatch && insertMatch[1]) || (updateMatch && updateMatch[1]);

  if (!tableName || info.changes === 0) {
    return { rows: [] };
  }

  const columns = returningMatch[1].replace(/\b\w+\.\*/g, '*');
  let row;

  if (insertMatch) {
    row = db.prepare(`SELECT ${columns} FROM ${tableName} WHERE rowid = ?`).get(info.lastInsertRowid);
  } else {
    const idMatch = cleanSql.match(/\bWHERE[\s\S]*?\bid\s*=\s*\$(\d+)/i);
    const id = idMatch ? params[Number(idMatch[1]) - 1] : params[params.length - 1];
    row = db.prepare(`SELECT ${columns} FROM ${tableName} WHERE id = ?`).get(id);
  }

  return { rows: row ? [row] : [] };
}

const pool = {
  query(sql, params = []) {
    const returningResult = handleReturning(sql, params);
    if (returningResult) return returningResult;

    const converted = convertParams(sql, params);
    const statement = db.prepare(converted.sql);
    const command = sql.trim().split(/\s+/, 1)[0].toUpperCase();

    if (command === 'SELECT' || command === 'PRAGMA') {
      return { rows: statement.all(...converted.params) };
    }

    const info = statement.run(...converted.params);
    return { rows: [], changes: info.changes };
  },

  connect() {
    return {
      query(sql, params) {
        return pool.query(sql, params);
      },
      release() {
        // SQLite uses a single process-local connection.
      },
    };
  },
};

module.exports = pool;

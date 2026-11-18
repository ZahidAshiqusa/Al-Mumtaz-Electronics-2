'use strict';

/**
 * lib/supabaseUsers.js — Dual-Mode Customer Account Persistence in Supabase
 * Supports:
 * 1. PostgreSQL URI (`SUPABASE_DB_URL` / `DATABASE_URL`) via `pg.Pool` (auto-provisions `store_users` table)
 * 2. Supabase PostgREST HTTP API (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_KEY`)
 */

const { getSupabaseCredentials, getPgPool, supabaseRestRequest } = require('./authState');

let _usersTableReady = false;
let _lastUserSyncError = null;

async function ensureSupabaseUsersTable(pool) {
    if (!pool || _usersTableReady) return _usersTableReady;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS store_users (
            whatsapp_digits VARCHAR(32) PRIMARY KEY,
            whatsapp_e164 VARCHAR(32) NOT NULL,
            name VARCHAR(120) NOT NULL,
            password_hash TEXT NOT NULL,
            is_verified BOOLEAN DEFAULT TRUE,
            verified_at TIMESTAMPTZ DEFAULT NOW(),
            last_login_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    _usersTableReady = true;
    return true;
}

function mapSupabaseUserRow(row) {
    if (!row) return null;
    return {
        name: String(row.name || '').trim(),
        whatsappDigits: String(row.whatsapp_digits || '').replace(/\D/g, ''),
        whatsappNumber: String(row.whatsapp_e164 || '').trim(),
        passwordHash: String(row.password_hash || ''),
        isVerified: row.is_verified !== false,
        verifiedAt: row.verified_at || null,
        lastLoginAt: row.last_login_at || null,
        createdAt: row.created_at || null,
        supabaseSynced: true
    };
}

/**
 * Upsert a verified store customer record to Supabase `store_users`.
 */
async function saveVerifiedUserToSupabase(user) {
    if (!user || !user.whatsappDigits) {
        return { synced: false, mode: 'invalid_user' };
    }

    const creds = getSupabaseCredentials();
    if (!creds.isConfigured) {
        return { synced: false, mode: 'local_sqlite_only' };
    }

    const payload = {
        whatsapp_digits: String(user.whatsappDigits).replace(/\D/g, ''),
        whatsapp_e164: String(user.whatsappNumber || `+${user.whatsappDigits}`),
        name: String(user.name || 'Customer').trim(),
        password_hash: String(user.passwordHash || ''),
        is_verified: Boolean(user.isVerified !== false),
        verified_at: user.verifiedAt || new Date().toISOString(),
        last_login_at: user.lastLoginAt || new Date().toISOString()
    };

    if (creds.hasPostgresUri) {
        try {
            const pool = await getPgPool();
            if (pool) {
                await ensureSupabaseUsersTable(pool);
                await pool.query(
                    `INSERT INTO store_users (whatsapp_digits, whatsapp_e164, name, password_hash, is_verified, verified_at, last_login_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (whatsapp_digits) DO UPDATE SET
                        whatsapp_e164 = EXCLUDED.whatsapp_e164,
                        name = EXCLUDED.name,
                        password_hash = EXCLUDED.password_hash,
                        is_verified = EXCLUDED.is_verified,
                        verified_at = COALESCE(store_users.verified_at, EXCLUDED.verified_at),
                        last_login_at = EXCLUDED.last_login_at`,
                    [
                        payload.whatsapp_digits,
                        payload.whatsapp_e164,
                        payload.name,
                        payload.password_hash,
                        payload.is_verified,
                        payload.verified_at,
                        payload.last_login_at
                    ]
                );
                _lastUserSyncError = null;
                return { synced: true, mode: 'postgres_uri' };
            }
        } catch (err) {
            _lastUserSyncError = err.message;
        }
    }

    if (creds.hasRestApi) {
        const res = await supabaseRestRequest('store_users', {
            method: 'POST',
            query: 'on_conflict=whatsapp_digits',
            body: payload,
            prefer: 'resolution=merge-duplicates,return=minimal'
        });
        if (res !== null) {
            _lastUserSyncError = null;
            return { synced: true, mode: 'rest_api' };
        }
    }

    return { synced: false, mode: creds.mode, error: _lastUserSyncError || 'Supabase write failed' };
}

/**
 * Look up a customer by normalized WhatsApp digits from Supabase `store_users`.
 */
async function findUserInSupabase(whatsappDigits) {
    const clean = String(whatsappDigits || '').replace(/\D/g, '');
    if (!clean) return null;

    const creds = getSupabaseCredentials();
    if (!creds.isConfigured) return null;

    if (creds.hasPostgresUri) {
        try {
            const pool = await getPgPool();
            if (pool) {
                await ensureSupabaseUsersTable(pool);
                const { rows } = await pool.query(
                    `SELECT whatsapp_digits, whatsapp_e164, name, password_hash, is_verified, verified_at, last_login_at, created_at
                     FROM store_users WHERE whatsapp_digits = $1 LIMIT 1`,
                    [clean]
                );
                if (rows && rows[0]) {
                    return mapSupabaseUserRow(rows[0]);
                }
            }
        } catch (err) {
            _lastUserSyncError = err.message;
        }
    }

    if (creds.hasRestApi) {
        const rows = await supabaseRestRequest('store_users', {
            method: 'GET',
            query: `whatsapp_digits=eq.${encodeURIComponent(clean)}&select=whatsapp_digits,whatsapp_e164,name,password_hash,is_verified,verified_at,last_login_at,created_at&limit=1`
        });
        if (Array.isArray(rows) && rows[0]) {
            return mapSupabaseUserRow(rows[0]);
        }
    }

    return null;
}

async function touchUserLoginInSupabase(whatsappDigits) {
    const clean = String(whatsappDigits || '').replace(/\D/g, '');
    if (!clean) return false;
    const creds = getSupabaseCredentials();
    if (!creds.isConfigured) return false;
    const nowIso = new Date().toISOString();

    if (creds.hasPostgresUri) {
        try {
            const pool = await getPgPool();
            if (pool) {
                await ensureSupabaseUsersTable(pool);
                await pool.query(
                    `UPDATE store_users SET last_login_at = $2 WHERE whatsapp_digits = $1`,
                    [clean, nowIso]
                );
                return true;
            }
        } catch (err) {
            _lastUserSyncError = err.message;
        }
    }

    if (creds.hasRestApi) {
        const res = await supabaseRestRequest('store_users', {
            method: 'PATCH',
            query: `whatsapp_digits=eq.${encodeURIComponent(clean)}`,
            body: { last_login_at: nowIso },
            prefer: 'return=minimal'
        });
        return res !== null;
    }

    return false;
}

function getSupabaseUserStoreStatus() {
    const creds = getSupabaseCredentials();
    return {
        configured: creds.isConfigured,
        mode: creds.mode,
        lastError: _lastUserSyncError
    };
}

module.exports = {
    saveVerifiedUserToSupabase,
    findUserInSupabase,
    touchUserLoginInSupabase,
    getSupabaseUserStoreStatus
};

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data');
const UID_SUFFIX = typeof process.getuid === 'function' ? String(process.getuid()) : 'default';
const TMP_FALLBACK_DIR = path.join(os.tmpdir(), `almumtaz_railway_bot_data_${UID_SUFFIX}`);
const LEGACY_TMP_FALLBACK_DIR = path.join(os.tmpdir(), 'almumtaz_railway_bot_data');

function isDirectoryWritable(dirPath) {
    if (!dirPath) return false;
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        const probeFile = path.join(dirPath, `.write_probe_${process.pid}_${Date.now()}`);
        fs.writeFileSync(probeFile, 'ok', 'utf8');
        fs.rmSync(probeFile, { force: true });
        return true;
    } catch (_) {
        return false;
    }
}

function isSqliteTargetWritable(dbFilePath) {
    if (!dbFilePath) return false;
    const parentDir = path.dirname(dbFilePath);
    if (!isDirectoryWritable(parentDir)) return false;
    try {
        for (const candidateFile of [dbFilePath, `${dbFilePath}-wal`, `${dbFilePath}-shm`]) {
            if (fs.existsSync(candidateFile)) {
                fs.accessSync(candidateFile, fs.constants.R_OK | fs.constants.W_OK);
            }
        }
        return true;
    } catch (_) {
        return false;
    }
}

function createUniqueTempDataDir() {
    try {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'almumtaz_railway_db_'));
    } catch (_) {
        return TMP_FALLBACK_DIR;
    }
}

function resolveWritableDataDir() {
    const candidates = [
        process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH) : null,
        process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : null,
        DEFAULT_DATA_DIR,
        TMP_FALLBACK_DIR,
        LEGACY_TMP_FALLBACK_DIR
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (isDirectoryWritable(candidate) && isSqliteTargetWritable(path.join(candidate, 'almumtaz_railway_bot.db'))) {
            return candidate;
        }
    }
    return createUniqueTempDataDir();
}

function resolveWritableDbPath(dataDir) {
    if (process.env.SQLITE_PATH) {
        const candidate = path.resolve(process.env.SQLITE_PATH);
        if (isSqliteTargetWritable(candidate)) {
            return candidate;
        }
        const fallbackInDataDir = path.join(dataDir, path.basename(candidate) || 'almumtaz_railway_bot.db');
        if (isSqliteTargetWritable(fallbackInDataDir)) {
            return fallbackInDataDir;
        }
        return path.join(createUniqueTempDataDir(), path.basename(candidate) || 'almumtaz_railway_bot.db');
    }
    const defaultTarget = path.join(dataDir, 'almumtaz_railway_bot.db');
    if (isSqliteTargetWritable(defaultTarget)) {
        return defaultTarget;
    }
    return path.join(createUniqueTempDataDir(), 'almumtaz_railway_bot.db');
}

const DATA_DIR = resolveWritableDataDir();
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const LEGACY_SESSIONS_DIR = path.join(ROOT_DIR, 'session');
const DB_PATH = resolveWritableDbPath(DATA_DIR);
const CONFIG_PATH = path.join(DATA_DIR, 'store_config.json');

for (const dir of [DATA_DIR, SESSIONS_DIR, path.dirname(DB_PATH)]) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    } catch (err) {
        console.warn(`[storage] Could not create directory ${dir}:`, err.message);
    }
}

function getVolumeDiagnostics() {
    let isWritable = false;
    try {
        const probeFile = path.join(DATA_DIR, '.volume_probe');
        fs.writeFileSync(probeFile, String(Date.now()), 'utf8');
        fs.rmSync(probeFile, { force: true });
        isWritable = true;
    } catch (_) {
        isWritable = false;
    }

    let dbSizeBytes = 0;
    try {
        if (fs.existsSync(DB_PATH)) {
            dbSizeBytes = fs.statSync(DB_PATH).size;
        }
    } catch (_) {}

    let sessionFoldersCount = 0;
    try {
        if (fs.existsSync(SESSIONS_DIR)) {
            sessionFoldersCount = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d+$/.test(d.name)).length;
        }
    } catch (_) {}

    return {
        volumePath: DATA_DIR,
        sessionsPath: SESSIONS_DIR,
        dbPath: DB_PATH,
        isWritable,
        dbSizeBytes,
        sessionFoldersCount
    };
}

module.exports = {
    ROOT_DIR,
    DATA_DIR,
    SESSIONS_DIR,
    LEGACY_SESSIONS_DIR,
    DB_PATH,
    CONFIG_PATH,
    getVolumeDiagnostics
};

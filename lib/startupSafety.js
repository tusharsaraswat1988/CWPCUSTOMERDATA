/**
 * =========================================================================
 * CWP DATA APP - STARTUP ENVIRONMENT & MIGRATION SAFETY HELPERS
 * Pure, dependency-free classification & policy guards.
 * Never logs or returns credentials, passwords, tokens, or full DB URLs.
 * =========================================================================
 */

'use strict';

function sanitizeHost(host) {
  if (!host || typeof host !== 'string') return 'none';
  const clean = host.trim().replace(/^.*@/, '').split('/')[0].split(':')[0];
  if (!clean) return 'none';
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1') return clean;
  const parts = clean.split('.');
  if (parts.length <= 1) return clean.slice(0, 4) + '***';
  const prefix = parts[0].length > 6 ? parts[0].slice(0, 6) + '***' : parts[0].slice(0, 2) + '***';
  return `${prefix}.${parts.slice(1).join('.')}`;
}

function isRailwayHosted(env = process.env) {
  return Boolean(
    (env.RAILWAY_ENVIRONMENT && env.RAILWAY_ENVIRONMENT.trim()) ||
    (env.RAILWAY_PROJECT_ID && env.RAILWAY_PROJECT_ID.trim()) ||
    (env.RAILWAY_SERVICE_ID && env.RAILWAY_SERVICE_ID.trim()) ||
    (env.RAILWAY_PUBLIC_DOMAIN && env.RAILWAY_PUBLIC_DOMAIN.trim()) ||
    (env.RAILWAY_STATIC_URL && env.RAILWAY_STATIC_URL.trim())
  );
}

function classifyHostingEnvironment(env = process.env) {
  if (isRailwayHosted(env)) return 'RAILWAY';
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();
  if (!nodeEnv || nodeEnv === 'development' || nodeEnv === 'test') {
    return 'LOCAL MACHINE';
  }
  return 'UNKNOWN';
}

function classifyRuntimeEnvironment(env = process.env) {
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();
  const railway = isRailwayHosted(env);

  if (nodeEnv === 'production') return 'PRODUCTION';
  if (nodeEnv === 'development') return railway ? 'DEVELOPMENT' : 'LOCAL DEVELOPMENT';
  if (nodeEnv === 'test') return 'TEST';
  return 'UNKNOWN';
}

function classifyDatabaseTarget(dbConfig, env = process.env) {
  if (!dbConfig || !dbConfig.isConfigured) {
    return {
      configured: false,
      provider: 'NONE',
      databaseName: 'none',
      sanitizedHost: 'none',
      mode: 'none',
      classification: 'NONE',
      isProductionDb: false
    };
  }

  const dbName = (dbConfig.databaseName || '').trim();
  const host = (dbConfig.host || '').trim();
  const explicitEnv = (env.DB_ENVIRONMENT || '').trim().toLowerCase();
  const provider = dbConfig.isNeon
    ? (dbConfig.isPooled ? 'NEON_POOLED' : 'NEON_DIRECT')
    : 'POSTGRESQL';

  let classification = 'UNKNOWN';
  let isProductionDb = false;

  // 1. Evaluate reliable production indicators BEFORE any DB_ENVIRONMENT override
  const hasProdIndicator =
    dbName.toLowerCase() === 'neondb' ||
    /(?:^|[_-])prod(?:uction)?(?:$|[_-])/i.test(dbName) ||
    /(?:^|[_-])prod(?:uction)?(?:$|[_-])/i.test(host);

  if (hasProdIndicator) {
    classification = 'PRODUCTION';
    isProductionDb = true;
  } else if (explicitEnv === 'production' || explicitEnv === 'prod') {
    classification = 'PRODUCTION';
    isProductionDb = true;
  } else if (explicitEnv === 'development' || explicitEnv === 'dev' || explicitEnv === 'local') {
    classification = explicitEnv === 'local' ? 'LOCAL' : 'DEVELOPMENT';
  } else if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    classification = 'LOCAL';
  } else if (
    dbName === 'cwp_customer_db' ||
    /(?:^|[_-])(dev|development|staging|test|local)(?:$|[_-])/i.test(dbName) ||
    /(?:^|[_-])(dev|staging|test)(?:$|[_-])/i.test(host)
  ) {
    classification = 'DEVELOPMENT';
  }

  return {
    configured: true,
    provider,
    databaseName: dbName || 'unknown',
    sanitizedHost: sanitizeHost(host),
    mode: dbConfig.isPooled ? 'Pooled' : 'Direct/Unpooled',
    classification,
    isProductionDb
  };
}

function evaluateMigrationPolicy({ env = process.env, dbConfig, source = 'server_startup' } = {}) {
  const runtimeEnv = classifyRuntimeEnvironment(env);
  const hostingEnv = classifyHostingEnvironment(env);
  const dbTarget = classifyDatabaseTarget(dbConfig, env);

  if (!dbTarget.configured) {
    return {
      allowed: false,
      mode: 'NO_DATABASE',
      reason: 'Database is not configured.',
      warn: null,
      runtimeEnv,
      hostingEnv,
      dbTarget
    };
  }

  const isProdRuntime = runtimeEnv === 'PRODUCTION' && hostingEnv === 'RAILWAY';

  // Hard block: never allow non-production/local runtime to run migrations against a production DB
  if (dbTarget.isProductionDb && !isProdRuntime) {
    return {
      allowed: false,
      mode: 'BLOCKED_PRODUCTION_TARGET',
      reason: `Refusing migration/sequence sync: database target '${dbTarget.databaseName}' (${dbTarget.sanitizedHost}) is classified as PRODUCTION while running in ${runtimeEnv} (${hostingEnv}).`,
      warn: null,
      runtimeEnv,
      hostingEnv,
      dbTarget
    };
  }

  // Hard block: never allow non-production/local runtime to run migrations against an UNKNOWN DB target
  if (dbTarget.classification === 'UNKNOWN' && !isProdRuntime) {
    return {
      allowed: false,
      mode: 'BLOCKED_UNKNOWN_DATABASE_TARGET',
      reason: `Refusing migration/sequence sync: database target '${dbTarget.databaseName}' (${dbTarget.sanitizedHost}) is classified as UNKNOWN while running in ${runtimeEnv} (${hostingEnv}).`,
      warn: null,
      runtimeEnv,
      hostingEnv,
      dbTarget
    };
  }

  if (source === 'server_startup') {
    if (isProdRuntime) {
      if (env.AUTO_MIGRATE === 'false') {
        return {
          allowed: false,
          mode: 'DISABLED_BY_ENV',
          reason: 'Startup migrations disabled by AUTO_MIGRATE=false.',
          warn: null,
          runtimeEnv,
          hostingEnv,
          dbTarget
        };
      }
      return {
        allowed: true,
        mode: 'PRODUCTION_STARTUP',
        reason: 'Production startup migration check enabled.',
        warn: null,
        runtimeEnv,
        hostingEnv,
        dbTarget
      };
    }

    // Local / Development / Test / Unknown: SAFE BY DEFAULT (opt-in only)
    if (env.AUTO_MIGRATE === 'true') {
      return {
        allowed: true,
        mode: 'EXPLICIT_LOCAL_OPT_IN',
        reason: 'Explicitly enabled via AUTO_MIGRATE=true.',
        warn: `WARNING: AUTO_MIGRATE=true is enabled for ${runtimeEnv} targeting ${dbTarget.databaseName} (${dbTarget.sanitizedHost}).`,
        runtimeEnv,
        hostingEnv,
        dbTarget
      };
    }

    return {
      allowed: false,
      mode: env.AUTO_MIGRATE === 'false' ? 'DISABLED_BY_ENV' : 'DISABLED_BY_DEFAULT',
      reason: 'Startup migrations are disabled by default in non-production environments (set AUTO_MIGRATE=true to opt in).',
      warn: null,
      runtimeEnv,
      hostingEnv,
      dbTarget
    };
  }

  // Standalone CLI execution (`node migrations/migrate.js`), e.g. Railway Procfile
  return {
    allowed: true,
    mode: isProdRuntime ? 'PRODUCTION_CLI' : 'LOCAL_CLI',
    reason: isProdRuntime
      ? 'Authorized production CLI migration workflow.'
      : 'Authorized local/development CLI migration workflow.',
    warn: null,
    runtimeEnv,
    hostingEnv,
    dbTarget
  };
}

function getStartupSummary({ port = 3000, domain = 'cwpdetailers.in', env = process.env, dbConfig } = {}) {
  const runtimeEnv = classifyRuntimeEnvironment(env);
  const hostingEnv = classifyHostingEnvironment(env);
  const dbTarget = classifyDatabaseTarget(dbConfig, env);
  const migrationPolicy = evaluateMigrationPolicy({ env, dbConfig, source: 'server_startup' });

  const railwayDomain = (env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  const customDomain = (env.CUSTOM_DOMAIN || '').trim();
  const serverEndpoint = hostingEnv === 'RAILWAY' && (customDomain || railwayDomain)
    ? `https://${customDomain || railwayDomain} (0.0.0.0:${port})`
    : `http://localhost:${port} (0.0.0.0:${port})`;

  let domainLabel = 'Configured Fallback Domain';
  if (customDomain) domainLabel = 'Custom Domain';
  else if (railwayDomain) domainLabel = 'Railway Public Domain';

  let migrationStatusLabel = 'DISABLED BY DEFAULT';
  if (migrationPolicy.mode === 'BLOCKED_PRODUCTION_TARGET') {
    migrationStatusLabel = 'BLOCKED (PRODUCTION DB TARGET)';
  } else if (migrationPolicy.mode === 'BLOCKED_UNKNOWN_DATABASE_TARGET') {
    migrationStatusLabel = 'BLOCKED (UNKNOWN DB TARGET)';
  } else if (migrationPolicy.mode === 'DISABLED_BY_ENV') {
    migrationStatusLabel = 'DISABLED (AUTO_MIGRATE=false)';
  } else if (migrationPolicy.mode === 'EXPLICIT_LOCAL_OPT_IN') {
    migrationStatusLabel = 'ENABLED (AUTO_MIGRATE=true)';
  } else if (migrationPolicy.mode === 'PRODUCTION_STARTUP') {
    migrationStatusLabel = 'ENABLED (PRODUCTION)';
  } else if (migrationPolicy.mode === 'NO_DATABASE') {
    migrationStatusLabel = 'SKIPPED (NO DATABASE)';
  }

  return {
    runtimeEnv,
    hostingEnv,
    serverEndpoint,
    domainLabel,
    domainUrl: `https://${domain}`,
    dbTarget,
    migrationPolicy,
    migrationStatusLabel
  };
}

module.exports = {
  sanitizeHost,
  isRailwayHosted,
  classifyHostingEnvironment,
  classifyRuntimeEnvironment,
  classifyDatabaseTarget,
  evaluateMigrationPolicy,
  getStartupSummary
};

/**
 * =========================================================================
 * CWP DATA APP - DATABASE CONNECTION RESOLVER
 * Dynamic 12-Factor Environment Resolver & Neon Connection Normalizer
 * =========================================================================
 * 
 * Capabilities:
 * - Single DATABASE_URL as Single Source of Truth in production (Railway/Cloud).
 * - Zero hardcoding of database names (cwp_customer_db, neondb, postgres, etc.).
 * - Automatic derivation of Direct / Unpooled URLs from Neon Pooled endpoints.
 * - Automatic derivation of Pooled URLs from Neon Direct endpoints.
 * - Backward compatibility for optional explicit DATABASE_URL_UNPOOLED.
 * - Provider-agnostic support for standard Postgres (Local, Supabase, AWS RDS).
 */

/**
 * Resolves database configuration from primary and optional explicit URLs.
 * 
 * @param {string} [primaryUrl] - process.env.DATABASE_URL
 * @param {string} [explicitDirectUrl] - process.env.DATABASE_URL_UNPOOLED
 * @returns {Object} Normalized database configuration object
 */
function resolveDatabaseConfig(primaryUrl = process.env.DATABASE_URL, explicitDirectUrl = process.env.DATABASE_URL_UNPOOLED) {
  const rawUrl = primaryUrl?.trim() || explicitDirectUrl?.trim();

  if (!rawUrl) {
    return {
      isConfigured: false,
      pooledUrl: null,
      directUrl: null,
      databaseName: null,
      isNeon: false,
      isPooled: false,
      error: 'DATABASE_URL is not set in environment.'
    };
  }

  try {
    const parsed = new URL(rawUrl);
    if (!parsed.protocol.startsWith('postgres')) {
      return {
        isConfigured: false,
        pooledUrl: null,
        directUrl: null,
        databaseName: null,
        isNeon: false,
        isPooled: false,
        error: `Invalid protocol '${parsed.protocol}'. Expected postgres:// or postgresql://.`
      };
    }

    const databaseName = parsed.pathname.replace(/^\//, '') || 'postgres';
    const isNeon = parsed.hostname.endsWith('.neon.tech') || parsed.hostname.includes('.neon.tech');
    const isPooled = parsed.hostname.includes('-pooler.');

    let pooledUrl = rawUrl;
    let directUrl = explicitDirectUrl?.trim() || rawUrl;

    // Intelligent auto-derivation for Neon connections
    if (!explicitDirectUrl?.trim() && isNeon) {
      if (isPooled) {
        // Remove -pooler from hostname for direct operations (migrations/admin)
        const directHost = parsed.hostname.replace('-pooler.', '.');
        const directParsed = new URL(rawUrl);
        directParsed.hostname = directHost;
        directUrl = directParsed.toString();
      } else {
        // Insert -pooler for pooled runtime connections
        const poolerHost = parsed.hostname.replace(/^([^.]+)/, '$1-pooler');
        const poolerParsed = new URL(rawUrl);
        poolerParsed.hostname = poolerHost;
        pooledUrl = poolerParsed.toString();
      }
    }

    return {
      isConfigured: true,
      pooledUrl,
      directUrl,
      databaseName,
      isNeon,
      isPooled,
      host: parsed.hostname,
      port: parsed.port || '5432'
    };
  } catch (err) {
    return {
      isConfigured: false,
      pooledUrl: null,
      directUrl: null,
      databaseName: null,
      isNeon: false,
      isPooled: false,
      error: `Failed to parse database connection URL: ${err.message}`
    };
  }
}

module.exports = {
  resolveDatabaseConfig
};

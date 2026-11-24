/**
 * Free port helper for local development.
 * Automatically releases local port (default 3005) if an orphaned node process is holding it.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let port = 3005;
try {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^PORT\s*=\s*(\d+)/m);
    if (match && match[1]) {
      port = parseInt(match[1], 10);
    }
  }
} catch (_) {}

if (process.env.PORT) {
  port = parseInt(process.env.PORT, 10);
}

try {
  if (process.platform === 'win32') {
    const cmd = `powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue; if ($conn) { foreach ($c in $conn) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }; Write-Host '[clean-port] Freed port ${port}' }"`;
    execSync(cmd, { stdio: 'inherit' });
  } else {
    try {
      execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
      console.log(`[clean-port] Freed port ${port}`);
    } catch (_) {}
  }
} catch (_) {}

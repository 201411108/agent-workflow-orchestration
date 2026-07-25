const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const cli = path.join(root, "bin", "cli.js");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workflow-update-check-"));

function runCli(registryUrl, cacheName, now, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "help"], {
      cwd: fixture,
      env: {
        ...process.env,
        CI: "",
        AGENT_WORKFLOW_NO_UPDATE_CHECK: "0",
        NO_UPDATE_NOTIFIER: "0",
        AGENT_WORKFLOW_FORCE_UPDATE_CHECK: "1",
        AGENT_WORKFLOW_REGISTRY_URL: registryUrl,
        AGENT_WORKFLOW_UPDATE_CACHE_DIR: path.join(fixture, cacheName),
        AGENT_WORKFLOW_UPDATE_CHECK_NOW: String(now),
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests++;
    if (request.url === "/slow") {
      setTimeout(() => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ "dist-tags": { latest: "9.0.0" } }));
      }, 1200);
      return;
    }
    const latest = request.url === "/same" ? "1.1.0" : "9.0.0";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ "dist-tags": { latest } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const day = 24 * 60 * 60 * 1000;

  try {
    const first = await runCli(`${baseUrl}/latest`, "latest-cache", 1000000);
    assert(first.status === 0, "latest check must not fail the command");
    assert(first.stderr.includes("Update available: 1.1.0 → 9.0.0"), "newer versions must be announced");
    assert(first.stderr.includes("@latest update"), "the update command must be included");
    assert(requests === 1, "the first check must query the registry");

    const cached = await runCli(`${baseUrl}/latest`, "latest-cache", 1001000);
    assert(cached.status === 0, "cached checks must succeed");
    assert(!cached.stderr.includes("Update available"), "the same update must only be announced once per day");
    assert(requests === 1, "a successful check must be cached for a day");

    const nextDay = await runCli(`${baseUrl}/latest`, "latest-cache", 1000000 + day);
    assert(nextDay.stderr.includes("Update available"), "the notification may be shown again after a day");
    assert(requests === 2, "the registry must be queried again after a day");

    const same = await runCli(`${baseUrl}/same`, "same-cache", 2000000);
    assert(same.status === 0 && !same.stderr.includes("Update available"), "equal versions need no notification");

    const beforeOptOut = requests;
    const optedOut = await runCli(`${baseUrl}/latest`, "opt-out-cache", 3000000, {
      AGENT_WORKFLOW_NO_UPDATE_CHECK: "1",
    });
    assert(optedOut.status === 0 && requests === beforeOptOut, "opt-out must skip the registry");

    const beforeCi = requests;
    const ci = await runCli(`${baseUrl}/latest`, "ci-cache", 4000000, {
      CI: "1",
    });
    assert(ci.status === 0 && requests === beforeCi, "CI must skip update checks");

    const beforeNonTty = requests;
    const nonTty = await runCli(`${baseUrl}/latest`, "non-tty-cache", 4500000, {
      AGENT_WORKFLOW_FORCE_UPDATE_CHECK: "0",
    });
    assert(nonTty.status === 0 && requests === beforeNonTty, "non-TTY runs must skip update checks");

    const beforeNotifierOptOut = requests;
    const notifierOptOut = await runCli(`${baseUrl}/latest`, "notifier-opt-out-cache", 4600000, {
      NO_UPDATE_NOTIFIER: "1",
    });
    assert(
      notifierOptOut.status === 0 && requests === beforeNotifierOptOut,
      "NO_UPDATE_NOTIFIER must skip the registry"
    );

    const started = Date.now();
    const timeout = await runCli(`${baseUrl}/slow`, "timeout-cache", 5000000);
    assert(timeout.status === 0, "timeouts must not fail the command");
    assert(Date.now() - started < 1150, "registry requests must time out promptly");

    const offlineUrl = "http://127.0.0.1:1/offline";
    const offline = await runCli(offlineUrl, "offline-cache", 6000000);
    assert(offline.status === 0, "offline checks must not fail the command");
    const offlineCachePath = path.join(fixture, "offline-cache", "update-check.json");
    const failedCache = JSON.parse(fs.readFileSync(offlineCachePath, "utf8"));
    assert(failedCache.failed === true, "failed checks must be cached");
    const cachedFailure = await runCli(offlineUrl, "offline-cache", 6001000);
    assert(cachedFailure.status === 0, "cached failures must not fail the command");
    const unchangedCache = JSON.parse(fs.readFileSync(offlineCachePath, "utf8"));
    assert(unchangedCache.checkedAt === failedCache.checkedAt, "failed checks must be cached for an hour");

    console.log("Update check test passed.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  fs.rmSync(fixture, { recursive: true, force: true });
  process.exit(1);
});

const MODULE_ID = "oev-suite-monitor";

/**
 * Canonical watch list owned by this monitor module.
 *
 * Notes:
 * - Only modules that are installed (and preferably active) are checked.
 * - The monitor fetches each manifestUrl and reads its top-level `version` field.
 */
const WATCHED_MODULES = [
  {
    id: "about-time-next",
    title: "About Time Next",
    repoUrl: "https://github.com/paulcheeba/about-time-next",
    releaseUrl: "https://github.com/paulcheeba/about-time-next/releases/latest"
  },
  {
    id: "fvtt-chat-pruner",
    title: "Chat Pruner",
    repoUrl: "https://github.com/paulcheeba/chat-pruner",
    releaseUrl: "https://github.com/paulcheeba/chat-pruner/releases/latest"
  },
  {
    id: "find-and-replace",
    title: "Find and Replace",
    repoUrl: "https://github.com/paulcheeba/find-and-replace",
    releaseUrl: "https://github.com/paulcheeba/find-and-replace/releases/latest"
  },
  {
    id: "oev-suite-monitor",
    title: "OEV Suite Monitor",
    repoUrl: "https://github.com/paulcheeba/OverEngineeredVTT-Suite-Monitor",
    releaseUrl: "https://github.com/paulcheeba/OverEngineeredVTT-Suite-Monitor/releases/latest"
  },
  {
    id: "window-controls-next",
    title: "Window Controls Next",
    repoUrl: "https://github.com/paulcheeba/window-controls-next",
    releaseUrl: "https://github.com/paulcheeba/window-controls-next/releases/latest"
  }
];

const SETTINGS = {
  lastCheckAt: "lastCheckAt",
  checkIntervalHours: "checkIntervalHours",
  hiddenUntilUpdate: "hiddenUntilUpdate",
  snoozedUntil: "snoozedUntil",
  lastFingerprint: "lastFingerprint",
  testingMode: "testingMode"
};

const DEFAULT_INTERVAL_HOURS = 12;
const FETCH_TIMEOUT_MS = 10_000;
const SNOOZE_MS = 2 * 60 * 60 * 1000;
const JITTER_SECONDS_MAX = 10;

let _runInProgress = false;

Hooks.once("init", async () => {
  /* // Dev-only: Uncomment to load dev config and register dev-only settings
   try {
   const devConfig = await import("../config/dev-config.js");
   devConfig.registerDevSettings?.();
   } catch (e) {
   // Dev config not found - production mode
 }*/

  // Register "Show Monitor" button in settings (GM-only)
  game.settings.registerMenu(MODULE_ID, "showMonitor", {
    name: "Show OEV Suite Monitor",
    label: "Check for Updates Now",
    hint: "Manually open the update monitor dialog",
    icon: "fas fa-search",
    type: class ShowMonitorButton extends foundry.applications.api.ApplicationV2 {
      async render(options) {
        const allModules = await getAllModulesWithStatus();
        await showOutOfDateDialog(allModules);
      }
    },
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTINGS.lastCheckAt, {
    name: "Last check at",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.checkIntervalHours, {
    name: "Update check interval (hours)",
    scope: "world",
    config: true,
    type: Number,
    default: DEFAULT_INTERVAL_HOURS
  });

  game.settings.register(MODULE_ID, SETTINGS.hiddenUntilUpdate, {
    name: "Hide until next update",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.snoozedUntil, {
    name: "Snoozed until",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.lastFingerprint, {
    name: "Last update fingerprint",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
});

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  if (_runInProgress) return;
  _runInProgress = true;

  try {
    // Testing mode: force dialog with all modules (installed and not)
    let testingMode = false;
    if (game.settings.settings.has(`${MODULE_ID}.${SETTINGS.testingMode}`)) {
      testingMode = game.settings.get(MODULE_ID, SETTINGS.testingMode);
    }
    console.log(`${MODULE_ID} | Testing Mode: ${testingMode ? "Enabled" : "Disabled"}`);
    if (testingMode) {
      const allModules = await getAllModulesWithStatus();
      await showOutOfDateDialog(allModules);
      return;
    }

    const now = Date.now();
    const snoozedUntil = Number(game.settings.get(MODULE_ID, SETTINGS.snoozedUntil) ?? 0);
    if (now < snoozedUntil) return;

    const lastCheckAt = Number(game.settings.get(MODULE_ID, SETTINGS.lastCheckAt) ?? 0);
    const intervalHours = Number(game.settings.get(MODULE_ID, SETTINGS.checkIntervalHours) ?? DEFAULT_INTERVAL_HOURS);
    const intervalMs = Math.max(0, intervalHours) * 60 * 60 * 1000;

    if (now - lastCheckAt < intervalMs) return;

    const jitterMs = Math.floor(Math.random() * (JITTER_SECONDS_MAX + 1)) * 1000;
    if (jitterMs) await new Promise(resolve => setTimeout(resolve, jitterMs));

    await game.settings.set(MODULE_ID, SETTINGS.lastCheckAt, Date.now());

    const watched = getWatchedInstalledModules();
    const results = await checkLatestVersions(watched);

    // Fingerprint logic
    const fingerprint = makeFingerprint(results);
    const lastFingerprint = String(game.settings.get(MODULE_ID, SETTINGS.lastFingerprint) ?? "");
    if (fingerprint !== lastFingerprint) {
      await game.settings.set(MODULE_ID, SETTINGS.hiddenUntilUpdate, false);
      await game.settings.set(MODULE_ID, SETTINGS.lastFingerprint, fingerprint);
    }

    const outOfDate = results.filter(r => r.status === "out-of-date");

    // Required GM-only notification strings
    if (outOfDate.length > 0) ui.notifications.warn(`You have ${outOfDate.length} OEV modules out of date.`);
    else ui.notifications.info("All OEV modules up to date.");

    const hidden = Boolean(game.settings.get(MODULE_ID, SETTINGS.hiddenUntilUpdate));
    const snoozedUntilAfter = Number(game.settings.get(MODULE_ID, SETTINGS.snoozedUntil) ?? 0);
    const stillSnoozed = Date.now() < snoozedUntilAfter;

    if (outOfDate.length > 0 && !hidden && !stillSnoozed) {
      const allModules = await getAllModulesWithStatus();
      await showOutOfDateDialog(allModules);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Update check failed`, err);
  } finally {
    _runInProgress = false;
  }
});

function getWatchedInstalledModules() {
  const watched = [];
  for (const entry of WATCHED_MODULES) {
    if (!entry?.id) continue;
    const mod = game.modules?.get(entry.id);
    if (!mod) continue;

    // Check all installed modules (enabled or disabled)
    watched.push({
      ...entry,
      installedVersion: getInstalledVersion(mod)
    });
  }
  return watched;
}

function getInstalledVersion(mod) {
  const v = mod?.version ?? mod?.data?.version ?? "";
  return typeof v === "string" ? v : String(v ?? "");
}

async function getAllModulesWithStatus() {
  const allModules = [];
  
  for (const entry of WATCHED_MODULES) {
    const mod = game.modules?.get(entry.id);
    
    if (!mod) {
      // Not installed at all
      allModules.push({
        ...entry,
        installedVersion: undefined,
        latestVersion: undefined,
        status: "not-installed"
      });
      continue;
    }
    
    // Installed (enabled or disabled) - check version
    const installedVersion = getInstalledVersion(mod);
    const latestVersion = await fetchLatestVersion(entry.repoUrl);
    
    const installedNorm = normalizeVersion(installedVersion);
    const latestNorm = normalizeVersion(latestVersion);
    
    let status = "unknown";
    if (installedNorm && latestNorm) {
      const cmp = compareSemver(installedNorm, latestNorm);
      if (cmp === 0) status = "up-to-date";
      else if (cmp === -1) status = "out-of-date";
      else if (cmp === 1) status = "ahead";
    } else if (installedNorm && latestNorm === installedNorm) {
      status = "up-to-date";
    }
    
    allModules.push({
      ...entry,
      installedVersion,
      latestVersion,
      status
    });
  }
  
  return allModules;
}

async function checkLatestVersions(watched) {
  const checks = watched.map(async entry => {
    const latestVersion = await fetchLatestVersion(entry.repoUrl);

    const installedNorm = normalizeVersion(entry.installedVersion);
    const latestNorm = normalizeVersion(latestVersion);

    let status = "unknown";
    if (installedNorm && latestNorm) {
      const cmp = compareSemver(installedNorm, latestNorm);
      if (cmp === 0) status = "up-to-date";
      else if (cmp === -1) status = "out-of-date";
      else if (cmp === 1) status = "ahead";
      else {
        // Not safely comparable; only treat as update if equality proves it.
        status = installedNorm === latestNorm ? "up-to-date" : "unknown";
      }
    } else if (installedNorm && latestNorm === installedNorm) {
      status = "up-to-date";
    }

    return {
      ...entry,
      latestVersion,
      status
    };
  });

  return Promise.allSettled(checks).then(settled => {
    const out = [];
    for (const s of settled) {
      if (s.status === "fulfilled") out.push(s.value);
      else console.warn(`${MODULE_ID} | Module check failed`, s.reason);
    }
    return out;
  });
}

async function fetchLatestVersion(repoUrl) {
  if (!repoUrl) return null;

  // Extract owner/repo from GitHub URL
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  
  const [, owner, repo] = match;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(apiUrl, {
      method: "GET",
      headers: { "Accept": "application/vnd.github.v3+json" },
      signal: controller.signal
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.log(`${MODULE_ID} | No releases found for ${owner}/${repo} (this is normal if no releases exist yet)`);
      }
      return null;
    }
    const data = await res.json().catch(() => null);
    const tag = data?.tag_name;
    if (!tag) return null;
    
    // Strip leading 'v' if present (e.g., v13.0.1.0 -> 13.0.1.0)
    return typeof tag === "string" ? tag.replace(/^v/, "") : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | Failed to fetch manifest ${manifestUrl}`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeVersion(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  return s.replace(/^v\s*/i, "");
}

function parseSemver(v) {
  const s = normalizeVersion(v);
  if (!s) return null;

  // Strip build metadata
  const [coreAndPre] = s.split("+");
  const [core, pre] = coreAndPre.split("-");

  const parts = core.split(".").map(p => p.trim());
  if (parts.length < 1 || parts.length > 5) return null;
  const nums = parts.map(p => (p === "" ? NaN : Number(p)));
  if (nums.some(n => !Number.isInteger(n) || n < 0)) return null;

  const [major, minor = 0, patch = 0, build = 0, hotfix = 0] = nums;
  const prerelease = pre ? pre.split(".").map(p => p.trim()).filter(Boolean) : [];

  return { major, minor, patch, build, hotfix, prerelease };
}

/**
 * Compare versions a and b.
 * Returns -1 if a < b, 0 if equal, 1 if a > b, or null if not comparable.
 */
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;

  for (const key of ["major", "minor", "patch", "build", "hotfix"]) {
    if (pa[key] < pb[key]) return -1;
    if (pa[key] > pb[key]) return 1;
  }

  const aPre = pa.prerelease;
  const bPre = pb.prerelease;

  // No prerelease is greater than prerelease
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i++) {
    const ai = aPre[i];
    const bi = bPre[i];
    if (ai == null) return -1;
    if (bi == null) return 1;

    const aNum = /^[0-9]+$/.test(ai) ? Number(ai) : null;
    const bNum = /^[0-9]+$/.test(bi) ? Number(bi) : null;

    if (aNum != null && bNum != null) {
      if (aNum < bNum) return -1;
      if (aNum > bNum) return 1;
      continue;
    }

    // Numeric identifiers have lower precedence than non-numeric
    if (aNum != null && bNum == null) return -1;
    if (aNum == null && bNum != null) return 1;

    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }

  return 0;
}

function makeFingerprint(results) {
  return results
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(r => `${r.id}@${normalizeVersion(r.latestVersion) || "?"}`)
    .join("|");
}

async function showOutOfDateDialog(allModules) {
  const upToDate = [];
  const outOfDate = [];
  const notInstalled = [];
  
  for (const r of allModules) {
    const mod = game.modules?.get(r.id);
    const status = mod?.active ? "enabled" : "disabled";
    
    const moduleData = {
      ...r,
      title: r.title || r.id,
      status: r.status === "not-installed" ? undefined : status
    };
    
    if (r.status === "not-installed") {
      notInstalled.push(moduleData);
    } else if (r.status === "out-of-date" || r.status === "ahead") {
      outOfDate.push(moduleData);
    } else {
      upToDate.push(moduleData);
    }
  }
  
  const templatePath = "modules/oev-suite-monitor/templates/monitor.hbs";
  const template = await foundry.applications.handlebars.getTemplate(templatePath);
  const moduleContent = template({ upToDate, outOfDate, notInstalled });
  
  // Build content with banner and scrollable module list
  const content = `
    <div class="oev-banner">
      <a href="https://www.patreon.com/c/u45257624" class="oev-banner-btn oev-banner-patreon" 
         target="_blank" rel="noopener" title="Support me on Patreon">
        <img src="modules/oev-suite-monitor/images/patreonbutton.png" alt="Patreon">
      </a>
      <a href="https://discord.gg/2FwEX9Nncv" class="oev-banner-btn oev-banner-discord" 
         target="_blank" rel="noopener" title="Join the OEV Discord">
        <img src="modules/oev-suite-monitor/images/discordbutton.png" alt="Discord">
      </a>
    </div>
    <div class="oev-scrollable-content" style="max-height: 430px; overflow-y: auto;">
      ${moduleContent}
    </div>
  `;

  const dialog = new foundry.applications.api.DialogV2({
    window: { 
      title: "OverEngineeredVTT Suite Monitor"
    },
    position: {
      width: 600
    },
    classes: ["oev-suite-monitor-dialog"],
    content,
    buttons: [
      {
        action: "hide",
        label: "Hide Until Update",
        icon: "fas fa-eye-slash",
        callback: async () => {
          await game.settings.set(MODULE_ID, SETTINGS.hiddenUntilUpdate, true);
        }
      },
      {
        action: "snooze",
        label: "Remind Me Later",
        icon: "fas fa-clock",
        default: true,
        callback: async () => {
          await game.settings.set(MODULE_ID, SETTINGS.snoozedUntil, Date.now() + SNOOZE_MS);
        }
      }
    ]
  });

  await dialog.render({ force: true });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s) {
  // Same escaping rules are sufficient here.
  return escapeHtml(s);
}

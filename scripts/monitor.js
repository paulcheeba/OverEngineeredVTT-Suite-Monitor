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
    manifestUrl: "https://github.com/paulcheeba/about-time-next/releases/latest/download/module.json",
    releaseUrl: "https://github.com/paulcheeba/about-time-next/releases/latest"
  },
  {
    id: "chat-pruner",
    title: "Chat Pruner",
    manifestUrl: "https://github.com/paulcheeba/chat-pruner/releases/latest/download/module.json",
    releaseUrl: "https://github.com/paulcheeba/chat-pruner/releases/latest"
  },
  {
    id: "find-and-replace",
    title: "Find and Replace",
    manifestUrl: "https://github.com/paulcheeba/find-and-replace/releases/latest/download/module.json",
    releaseUrl: "https://github.com/paulcheeba/find-and-replace/releases/latest"
  },
  {
    id: "window-controls-next",
    title: "Window Controls Next",
    manifestUrl: "https://github.com/paulcheeba/window-controls-next/releases/latest/download/module.json",
    releaseUrl: "https://github.com/paulcheeba/window-controls-next/releases/latest"
  }
];

const SETTINGS = {
  lastCheckAt: "lastCheckAt",
  checkIntervalHours: "checkIntervalHours",
  hiddenUntilUpdate: "hiddenUntilUpdate",
  snoozedUntil: "snoozedUntil",
  lastFingerprint: "lastFingerprint"
};

const DEFAULT_INTERVAL_HOURS = 12;
const FETCH_TIMEOUT_MS = 10_000;
const SNOOZE_MS = 2 * 60 * 60 * 1000;
const JITTER_SECONDS_MAX = 10;

let _runInProgress = false;

Hooks.once("init", () => {
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

    const watched = getWatchedInstalledActiveModules();
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
      await showOutOfDateDialog(outOfDate);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Update check failed`, err);
  } finally {
    _runInProgress = false;
  }
});

function getWatchedInstalledActiveModules() {
  const watched = [];
  for (const entry of WATCHED_MODULES) {
    if (!entry?.id) continue;
    const mod = game.modules?.get(entry.id);
    if (!mod) continue;

    // Prefer only active modules.
    if (!mod.active) continue;

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

async function checkLatestVersions(watched) {
  const checks = watched.map(async entry => {
    const latestVersion = await fetchLatestVersion(entry.manifestUrl);

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

async function fetchLatestVersion(manifestUrl) {
  if (!manifestUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(manifestUrl, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const v = data?.version;
    if (typeof v === "string") return v;
    if (v == null) return null;
    return String(v);
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
  if (parts.length < 1 || parts.length > 3) return null;
  const nums = parts.map(p => (p === "" ? NaN : Number(p)));
  if (nums.some(n => !Number.isInteger(n) || n < 0)) return null;

  const [major, minor = 0, patch = 0] = nums;
  const prerelease = pre ? pre.split(".").map(p => p.trim()).filter(Boolean) : [];

  return { major, minor, patch, prerelease };
}

/**
 * Compare versions a and b.
 * Returns -1 if a < b, 0 if equal, 1 if a > b, or null if not comparable.
 */
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;

  for (const key of ["major", "minor", "patch"]) {
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

async function showOutOfDateDialog(outOfDate) {
  const content = renderOutOfDateContent(outOfDate);

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: "OEV Modules Out of Date" },
    content,
    buttons: [
      {
        action: "hide",
        label: "Hide until next update",
        callback: async () => {
          await game.settings.set(MODULE_ID, SETTINGS.hiddenUntilUpdate, true);
        }
      },
      {
        action: "snooze",
        label: "Remind me later",
        callback: async () => {
          await game.settings.set(MODULE_ID, SETTINGS.snoozedUntil, Date.now() + SNOOZE_MS);
        }
      },
      {
        action: "close",
        label: "Close",
        default: true
      }
    ]
  });

  await dialog.render({ force: true });
}

function renderOutOfDateContent(outOfDate) {
  const rows = outOfDate
    .map(r => {
      const installed = escapeHtml(r.installedVersion || "(unknown)");
      const latest = escapeHtml(r.latestVersion || "(unknown)");
      const title = escapeHtml(r.title || r.id);

      const manifestLink = r.manifestUrl
        ? `<a href="${escapeAttr(r.manifestUrl)}" target="_blank" rel="noopener">Manifest</a>`
        : "";
      const releaseLink = r.releaseUrl
        ? `<a href="${escapeAttr(r.releaseUrl)}" target="_blank" rel="noopener">Release</a>`
        : "";

      const links = [manifestLink, releaseLink].filter(Boolean).join(" | ");

      return `
<li>
  <div><strong>${title}</strong> <small>(${escapeHtml(r.id)})</small></div>
  <div>Installed: <code>${installed}</code> → Latest: <code>${latest}</code></div>
  <div>${links}</div>
</li>`;
    })
    .join("\n");

  return `
<div>
  <p>The following OEV modules have updates available:</p>
  <ul>
    ${rows}
  </ul>
</div>`;
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

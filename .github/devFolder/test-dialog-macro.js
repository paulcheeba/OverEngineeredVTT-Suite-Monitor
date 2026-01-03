// Test macro to force the OEV Suite Monitor dialog to appear
// Copy and paste this into a Script macro in Foundry VTT
// This uses the real module data from your installed modules

const MODULE_ID = "oev-suite-monitor";
const SNOOZE_MS = 2 * 60 * 60 * 1000;

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

// Get real installed data from active modules
function getInstalledModules() {
  const installed = [];
  for (const entry of WATCHED_MODULES) {
    const mod = game.modules.get(entry.id);
    if (!mod) continue;
    
    const version = mod?.version ?? mod?.data?.version ?? "";
    installed.push({
      ...entry,
      installedVersion: typeof version === "string" ? version : String(version ?? ""),
      latestVersion: "(fetching...)",
      status: "out-of-date"
    });
  }
  return installed;
}

const testData = getInstalledModules();

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s);
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

async function showTestDialog(outOfDate) {
  if (!outOfDate || outOfDate.length === 0) {
    ui.notifications.warn("No watched OEV modules are currently installed.");
    return;
  }

  const content = renderOutOfDateContent(outOfDate);

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: "OEV Modules Out of Date (TEST)" },
    content,
    buttons: [
      {
        action: "hide",
        label: "Hide until next update",
        callback: async () => {
          await game.settings.set(MODULE_ID, "hiddenUntilUpdate", true);
          ui.notifications.info("Dialog hidden until next update");
        }
      },
      {
        action: "snooze",
        label: "Remind me later",
        callback: async () => {
          await game.settings.set(MODULE_ID, "snoozedUntil", Date.now() + SNOOZE_MS);
          ui.notifications.info("Dialog snoozed for 2 hours");
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

// Show the test dialog with real installed module data
showTestDialog(testData);

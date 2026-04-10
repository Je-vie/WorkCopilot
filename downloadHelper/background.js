function safeFilename(name) {
  if (!name) return undefined;
  var s = String(name)
    .replace(/[/\\?*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return s || undefined;
}

function downloadOne(url, filename) {
  var opts = {
    url: url,
    conflictAction: "uniquify",
    saveAs: false,
  };
  var fn = safeFilename(filename);
  if (fn) opts.filename = fn;
  return chrome.downloads.download(opts);
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === "DOWNLOAD_BATCH" && Array.isArray(msg.items)) {
    var delayMs = typeof msg.delayMs === "number" ? msg.delayMs : 500;
    (async function () {
      var fail = 0;
      var n = msg.items.length;
      var i;
      for (i = 0; i < n; i++) {
        var it = msg.items[i];
        if (!it || !it.url) {
          fail++;
        } else {
          try {
            await downloadOne(it.url, it.filename);
          } catch (e) {
            fail++;
          }
        }
        if (i < n - 1 && delayMs > 0) {
          await new Promise(function (r) {
            setTimeout(r, delayMs);
          });
        }
      }
      sendResponse({ ok: true, failCount: fail, total: n });
    })();
    return true;
  }

  if (!msg || msg.type !== "DOWNLOAD_URL" || !msg.url) return;

  var opts = {
    url: msg.url,
    conflictAction: "uniquify",
    saveAs: false,
  };
  var fn = safeFilename(msg.filename);
  if (fn) opts.filename = fn;

  chrome.downloads
    .download(opts)
    .then(function () {
      sendResponse({ ok: true });
    })
    .catch(function (err) {
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    });
  return true;
});

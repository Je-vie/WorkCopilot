(function () {
  if (window.__downloadHelperBound) return;
  window.__downloadHelperBound = true;

  const MSG = "DOWNLOAD_ALL_IN_LIST";
  const DELAY_MS = 100;
  const PANEL_ID = "download-helper-file-list";

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function headerCellText(cell) {
    var t = cell.getAttribute("aria-label") || "";
    if (t) return norm(t);
    return norm(cell.textContent || "");
  }

  /** 只取 tr 的直接子 td/th，避免嵌套表把整格里所有 td 摊平 */
  function directRowCells(row) {
    var out = [];
    var ch = row.children;
    var i;
    for (i = 0; i < ch.length; i++) {
      var tag = ch[i].tagName;
      if (tag === "TD" || tag === "TH") out.push(ch[i]);
    }
    return out;
  }

  /** 在表格中找表头行里 DOWNLOAD 列下标及列数（基于直接子格） */
  function findDownloadHeaderInfo(table) {
    var rows = table.querySelectorAll("thead tr");
    if (!rows.length) rows = table.querySelectorAll("tr");
    var r;
    for (r = 0; r < rows.length; r++) {
      var cells = directRowCells(rows[r]);
      if (!cells.length) continue;
      var i;
      for (i = 0; i < cells.length; i++) {
        var txt = headerCellText(cells[i]);
        if (/^download$/i.test(txt) || /\bdownload\b/i.test(txt)) {
          return { downloadIdx: i, colCount: cells.length };
        }
      }
    }
    return null;
  }

  function findFileColumnIndex(table) {
    var rows = table.querySelectorAll("thead tr");
    if (!rows.length) rows = table.querySelectorAll("tr");
    var r;
    for (r = 0; r < rows.length; r++) {
      var cells = directRowCells(rows[r]);
      var i;
      for (i = 0; i < cells.length; i++) {
        var txt = headerCellText(cells[i]);
        if (/^file$/i.test(txt) || /\bfile\b/i.test(txt)) return i;
      }
    }
    return -1;
  }

  /** 可后台下载的 http(s) 地址；避免对 <a> 执行 click 导致当前页跟着导航 */
  function extractHttpUrlFromTarget(el) {
    var a = el;
    if (!a || a.tagName !== "A") a = el.closest ? el.closest("a[href]") : null;
    if (!a && el.querySelector) a = el.querySelector("a[href]");
    if (!a) return null;
    var raw = a.getAttribute("href");
    if (!raw || raw === "#" || /^javascript:/i.test(String(raw).trim())) return null;
    try {
      var abs = new URL(a.href, document.baseURI).href;
      if (!/^https?:\/\//i.test(abs)) return null;
      return abs;
    } catch (e) {
      return null;
    }
  }

  function fileNameFromDownloadEl(el) {
    var a = el;
    if (!a || a.tagName !== "A") a = el.closest ? el.closest("a[href]") : null;
    if (!a && el.querySelector) a = el.querySelector("a[href]");
    if (a && a.href) {
      var m = String(a.href).match(/[?&]FileName=([^&]+)/i);
      if (m) {
        try {
          return decodeURIComponent(m[1].replace(/\+/g, " "));
        } catch (e) {
          return m[1];
        }
      }
    }
    return "";
  }

  function fileNameFromFileCell(td) {
    if (!td) return "";
    var link = td.querySelector("a");
    if (link) {
      var t = norm(link.textContent || link.getAttribute("title") || "");
      if (t) return t;
    }
    return norm(td.textContent || "");
  }

  function directTdsOfRow(tr) {
    var list = tr.querySelectorAll(":scope > td");
    if (list.length) return list;
    if (tr.cells && tr.cells.length) {
      var arr = [];
      var c;
      for (c = 0; c < tr.cells.length; c++) arr.push(tr.cells[c]);
      return arr;
    }
    return [];
  }

  function isLikelyDevExpressHeaderOrFilterRow(tr) {
    var s = (tr.id || "") + " " + (tr.className || "");
    return /DXHeader|HeaderRow|FilterRow|dxgvArm|GroupRow|dxgvIndent|dxgvBatch/i.test(s);
  }

  /**
   * DevExpress ASPxGridView：*_DXMainTable。
   * 线上常见：每行一个 tr（如 gvPcm_DXDataRow0），下面 gvPcm_tccell{行}_{列}。
   * 另有一种：单行 tr 里横向排满所有逻辑行的 td（另存网页时常见）。
   */
  function collectDevExpressMainTableWithNames(mainTbl) {
    var empty = { targets: [], names: [] };
    var id = mainTbl.id || "";
    if (id.indexOf("_DXMainTable") < 0) return empty;
    var prefix = id.replace(/_DXMainTable$/i, "");
    var headerTbl = document.getElementById(prefix + "_DXHeaderTable");
    if (!headerTbl) return empty;

    var info = findDownloadHeaderInfo(headerTbl);
    if (!info) return empty;

    var body = mainTbl.tBodies && mainTbl.tBodies[0];
    if (!body || !body.rows.length) return empty;

    var numCols = info.colCount;
    var downloadIdx = info.downloadIdx;
    if (downloadIdx < 0 || downloadIdx >= numCols) return empty;

    var fileIdx = findFileColumnIndex(headerTbl);
    if (fileIdx < 0 && downloadIdx > 0) fileIdx = downloadIdx - 1;

    var dataRows = mainTbl.querySelectorAll(
      'tbody tr[id*="DXDataRow"]'
    );
    var rowList = [];
    if (dataRows.length) {
      rowList = Array.prototype.slice.call(dataRows);
    } else {
      var alt = mainTbl.querySelectorAll(
        "tbody tr.dxgvDataRow_MyUMC, tbody tr.dxgvDataRow"
      );
      if (alt.length) rowList = Array.prototype.slice.call(alt);
    }

    if (!rowList.length) {
      var r;
      for (r = 0; r < body.rows.length; r++) {
        var tr0 = body.rows[r];
        if (isLikelyDevExpressHeaderOrFilterRow(tr0)) continue;
        var t0 = directTdsOfRow(tr0);
        if (t0.length >= numCols) rowList.push(tr0);
      }
    }

    if (!rowList.length) return empty;

    var firstTds = directTdsOfRow(rowList[0]);
    var banded =
      rowList.length === 1 && firstTds.length > numCols;

    var list = [];
    var names = [];
    if (banded) {
      var dcells = firstTds;
      var k;
      for (k = downloadIdx; k < dcells.length; k += numCols) {
        var el = findClickableInCell(dcells[k]);
        if (!el) continue;
        list.push(el);
        var name = fileNameFromDownloadEl(el);
        if (!name && fileIdx >= 0) {
          var fk = k - downloadIdx + fileIdx;
          if (fk >= 0 && fk < dcells.length) name = fileNameFromFileCell(dcells[fk]);
        }
        names.push(name || "（未识别）");
      }
    } else {
      var i;
      for (i = 0; i < rowList.length; i++) {
        var tdsR = directTdsOfRow(rowList[i]);
        if (downloadIdx >= tdsR.length) continue;
        var el2 = findClickableInCell(tdsR[downloadIdx]);
        if (!el2) continue;
        list.push(el2);
        var name2 = fileNameFromDownloadEl(el2);
        if (!name2 && fileIdx >= 0 && fileIdx < tdsR.length) {
          name2 = fileNameFromFileCell(tdsR[fileIdx]);
        }
        names.push(name2 || "（未识别）");
      }
    }
    return { targets: list, names: names };
  }

  function findClickableInCell(cell) {
    if (!cell) return null;
    var sels = [
      "a[href]",
      "button",
      "[role=\"button\"]",
      "input[type=\"button\"]",
      "input[type=\"submit\"]",
      "[ng-click]",
    ];
    var j;
    for (j = 0; j < sels.length; j++) {
      var el = cell.querySelector(sels[j]);
      if (el) return el;
    }
    var withClick = cell.querySelector("[onclick]");
    if (withClick) return withClick;

    var icon = cell.querySelector("svg, i, span[class], img");
    if (icon) {
      var p = icon.parentElement;
      while (p && p !== cell) {
        var tag = (p.tagName || "").toUpperCase();
        if (tag === "A" || tag === "BUTTON") return p;
        if (p.getAttribute("role") === "button") return p;
        if (p.getAttribute("onclick") || p.getAttribute("ng-click")) return p;
        p = p.parentElement;
      }
    }
    return null;
  }

  function dataRows(table) {
    var body = table.tBodies && table.tBodies[0];
    if (body && body.rows.length) {
      return body.rows;
    }
    var all = table.querySelectorAll("tr");
    var out = [];
    var k;
    for (k = 0; k < all.length; k++) {
      var tr = all[k];
      if (tr.querySelector(":scope > th")) continue;
      if (tr.parentNode && tr.parentNode.tagName === "THEAD") continue;
      out.push(tr);
    }
    return out;
  }

  function countDownloadTargets(table, downloadIdx, colCount) {
    var rows = dataRows(table);
    var total = 0;
    var r;
    for (r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll(":scope > td");
      if (!cells.length && rows[r].cells && rows[r].cells.length) {
        var tmp = [];
        var c;
        for (c = 0; c < rows[r].cells.length; c++) tmp.push(rows[r].cells[c]);
        cells = tmp;
      }
      if (rows.length === 1 && cells.length >= colCount * 2) {
        var k;
        for (k = downloadIdx; k < cells.length; k += colCount) {
          if (findClickableInCell(cells[k])) total++;
        }
        return total;
      }
      if (downloadIdx < cells.length && findClickableInCell(cells[downloadIdx])) total++;
    }
    return total;
  }

  function collectTargetsFromTableWithNames(table, downloadIdx, colCount, fileIdx) {
    var list = [];
    var names = [];
    var rows2 = dataRows(table);
    var r2;
    for (r2 = 0; r2 < rows2.length; r2++) {
      var cells2 = rows2[r2].querySelectorAll(":scope > td");
      if (!cells2.length && rows2[r2].cells && rows2[r2].cells.length) {
        var arr2 = [];
        var c2;
        for (c2 = 0; c2 < rows2[r2].cells.length; c2++) arr2.push(rows2[r2].cells[c2]);
        cells2 = arr2;
      }
      if (rows2.length === 1 && cells2.length >= colCount * 2) {
        var k2;
        for (k2 = downloadIdx; k2 < cells2.length; k2 += colCount) {
          var el = findClickableInCell(cells2[k2]);
          if (!el) continue;
          list.push(el);
          var name = fileNameFromDownloadEl(el);
          if (!name && fileIdx >= 0) {
            var fk = k2 - downloadIdx + fileIdx;
            if (fk >= 0 && fk < cells2.length) name = fileNameFromFileCell(cells2[fk]);
          }
          names.push(name || "（未识别）");
        }
        return { targets: list, names: names };
      }
      if (downloadIdx < cells2.length) {
        var c = findClickableInCell(cells2[downloadIdx]);
        if (c) {
          list.push(c);
          var name2 = fileNameFromDownloadEl(c);
          if (!name2 && fileIdx >= 0 && fileIdx < cells2.length) {
            name2 = fileNameFromFileCell(cells2[fileIdx]);
          }
          names.push(name2 || "（未识别）");
        }
      }
    }
    return { targets: list, names: names };
  }

  /** 当前标签/区域是否展示出来（隐藏 tab 里的另一张 DX 表不收集，避免下到错的列表） */
  function isTableShown(table) {
    var el = table;
    while (el && el !== document.documentElement) {
      var st = window.getComputedStyle(el);
      if (st.display === "none") return false;
      if (st.visibility === "hidden") return false;
      el = el.parentElement;
    }
    var r = table.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  }

  function collectAllDevExpressVisible() {
    var merged = { targets: [], names: [] };
    var dx = document.querySelectorAll('table[id$="_DXMainTable"]');
    var t;
    for (t = 0; t < dx.length; t++) {
      if (!isTableShown(dx[t])) continue;
      var got = collectDevExpressMainTableWithNames(dx[t]);
      if (got.targets.length) {
        merged.targets = merged.targets.concat(got.targets);
        merged.names = merged.names.concat(got.names);
      }
    }
    return merged;
  }

  function collectAll() {
    var empty = { targets: [], names: [] };
    var fromDx = collectAllDevExpressVisible();
    if (fromDx.targets.length) return fromDx;

    var tables = document.querySelectorAll("table");
    if (!tables.length) return empty;

    var bestTable = null;
    var bestIdx = -1;
    var bestColCount = 0;
    var bestScore = 0;

    for (t = 0; t < tables.length; t++) {
      var tbl = tables[t];
      var hdr = findDownloadHeaderInfo(tbl);
      if (!hdr) continue;
      var cnt = countDownloadTargets(tbl, hdr.downloadIdx, hdr.colCount);
      if (cnt > bestScore) {
        bestScore = cnt;
        bestTable = tbl;
        bestIdx = hdr.downloadIdx;
        bestColCount = hdr.colCount;
      }
    }

    if (!bestTable || bestIdx < 0) return empty;
    var fidx = findFileColumnIndex(bestTable);
    if (fidx < 0 && bestIdx > 0) fidx = bestIdx - 1;
    return collectTargetsFromTableWithNames(bestTable, bestIdx, bestColCount, fidx);
  }

  function toast(text) {
    var id = "download-helper-toast";
    var old = document.getElementById(id);
    if (old) old.remove();

    var box = document.createElement("div");
    box.id = id;
    box.textContent = text;
    box.style.cssText =
      "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;" +
      "padding:10px 14px;background:#222;color:#fff;font:13px/1.4 system-ui,sans-serif;" +
      "border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.35);";
    document.body.appendChild(box);
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 4500);
  }

  function removeFileListPanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.remove();
  }

  function showFileListPanel(names, statusLine) {
    removeFileListPanel();
    var wrap = document.createElement("div");
    wrap.id = PANEL_ID;
    wrap.style.cssText =
      "position:fixed;z-index:2147483646;left:50%;top:50%;transform:translate(-50%,-50%);" +
      "width:min(560px,92vw);max-height:72vh;background:#fff;color:#222;border-radius:8px;" +
      "box-shadow:0 8px 32px rgba(0,0,0,.45);font:13px/1.45 system-ui,sans-serif;" +
      "display:flex;flex-direction:column;";

    var header = document.createElement("div");
    header.style.cssText = "padding:12px 14px;border-bottom:1px solid #e5e5e5;";
    header.textContent = "待下载文件（共 " + names.length + " 个）";

    var status = document.createElement("div");
    status.id = PANEL_ID + "-status";
    status.style.cssText = "padding:8px 14px;font-size:12px;color:#444;background:#f5f5f5;border-bottom:1px solid #eee;";
    status.textContent = statusLine || "";

    var listWrap = document.createElement("div");
    listWrap.style.cssText = "overflow-y:auto;padding:10px 14px 12px;flex:1;min-height:100px;";
    var ol = document.createElement("ol");
    ol.style.cssText = "margin:0;padding-left:1.35em;";
    var i;
    for (i = 0; i < names.length; i++) {
      var li = document.createElement("li");
      li.style.cssText = "margin:3px 0;word-break:break-all;";
      li.textContent = names[i];
      ol.appendChild(li);
    }
    listWrap.appendChild(ol);

    var foot = document.createElement("div");
    foot.style.cssText = "padding:10px 14px;border-top:1px solid #e5e5e5;text-align:right;";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "关闭";
    btn.style.cssText = "padding:6px 14px;cursor:pointer;";
    btn.addEventListener("click", removeFileListPanel);
    foot.appendChild(btn);

    wrap.appendChild(header);
    wrap.appendChild(status);
    wrap.appendChild(listWrap);
    wrap.appendChild(foot);
    document.body.appendChild(wrap);
  }

  async function runAll() {
    var pack = collectAll();
    if (!pack.targets.length) {
      toast("未找到含 DOWNLOAD 列的表格或可点击的下载控件");
      return;
    }

    showFileListPanel(
      pack.names,
      "正在通过浏览器下载队列拉取文件（不跳转当前页），间隔 " + DELAY_MS + "ms…"
    );

    var items = [];
    var clickIndexes = [];
    var i;
    for (i = 0; i < pack.targets.length; i++) {
      var url = extractHttpUrlFromTarget(pack.targets[i]);
      if (url) items.push({ url: url, filename: pack.names[i] });
      else clickIndexes.push(i);
    }

    var fail = 0;
    if (items.length) {
      var batchRes = await new Promise(function (resolve) {
        try {
          chrome.runtime.sendMessage(
            {
              type: "DOWNLOAD_BATCH",
              items: items,
              delayMs: DELAY_MS,
            },
            function (res) {
              if (chrome.runtime.lastError) {
                resolve({
                  ok: false,
                  failCount: items.length,
                  error: chrome.runtime.lastError.message,
                });
                return;
              }
              resolve(res || { ok: false, failCount: items.length });
            }
          );
        } catch (e) {
          resolve({ ok: false, failCount: items.length });
        }
      });
      var fc =
        batchRes && typeof batchRes.failCount === "number"
          ? batchRes.failCount
          : items.length;
      fail += fc;
    }

    var j;
    for (j = 0; j < clickIndexes.length; j++) {
      try {
        pack.targets[clickIndexes[j]].click();
      } catch (e) {
        fail++;
      }
      if (j < clickIndexes.length - 1) await sleep(DELAY_MS);
    }

    var st = document.getElementById(PANEL_ID + "-status");
    if (st) {
      st.textContent =
        "已完成 " +
        pack.targets.length +
        " 个任务" +
        (fail ? "（其中 " + fail + " 个下载请求失败，请看扩展/下载栏）" : "") +
        "，当前列表页应未跳转。";
    }
    toast(
      fail
        ? "已处理 " + pack.targets.length + " 个，失败 " + fail + " 个"
        : "已加入 " + pack.targets.length + " 个后台下载"
    );
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === MSG) {
      runAll();
    }
  });
})();

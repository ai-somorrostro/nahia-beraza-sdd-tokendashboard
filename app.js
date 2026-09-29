(function () {
  "use strict";

  var state = {
    range: "day", // 'day' | 'week'
    sortKey: null, // null = file order
    sortDir: 1, // 1 = ascending, -1 = descending
    query: "",
    inMod: "all",
    outMod: "all",
    selected: null, // model name or null
    models: []
  };

  var statusEl = document.getElementById("status");
  var tableEl = document.getElementById("models-table");
  var bodyEl = document.getElementById("models-body");
  var totalsRow = document.getElementById("totals-row");
  var totalsTokensEl = document.getElementById("totals-tokens");
  var totalsCostEl = document.getElementById("totals-cost");
  var dayBtn = document.getElementById("range-day");
  var weekBtn = document.getElementById("range-week");
  var tokensRangeLabel = document.getElementById("tokens-range-label");
  var costRangeLabel = document.getElementById("cost-range-label");
  var filterNameEl = document.getElementById("filter-name");
  var filterInmodEl = document.getElementById("filter-inmod");
  var filterOutmodEl = document.getElementById("filter-outmod");
  var filtersClearEl = document.getElementById("filters-clear");
  var emptyEl = document.getElementById("empty");
  var chartsSectionEl = document.getElementById("charts");
  var pricesSvg = document.getElementById("prices-svg");
  var usageSvg = document.getElementById("usage-svg");
  var detailEl = document.getElementById("detail");
  var detailTitleEl = document.getElementById("detail-title");
  var detailCloseEl = document.getElementById("detail-close");
  var detailFilterNoteEl = document.getElementById("detail-filter-note");
  var detailMetricsEl = document.getElementById("detail-metrics");
  var detailPricesSvg = document.getElementById("detail-prices-svg");
  var detailUsageSvg = document.getElementById("detail-usage-svg");
  var detailSplitSvg = document.getElementById("detail-split-svg");
  var lastFocusedRow = null;

  function rangeSuffix() {
    return state.range === "day" ? "Day" : "Week";
  }

  function tokensFor(model) {
    return state.range === "day"
      ? model.inputTokensDay + model.outputTokensDay
      : model.inputTokensWeek + model.outputTokensWeek;
  }

  function costFor(model) {
    var input = state.range === "day" ? model.inputTokensDay : model.inputTokensWeek;
    var output = state.range === "day" ? model.outputTokensDay : model.outputTokensWeek;
    return input * model.inputPricePerToken + output * model.outputPricePerToken;
  }

  function formatMoney(value) {
    return "$" + value.toFixed(2);
  }

  function formatTokens(value) {
    if (value >= 1000000) {
      var m = value / 1000000;
      var text = m.toFixed(2).replace(/\.?0+$/, "");
      return text + "M";
    }
    if (value >= 1000) {
      return Math.round(value / 100) / 10 + "K";
    }
    return String(value);
  }

  function modalityLabel(model) {
    if (model.inputModality === model.outputModality) {
      return model.inputModality;
    }
    return model.inputModality + " -> " + model.outputModality;
  }

  function rowValues(model) {
    return {
      name: model.name,
      inPer1M: model.inputPricePerToken * 1000000,
      outPer1M: model.outputPricePerToken * 1000000,
      ttft: model.ttft_ms,
      tokens: tokensFor(model),
      cost: costFor(model),
      modality: modalityLabel(model)
    };
  }

  var comparators = {
    name: function (a, b) { return a.name.localeCompare(b.name); },
    inPer1M: function (a, b) { return a.inPer1M - b.inPer1M; },
    outPer1M: function (a, b) { return a.outPer1M - b.outPer1M; },
    ttft: function (a, b) { return a.ttft - b.ttft; },
    tokens: function (a, b) { return a.tokens - b.tokens; },
    cost: function (a, b) { return a.cost - b.cost; },
    modality: function (a, b) { return a.modality.localeCompare(b.modality); }
  };

  function applyFilters(models) {
    var q = state.query.trim().toLowerCase();
    return models.filter(function (model) {
      if (q && model.name.toLowerCase().indexOf(q) === -1) {
        return false;
      }
      if (state.inMod !== "all" && model.inputModality !== state.inMod) {
        return false;
      }
      if (state.outMod !== "all" && model.outputModality !== state.outMod) {
        return false;
      }
      return true;
    });
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  var PRICE_MAX = 0.65; // $/1M common scale; DeepSeek-R1 is drawn capped + labelled
  var CHART_TRACK_X = 160;
  var CHART_TRACK_W = 250;
  var CHART_ROW_H = 36;
  var CHART_TOP = 8;

  function svgEl(tag, attrs, text) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    if (text !== undefined && text !== null) {
      el.textContent = text;
    }
    return el;
  }

  function clearSvg(svg) {
    Array.prototype.slice.call(svg.childNodes).forEach(function (node) {
      if (node.tagName && node.tagName.toLowerCase() !== "title") {
        svg.removeChild(node);
      }
    });
  }

  function chartEmpty(figId, show) {
    var fig = document.getElementById(figId);
    var msg = fig.querySelector(".chart-empty");
    if (msg) {
      msg.hidden = !show;
    }
  }

  function renderPrices(rows) {
    clearSvg(pricesSvg);
    pricesSvg.setAttribute("viewBox", "0 0 560 " + (CHART_TOP * 2 + Math.max(rows.length, 1) * CHART_ROW_H));
    chartEmpty("chart-precios", rows.length === 0);
    rows.forEach(function (row, i) {
      var y = CHART_TOP + i * CHART_ROW_H;
      pricesSvg.appendChild(svgEl("text", { x: 0, y: y + 14, "class": "chart-label" }, row.values.name));
      var inW = Math.min(row.values.inPer1M, PRICE_MAX) / PRICE_MAX * CHART_TRACK_W;
      var inBar = svgEl("rect", {
        x: CHART_TRACK_X, y: y, width: Math.max(inW, 2), height: 9,
        "class": "bar-in" + (row.values.inPer1M > PRICE_MAX ? " capped" : "")
      });
      pricesSvg.appendChild(inBar);
      pricesSvg.appendChild(svgEl("text", { x: CHART_TRACK_X + Math.max(inW, 2) + 6, y: y + 8, "class": "chart-value" }, formatMoney(row.values.inPer1M)));
      var outW = Math.min(row.values.outPer1M, PRICE_MAX) / PRICE_MAX * CHART_TRACK_W;
      var outBar = svgEl("rect", {
        x: CHART_TRACK_X, y: y + 12, width: Math.max(outW, 2), height: 9,
        "class": "bar-out" + (row.values.outPer1M > PRICE_MAX ? " capped" : "")
      });
      pricesSvg.appendChild(outBar);
      pricesSvg.appendChild(svgEl("text", { x: CHART_TRACK_X + Math.max(outW, 2) + 6, y: y + 20, "class": "chart-value" }, formatMoney(row.values.outPer1M)));
    });
  }

  function renderUsage(rows) {
    clearSvg(usageSvg);
    usageSvg.setAttribute("viewBox", "0 0 560 " + (CHART_TOP * 2 + Math.max(rows.length, 1) * CHART_ROW_H));
    chartEmpty("chart-consumo", rows.length === 0);
    var maxU = 1;
    rows.forEach(function (row) {
      var day = row.model.inputTokensDay + row.model.outputTokensDay;
      var week = row.model.inputTokensWeek + row.model.outputTokensWeek;
      if (day > maxU) { maxU = day; }
      if (week > maxU) { maxU = week; }
    });
    rows.forEach(function (row, i) {
      var y = CHART_TOP + i * CHART_ROW_H;
      var day = row.model.inputTokensDay + row.model.outputTokensDay;
      var week = row.model.inputTokensWeek + row.model.outputTokensWeek;
      usageSvg.appendChild(svgEl("text", { x: 0, y: y + 14, "class": "chart-label" }, row.values.name));
      var dayW = Math.max(day / maxU * CHART_TRACK_W, 2);
      usageSvg.appendChild(svgEl("rect", {
        x: CHART_TRACK_X, y: y, width: dayW, height: 9,
        "class": "bar-day" + (state.range === "day" ? " active" : " inactive")
      }));
      usageSvg.appendChild(svgEl("text", { x: CHART_TRACK_X + dayW + 6, y: y + 8, "class": "chart-value" }, formatTokens(day)));
      var weekW = Math.max(week / maxU * CHART_TRACK_W, 2);
      usageSvg.appendChild(svgEl("rect", {
        x: CHART_TRACK_X, y: y + 12, width: weekW, height: 9,
        "class": "bar-week" + (state.range === "week" ? " active" : " inactive")
      }));
      usageSvg.appendChild(svgEl("text", { x: CHART_TRACK_X + weekW + 6, y: y + 20, "class": "chart-value" }, formatTokens(week)));
    });
  }

  function findModel(name) {
    for (var i = 0; i < state.models.length; i++) {
      if (state.models[i].name === name) {
        return state.models[i];
      }
    }
    return null;
  }

  function ttftStats() {
    var values = state.models.map(function (m) { return m.ttft_ms; }).sort(function (a, b) { return a - b; });
    if (values.length === 0) {
      return { min: 0, max: 0, median: 0 };
    }
    var mid = Math.floor(values.length / 2);
    var median = values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    return { min: values[0], max: values[values.length - 1], median: median };
  }

  function addMetric(term, value) {
    var dt = document.createElement("dt");
    dt.textContent = term;
    var dd = document.createElement("dd");
    dd.textContent = value;
    detailMetricsEl.appendChild(dt);
    detailMetricsEl.appendChild(dd);
  }

  function renderDetail() {
    var model = state.selected ? findModel(state.selected) : null;
    if (!model) {
      return;
    }
    var inPer1M = model.inputPricePerToken * 1000000;
    var outPer1M = model.outputPricePerToken * 1000000;
    var dayIn = model.inputTokensDay;
    var dayOut = model.outputTokensDay;
    var weekIn = model.inputTokensWeek;
    var weekOut = model.outputTokensWeek;
    var dayCost = dayIn * model.inputPricePerToken + dayOut * model.outputPricePerToken;
    var weekCost = weekIn * model.inputPricePerToken + weekOut * model.outputPricePerToken;
    var stats = ttftStats();

    detailTitleEl.textContent = model.name;
    while (detailMetricsEl.firstChild) {
      detailMetricsEl.removeChild(detailMetricsEl.firstChild);
    }
    addMetric("Input modality", model.inputModality);
    addMetric("Output modality", model.outputModality);
    addMetric("Input price/token", "$" + model.inputPricePerToken);
    addMetric("Output price/token", "$" + model.outputPricePerToken);
    addMetric("Input price/1M", formatMoney(inPer1M));
    addMetric("Output price/1M", formatMoney(outPer1M));
    addMetric("TTFT", model.ttft_ms + " ms (min " + stats.min + ", max " + stats.max + ", median " + stats.median + ")");
    addMetric("Day input tokens", formatTokens(dayIn));
    addMetric("Day output tokens", formatTokens(dayOut));
    addMetric("Day total/cost", formatTokens(dayIn + dayOut) + " / " + formatMoney(dayCost));
    addMetric("Week input tokens", formatTokens(weekIn));
    addMetric("Week output tokens", formatTokens(weekOut));
    addMetric("Week total/cost", formatTokens(weekIn + weekOut) + " / " + formatMoney(weekCost));

    var visible = applyFilters(state.models).some(function (m) { return m.name === model.name; });
    detailFilterNoteEl.hidden = visible;

    renderDetailPrices(model, inPer1M, outPer1M);
    renderDetailUsage(model, dayIn + dayOut, weekIn + weekOut);
    renderDetailSplit(model);
  }

  function renderDetailPrices(model, inPer1M, outPer1M) {
    var svg = detailPricesSvg;
    clearSvg(svg);
    svg.setAttribute("viewBox", "0 0 340 64");
    var trackX = 110;
    var trackW = 140;
    var inW = Math.min(inPer1M, PRICE_MAX) / PRICE_MAX * trackW;
    svg.appendChild(svgEl("text", { x: 0, y: 16, "class": "chart-label" }, "In $/1M"));
    svg.appendChild(svgEl("rect", {
      x: trackX, y: 6, width: Math.max(inW, 2), height: 12,
      "class": "bar-in" + (inPer1M > PRICE_MAX ? " capped" : "")
    }));
    svg.appendChild(svgEl("text", { x: trackX + Math.max(inW, 2) + 6, y: 16, "class": "chart-value" }, formatMoney(inPer1M)));
    var outW = Math.min(outPer1M, PRICE_MAX) / PRICE_MAX * trackW;
    svg.appendChild(svgEl("text", { x: 0, y: 44, "class": "chart-label" }, "Out $/1M"));
    svg.appendChild(svgEl("rect", {
      x: trackX, y: 34, width: Math.max(outW, 2), height: 12,
      "class": "bar-out" + (outPer1M > PRICE_MAX ? " capped" : "")
    }));
    svg.appendChild(svgEl("text", { x: trackX + Math.max(outW, 2) + 6, y: 44, "class": "chart-value" }, formatMoney(outPer1M)));
  }

  function renderDetailUsage(model, dayTotal, weekTotal) {
    var svg = detailUsageSvg;
    clearSvg(svg);
    svg.setAttribute("viewBox", "0 0 340 64");
    var maxU = Math.max(dayTotal, weekTotal, 1);
    var trackX = 110;
    var trackW = 140;
    var dayW = Math.max(dayTotal / maxU * trackW, 2);
    svg.appendChild(svgEl("text", { x: 0, y: 16, "class": "chart-label" }, "Day"));
    svg.appendChild(svgEl("rect", {
      x: trackX, y: 6, width: dayW, height: 12,
      "class": "bar-day" + (state.range === "day" ? " active" : " inactive")
    }));
    svg.appendChild(svgEl("text", { x: trackX + dayW + 6, y: 16, "class": "chart-value" }, formatTokens(dayTotal)));
    var weekW = Math.max(weekTotal / maxU * trackW, 2);
    svg.appendChild(svgEl("text", { x: 0, y: 44, "class": "chart-label" }, "Week"));
    svg.appendChild(svgEl("rect", {
      x: trackX, y: 34, width: weekW, height: 12,
      "class": "bar-week" + (state.range === "week" ? " active" : " inactive")
    }));
    svg.appendChild(svgEl("text", { x: trackX + weekW + 6, y: 16 + 28, "class": "chart-value" }, formatTokens(weekTotal)));
  }

  function renderDetailSplit(model) {
    var svg = detailSplitSvg;
    clearSvg(svg);
    svg.setAttribute("viewBox", "0 0 340 44");
    var isDay = state.range === "day";
    var input = isDay ? model.inputTokensDay : model.inputTokensWeek;
    var output = isDay ? model.outputTokensDay : model.outputTokensWeek;
    var total = Math.max(input + output, 1);
    var barX = 8;
    var barW = 324;
    var inW = Math.max(input / total * barW, 2);
    var outW = Math.max(barW - inW, 2);
    svg.appendChild(svgEl("rect", { x: barX, y: 6, width: inW, height: 14, "class": "bar-in" }));
    svg.appendChild(svgEl("rect", { x: barX + inW, y: 6, width: outW, height: 14, "class": "bar-out" }));
    var inPct = Math.round(input / total * 100);
    svg.appendChild(svgEl("text", { x: 8, y: 36, "class": "chart-value" }, "In " + inPct + "% (" + rangeSuffix() + ")"));
    svg.appendChild(svgEl("text", { x: 200, y: 36, "class": "chart-value" }, "Out " + (100 - inPct) + "% (" + rangeSuffix() + ")"));
  }

  function openDetail(name, rowEl) {
    var model = findModel(name);
    if (!model) {
      return;
    }
    state.selected = name;
    lastFocusedRow = rowEl || null;
    detailEl.hidden = false;
    render();
    detailCloseEl.focus();
  }

  function closeDetail() {
    var name = state.selected;
    state.selected = null;
    detailEl.hidden = true;
    render();
    var target = null;
    if (name) {
      target = bodyEl.querySelector('tr[data-model="' + name + '"]');
    }
    if (target) {
      target.focus();
    } else if (lastFocusedRow && document.contains(lastFocusedRow)) {
      lastFocusedRow.focus();
    } else {
      filterNameEl.focus();
    }
    lastFocusedRow = null;
  }

  function cell(text, numeric) {
    var td = document.createElement("td");
    td.textContent = text;
    if (numeric) {
      td.className = "num";
    }
    return td;
  }

  function render() {
    var visible = applyFilters(state.models);
    var rows = visible.map(function (model) {
      return { model: model, values: rowValues(model) };
    });

    if (state.sortKey && comparators[state.sortKey]) {
      var compare = comparators[state.sortKey];
      var dir = state.sortDir;
      rows.sort(function (a, b) { return compare(a.values, b.values) * dir; });
    }

    while (bodyEl.firstChild) {
      bodyEl.removeChild(bodyEl.firstChild);
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.dataset.model = row.values.name;
      tr.setAttribute("tabindex", "0");
      if (state.selected === row.values.name) {
        tr.setAttribute("aria-selected", "true");
      }
      tr.appendChild(cell(row.values.name, false));
      tr.appendChild(cell(formatMoney(row.values.inPer1M), true));
      tr.appendChild(cell(formatMoney(row.values.outPer1M), true));
      tr.appendChild(cell(String(row.values.ttft), true));
      tr.appendChild(cell(formatTokens(row.values.tokens), true));
      tr.appendChild(cell(formatMoney(row.values.cost), true));
      tr.appendChild(cell(row.values.modality, false));
      bodyEl.appendChild(tr);
    });

    var totalTokens = 0;
    var totalCost = 0;
    visible.forEach(function (model) {
      totalTokens += tokensFor(model);
      totalCost += costFor(model);
    });
    totalsTokensEl.textContent = formatTokens(totalTokens);
    totalsCostEl.textContent = formatMoney(totalCost);
    emptyEl.hidden = rows.length !== 0;
    renderPrices(rows);
    renderUsage(rows);
    if (!detailEl.hidden && state.selected) {
      renderDetail();
    }

    var label = rangeSuffix();
    tokensRangeLabel.textContent = label;
    costRangeLabel.textContent = label;
    dayBtn.setAttribute("aria-pressed", state.range === "day" ? "true" : "false");
    weekBtn.setAttribute("aria-pressed", state.range === "week" ? "true" : "false");

    var headers = tableEl.querySelectorAll("thead th");
    headers.forEach(function (th) {
      var button = th.querySelector("button");
      if (!button) {
        return;
      }
      var key = button.getAttribute("data-sort");
      if (key === state.sortKey) {
        th.setAttribute("aria-sort", state.sortDir === 1 ? "ascending" : "descending");
      } else {
        th.setAttribute("aria-sort", "none");
      }
    });
  }

  function showTable() {
    statusEl.textContent = "";
    statusEl.className = "status";
    emptyEl.hidden = true;
    chartsSectionEl.hidden = false;
    tableEl.hidden = false;
    totalsRow.hidden = false;
  }

  function showEmpty() {
    emptyEl.hidden = false;
  }

  function showError(message) {
    statusEl.textContent = message;
    statusEl.className = "status error";
    emptyEl.hidden = true;
    chartsSectionEl.hidden = true;
    detailEl.hidden = true;
    tableEl.hidden = true;
    totalsRow.hidden = true;
  }

  function setRange(range) {
    if (state.range !== range) {
      state.range = range;
      render();
    }
  }

  function onSortButtonClick(event) {
    var key = event.currentTarget.getAttribute("data-sort");
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 1 ? -1 : 1;
    } else {
      state.sortKey = key;
      state.sortDir = 1;
    }
    render();
  }

  dayBtn.addEventListener("click", function () { setRange("day"); });
  weekBtn.addEventListener("click", function () { setRange("week"); });

  filterNameEl.addEventListener("input", function () {
    state.query = filterNameEl.value;
    render();
  });
  filterInmodEl.addEventListener("change", function () {
    state.inMod = filterInmodEl.value;
    render();
  });
  filterOutmodEl.addEventListener("change", function () {
    state.outMod = filterOutmodEl.value;
    render();
  });
  filtersClearEl.addEventListener("click", function () {
    state.query = "";
    state.inMod = "all";
    state.outMod = "all";
    filterNameEl.value = "";
    filterInmodEl.value = "all";
    filterOutmodEl.value = "all";
    render();
  });

  var sortButtons = tableEl.querySelectorAll("thead button[data-sort]");
  sortButtons.forEach(function (button) {
    button.addEventListener("click", onSortButtonClick);
  });

  bodyEl.addEventListener("click", function (event) {
    var tr = event.target.closest("tr");
    if (!tr || !tr.dataset.model) {
      return;
    }
    openDetail(tr.dataset.model, tr);
  });

  bodyEl.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    var tr = event.target.closest("tr");
    if (!tr || !tr.dataset.model) {
      return;
    }
    event.preventDefault();
    openDetail(tr.dataset.model, tr);
  });

  detailCloseEl.addEventListener("click", function () { closeDetail(); });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !detailEl.hidden) {
      closeDetail();
    }
  });

  fetch("mock-data.json")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      if (!Array.isArray(data) || data.length === 0) {
        showError("No model data available.");
        return;
      }
      state.models = data;
      showTable();
      render();
    })
    .catch(function () {
      showError("Could not load mock-data.json. Serve this folder over http (e.g. python3 -m http.server) and keep mock-data.json next to index.html.");
    });
})();

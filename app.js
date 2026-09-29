(function () {
  "use strict";

  var state = {
    range: "day", // 'day' | 'week'
    sortKey: null, // null = file order
    sortDir: 1, // 1 = ascending, -1 = descending
    query: "",
    inMod: "all",
    outMod: "all",
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

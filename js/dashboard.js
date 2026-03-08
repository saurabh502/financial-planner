(function () {
  const chartRegistry = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatPercent(value) {
    return round(value) + "%";
  }

  function round(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 10) / 10;
  }

  function scoreColor(score) {
    if (score >= 75) {
      return "#4caf50";
    }
    if (score >= 50) {
      return "#ff9800";
    }
    return "#f44336";
  }

  function destroyChart(id) {
    if (chartRegistry[id]) {
      chartRegistry[id].destroy();
      delete chartRegistry[id];
    }
  }

  function createChart(id, config) {
    destroyChart(id);
    const canvas = byId(id);
    if (!canvas) {
      return null;
    }
    chartRegistry[id] = new Chart(canvas, config);
    return chartRegistry[id];
  }

  function setText(id, value) {
    const node = byId(id);
    if (node) {
      node.textContent = value;
    }
  }

  function renderMetricGrid(targetId, metrics) {
    const target = byId(targetId);
    if (!target) {
      return;
    }

    target.innerHTML = metrics.map(function (metric) {
      return [
        '<div class="metric-card">',
        '<span class="metric-label">' + escapeHtml(metric.label) + "</span>",
        '<span class="metric-value ' + (metric.className || "") + '">' + escapeHtml(metric.value) + "</span>",
        "</div>"
      ].join("");
    }).join("");
  }

  function renderTable(tableId, columns, rows) {
    const table = byId(tableId);
    if (!table) {
      return;
    }

    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    thead.innerHTML = "<tr>" + columns.map(function (column) {
      return "<th>" + escapeHtml(column.label) + "</th>";
    }).join("") + "</tr>";

    tbody.innerHTML = rows.length > 0 ? rows.map(function (row) {
      return "<tr>" + columns.map(function (column) {
        const rawValue = typeof column.render === "function" ? column.render(row[column.key], row) : row[column.key];
        return "<td>" + rawValue + "</td>";
      }).join("") + "</tr>";
    }).join("") : '<tr><td colspan="' + columns.length + '">No data available.</td></tr>';
  }

  function renderActionItems(items) {
    const root = byId("actionItemsList");
    if (!root) {
      return;
    }

    root.innerHTML = items.length > 0 ? items.map(function (item) {
      const urgencyClass = item.urgency === "High" ? "urgency-high" : item.urgency === "Medium" ? "urgency-medium" : "urgency-low";
      return [
        '<div class="action-item">',
        '<div class="urgency-pill ' + urgencyClass + '">' + escapeHtml(item.urgency) + "</div>",
        "<div>",
        "<strong>" + escapeHtml(item.title) + "</strong>",
        "<p>" + escapeHtml(item.description) + "</p>",
        "</div>",
        "</div>"
      ].join("");
    }).join("") : '<div class="action-item"><div class="urgency-pill urgency-low">Info</div><div><strong>No urgent action items</strong><p>The current input set does not surface major corrective actions.</p></div></div>';
  }

  function renderSimpleList(targetId, items, className) {
    const root = byId(targetId);
    if (!root) {
      return;
    }

    root.innerHTML = items.length > 0 ? items.map(function (item) {
      return '<div class="' + className + '">' + escapeHtml(item) + "</div>";
    }).join("") : '<div class="' + className + '">No items available.</div>';
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderOverallScore(plan) {
    const score = round(plan.metrics.overallFinancialHealthScore);
    const color = scoreColor(score);
    const pill = byId("overallScorePill");
    pill.textContent = score + " / 100";
    pill.style.background = color;

    setText("dashboardHouseholdName", plan.householdName + " Financial Plan");
    setText("dashboardDate", "Generated on " + new Date(plan.generatedOn).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }));
    setText("financialFreedomStatus", "Status: " + plan.metrics.financialFreedomStatus);
    setText("goalSuccessProbability", "Goal success: " + round(plan.metrics.goalSuccessProbability) + "%");

    createChart("overallScoreChart", {
      type: "doughnut",
      data: {
        labels: ["Score", "Remaining"],
        datasets: [{
          data: [score, Math.max(0, 100 - score)],
          backgroundColor: [color, "#e8ecf6"],
          borderWidth: 0,
          cutout: "72%"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  function renderIncomeAndCashFlow(plan) {
    setText("cashFlowSummary", "Savings rate " + formatPercent(plan.metrics.savingsRate) + " with free cash flow of " + formatCurrency(plan.metrics.freeCashFlow));
    createChart("incomeSplitChart", {
      type: "pie",
      data: {
        labels: plan.charts.incomeSplit.map(function (item) { return item.label; }),
        datasets: [{
          data: plan.charts.incomeSplit.map(function (item) { return item.value; }),
          backgroundColor: ["#1a237e", "#4caf50", "#ff9800", "#26a69a", "#7e57c2", "#ef5350"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" }
        }
      }
    });

    createChart("monthlySurplusChart", {
      type: "bar",
      data: {
        labels: plan.charts.surplusBreakdown.map(function (item) { return item.label; }),
        datasets: [{
          label: "Monthly Rs",
          data: plan.charts.surplusBreakdown.map(function (item) { return item.value; }),
          backgroundColor: ["#1a237e", "#ef5350", "#ff9800", "#26a69a", "#4caf50"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    renderMetricGrid("incomeCashFlowMetrics", [
      { label: "Monthly Income", value: formatCurrency(plan.metrics.totalMonthlyIncome) },
      { label: "Monthly Expenses", value: formatCurrency(plan.metrics.totalMonthlyExpenses) },
      { label: "Monthly Surplus", value: formatCurrency(plan.metrics.monthlySurplus), className: plan.metrics.monthlySurplus >= 0 ? "positive" : "negative" },
      { label: "Income Concentration", value: formatPercent(plan.metrics.incomeConcentrationRatio * 100) }
    ]);
  }

  function renderNetWorth(plan) {
    setText("netWorthSummary", "Net worth " + formatCurrency(plan.metrics.netWorth) + " with liquid assets of " + formatCurrency(plan.metrics.liquidNetWorth));
    createChart("netWorthChart", {
      type: "bar",
      data: {
        labels: ["Assets", "Liabilities", "Net Worth"],
        datasets: [{
          data: [plan.metrics.totalAssets, plan.metrics.totalLiabilities, plan.metrics.netWorth],
          backgroundColor: ["#1a237e", "#f44336", "#4caf50"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    renderMetricGrid("netWorthMetrics", [
      { label: "Total Assets", value: formatCurrency(plan.metrics.totalAssets) },
      { label: "Total Liabilities", value: formatCurrency(plan.metrics.totalLiabilities) },
      { label: "Liquid Net Worth", value: formatCurrency(plan.metrics.liquidNetWorth) },
      { label: "Investable Net Worth", value: formatCurrency(plan.metrics.investableNetWorth) }
    ]);
  }

  function renderAssetAllocation(plan) {
    createChart("currentAllocationChart", {
      type: "doughnut",
      data: {
        labels: plan.charts.currentAllocation.labels,
        datasets: [{
          data: plan.charts.currentAllocation.series,
          backgroundColor: ["#1a237e", "#4caf50", "#ff9800", "#8d6e63", "#ffd54f", "#90a4ae"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Current Allocation %" },
          legend: { position: "bottom" }
        }
      }
    });

    createChart("idealAllocationChart", {
      type: "doughnut",
      data: {
        labels: Object.keys(plan.charts.idealAllocation),
        datasets: [{
          data: Object.values(plan.charts.idealAllocation),
          backgroundColor: ["#1a237e", "#4caf50", "#ff9800", "#8d6e63", "#ffd54f", "#90a4ae"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: "Ideal Allocation %" },
          legend: { position: "bottom" }
        }
      }
    });
  }

  function renderGoalTracker(plan) {
    setText("goalTrackerSummary", plan.tables.goals.length > 0
      ? "Total goal SIP needed " + formatCurrency(plan.metrics.totalGoalSipNeeded) + " per month"
      : "Add goals to project future value and SIP needs");

    renderTable("goalTrackerTable", [
      { key: "name", label: "Goal" },
      { key: "priority", label: "Priority" },
      { key: "targetYear", label: "Target Year" },
      { key: "futureValue", label: "Future Value", render: function (value) { return escapeHtml(formatCurrency(value)); } },
      { key: "monthlyInvestmentNeeded", label: "Monthly SIP Needed", render: function (value) { return escapeHtml(formatCurrency(value)); } },
      { key: "fundingGap", label: "Funding Gap", render: function (value) { return escapeHtml(formatCurrency(value)); } }
    ], plan.tables.goals);
  }

  function renderRetirement(plan) {
    setText("retirementSummary", plan.metrics.yearsToRetirement + " years to retirement with corpus need of " + formatCurrency(plan.metrics.retirementCorpusRequired));
    setText("retirementScoreText", round(plan.metrics.retirementReadinessScore) + "%");
    byId("retirementProgressFill").style.width = Math.min(100, round(plan.metrics.retirementReadinessScore)) + "%";
    byId("retirementProgressFill").style.background = scoreColor(plan.metrics.retirementReadinessScore);

    renderMetricGrid("retirementMetrics", [
      { label: "Required Corpus", value: formatCurrency(plan.metrics.retirementCorpusRequired) },
      { label: "Projected Existing Corpus", value: formatCurrency(plan.metrics.retirementCorpusExisting) },
      { label: "Annual Expense at Retirement", value: formatCurrency(plan.metrics.annualExpenseAtRetirement) },
      { label: "Years to Retirement", value: String(plan.metrics.yearsToRetirement) }
    ]);
  }

  function renderInsurance(plan) {
    setText("insuranceSummary", "Insurance adequacy score " + formatPercent(plan.metrics.insuranceAdequacyScore));
    renderTable("insuranceTable", [
      { key: "type", label: "Policy Type" },
      { key: "required", label: "Required", render: function (value) { return escapeHtml(formatCurrency(value)); } },
      { key: "existing", label: "Existing", render: function (value) { return escapeHtml(formatCurrency(value)); } },
      { key: "gap", label: "Gap", render: function (value) { return escapeHtml(formatCurrency(value)); } },
      { key: "adequacy", label: "Adequacy", render: function (value) { return escapeHtml(formatPercent(value)); } }
    ], plan.tables.insurance);
  }

  function renderEmergency(plan) {
    setText("emergencySummary", "Current reserve covers " + round(plan.metrics.monthsCovered) + " months of expenses");
    const coveredMonths = Math.min(plan.metrics.monthsCovered, 6);
    createChart("emergencyFundChart", {
      type: "doughnut",
      data: {
        labels: ["Covered", "Gap"],
        datasets: [{
          data: [coveredMonths, Math.max(0, 6 - coveredMonths)],
          backgroundColor: [scoreColor(plan.metrics.emergencyScore), "#e8ecf6"],
          borderWidth: 0,
          cutout: "70%"
        }]
      },
      options: {
        rotation: -90,
        circumference: 180,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" }
        }
      }
    });

    renderMetricGrid("emergencyMetrics", [
      { label: "Emergency Fund Existing", value: formatCurrency(plan.metrics.emergencyFundExisting) },
      { label: "Required", value: formatCurrency(plan.metrics.emergencyFundRequired) },
      { label: "Months Covered", value: round(plan.metrics.monthsCovered).toString() },
      { label: "Adequacy", value: plan.metrics.emergencyAdequacy.toUpperCase(), className: plan.metrics.emergencyAdequacy === "green" ? "positive" : plan.metrics.emergencyAdequacy === "amber" ? "warning" : "negative" }
    ]);
  }

  function renderLiabilities(plan) {
    setText("liabilitySummary", "EMI to income ratio is " + formatPercent(plan.metrics.emiToIncomeRatio));
    renderMetricGrid("liabilityMetrics", [
      { label: "Total Monthly EMI", value: formatCurrency(plan.metrics.totalMonthlyEmi) },
      { label: "EMI / Income", value: formatPercent(plan.metrics.emiToIncomeRatio), className: plan.metrics.emiToIncomeRatio <= 40 ? "positive" : "negative" },
      { label: "Debt / Asset", value: formatPercent(plan.metrics.debtToAssetRatio), className: plan.metrics.debtToAssetRatio <= 50 ? "positive" : "warning" },
      { label: "Debt Health Score", value: formatPercent(plan.metrics.debtHealthScore) }
    ]);

    renderTable("liabilityTable", [
      { key: "type", label: "Loan" },
      { key: "outstanding", label: "Outstanding", render: function (value) { return escapeHtml(formatCurrency(value)); } },
      { key: "emi", label: "EMI", render: function (value) { return escapeHtml(formatCurrency(value)); } },
      { key: "interestRate", label: "Interest Rate", render: function (value) { return escapeHtml(formatPercent(Number(value || 0) * 100)); } },
      { key: "tenureYears", label: "Years Left" }
    ], plan.tables.liabilities);
  }

  function renderTaxEfficiency(plan) {
    setText("taxSummary", "Unused 80C: " + formatCurrency(plan.metrics.unused80c) + ", Unused 80D: " + formatCurrency(plan.metrics.unused80d));
    createChart("taxEfficiencyChart", {
      type: "bar",
      data: {
        labels: plan.charts.taxEfficiency.labels,
        datasets: [{
          data: plan.charts.taxEfficiency.values,
          backgroundColor: ["#1a237e", "#4caf50", "#283593", "#ff9800"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    renderMetricGrid("taxMetrics", [
      { label: "80C Utilized", value: formatCurrency(plan.metrics.total80cUtilization) },
      { label: "80C Remaining", value: formatCurrency(plan.metrics.unused80c) },
      { label: "80D Utilized", value: formatCurrency(plan.metrics.total80dUtilization) },
      { label: "80D Remaining", value: formatCurrency(plan.metrics.unused80d) }
    ]);
  }

  function renderRiskDiagnostics(plan) {
    setText("riskSummary", "Balanced view across liquidity, protection, goals, retirement, debt, and diversification");
    createChart("riskRadarChart", {
      type: "radar",
      data: {
        labels: ["Cash Flow", "Protection", "Goals", "Retirement", "Debt", "Diversification"],
        datasets: [{
          label: "Risk Diagnostics",
          data: [
            plan.charts.riskDiagnostics.cashFlowResilience,
            plan.charts.riskDiagnostics.protection,
            plan.charts.riskDiagnostics.goalPreparedness,
            plan.charts.riskDiagnostics.retirement,
            plan.charts.riskDiagnostics.debtManagement,
            plan.charts.riskDiagnostics.diversification
          ],
          fill: true,
          backgroundColor: "rgba(26, 35, 126, 0.16)",
          borderColor: "#1a237e",
          pointBackgroundColor: "#4caf50"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false }
          }
        }
      }
    });
  }

  function renderActionAndSummary(plan) {
    renderActionItems(plan.actionItems);
    renderSimpleList("executiveSummaryList", plan.executiveSummary, "summary-item");
    renderSimpleList("assumptionsList", plan.assumptions, "assumption-item");
  }

  function renderDashboard(plan) {
    if (!plan || !plan.metrics) {
      return;
    }

    byId("emptyState").classList.add("hidden");
    byId("dashboardRoot").classList.remove("hidden");

    renderOverallScore(plan);
    renderIncomeAndCashFlow(plan);
    renderNetWorth(plan);
    renderAssetAllocation(plan);
    renderGoalTracker(plan);
    renderRetirement(plan);
    renderInsurance(plan);
    renderEmergency(plan);
    renderLiabilities(plan);
    renderTaxEfficiency(plan);
    renderRiskDiagnostics(plan);
    renderActionAndSummary(plan);
  }

  window.FinancialPlannerDashboard = {
    renderDashboard: renderDashboard,
    destroyAllCharts: function () {
      Object.keys(chartRegistry).forEach(destroyChart);
    }
  };
})();

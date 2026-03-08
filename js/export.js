(function () {
  function formatDateForFilename(dateString) {
    return new Date(dateString).toISOString().slice(0, 10);
  }

  function safeFileBaseName(name) {
    return String(name || "financial-plan")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "financial-plan";
  }

  function setColumnWidths(worksheet, widths) {
    worksheet["!cols"] = widths.map(function (width) {
      return { wch: width };
    });
  }

  function formatWorksheetNumbers(worksheet, currencyColumns, percentColumns, startRow, rowCount) {
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    const firstDataRow = startRow || 1;
    const lastDataRow = Math.max(firstDataRow, rowCount || range.e.r);

    currencyColumns.forEach(function (columnIndex) {
      for (let row = firstDataRow; row <= lastDataRow; row += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: columnIndex });
        if (worksheet[cellAddress] && typeof worksheet[cellAddress].v === "number") {
          worksheet[cellAddress].z = '"Rs" #,##0';
        }
      }
    });

    percentColumns.forEach(function (columnIndex) {
      for (let row = firstDataRow; row <= lastDataRow; row += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: columnIndex });
        if (worksheet[cellAddress] && typeof worksheet[cellAddress].v === "number") {
          worksheet[cellAddress].z = '0.0%';
        }
      }
    });
  }

  function appendSheet(workbook, name, rows, widths, currencyColumns, percentColumns) {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    setColumnWidths(worksheet, widths);
    formatWorksheetNumbers(worksheet, currencyColumns || [], percentColumns || [], 1, rows.length - 1);
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }

  function buildWorkbook(plan) {
    const workbook = XLSX.utils.book_new();

    appendSheet(workbook, "Dashboard", [
      ["Household", plan.householdName],
      ["Generated On", new Date(plan.generatedOn).toLocaleDateString("en-IN")],
      ["Overall Financial Health Score", plan.metrics.overallFinancialHealthScore / 100],
      ["Financial Freedom Status", plan.metrics.financialFreedomStatus],
      ["Goal Success Probability", plan.metrics.goalSuccessProbability / 100],
      ["Net Worth", plan.metrics.netWorth],
      ["Monthly Income", plan.metrics.totalMonthlyIncome],
      ["Monthly Expenses", plan.metrics.totalMonthlyExpenses],
      ["Free Cash Flow", plan.metrics.freeCashFlow]
    ], [28, 24], [], []);

    appendSheet(workbook, "Inputs Echo", [
      ["Section", "Field", "Value"],
      ["Household", "Name", plan.householdName],
      ["Household", "Planning Year", plan.planningYear],
      ["Emergency", "Emergency Fund Existing", plan.rawInput.emergencyFundExisting],
      ["Emergency", "Elderly Dependents", plan.rawInput.elderlyDependents],
      ["Tax", "80C Current", plan.rawInput.section80cCurrent],
      ["Tax", "80D Current", plan.rawInput.section80dCurrent],
      ["Retirement", "Lifestyle", plan.rawInput.retirementLifestyle]
    ], [18, 24, 18], [], []);

    appendSheet(workbook, "Cash Flow Analysis", [
      ["Metric", "Value"],
      ["Total Monthly Income", plan.metrics.totalMonthlyIncome],
      ["Total Monthly Expenses", plan.metrics.totalMonthlyExpenses],
      ["Essential Expenses", plan.metrics.essentialExpenseTotal],
      ["Discretionary Expenses", plan.metrics.discretionaryExpenseTotal],
      ["Monthly EMI", plan.metrics.totalMonthlyEmi],
      ["Monthly SIP", plan.metrics.totalMonthlySipContributions],
      ["Monthly Surplus", plan.metrics.monthlySurplus],
      ["Free Cash Flow", plan.metrics.freeCashFlow],
      ["Savings Rate", plan.metrics.savingsRate / 100]
    ], [28, 18], [1], [1]);

    appendSheet(workbook, "Net Worth", [
      ["Metric", "Value"],
      ["Total Assets", plan.metrics.totalAssets],
      ["Total Liabilities", plan.metrics.totalLiabilities],
      ["Net Worth", plan.metrics.netWorth],
      ["Liquid Net Worth", plan.metrics.liquidNetWorth],
      ["Investable Net Worth", plan.metrics.investableNetWorth],
      ["Debt to Asset Ratio", plan.metrics.debtToAssetRatio / 100]
    ], [28, 18], [1], [1]);

    const goalRows = [["Goal", "Priority", "Target Year", "Current Cost", "Future Value", "Monthly SIP Needed", "Funding Gap"]];
    plan.tables.goals.forEach(function (goal) {
      goalRows.push([
        goal.name,
        goal.priority,
        goal.targetYear,
        goal.currentCost,
        goal.futureValue,
        goal.monthlyInvestmentNeeded,
        goal.fundingGap
      ]);
    });
    appendSheet(workbook, "Goal Projections", goalRows, [22, 14, 12, 16, 18, 18, 18], [3, 4, 5, 6], []);

    appendSheet(workbook, "Retirement Plan", [
      ["Metric", "Value"],
      ["Years to Retirement", plan.metrics.yearsToRetirement],
      ["Annual Expense at Retirement", plan.metrics.annualExpenseAtRetirement],
      ["Required Corpus", plan.metrics.retirementCorpusRequired],
      ["Projected Existing Corpus", plan.metrics.retirementCorpusExisting],
      ["Readiness Score", plan.metrics.retirementReadinessScore / 100]
    ], [30, 20], [1], [1]);

    const insuranceRows = [["Type", "Required", "Existing", "Gap", "Adequacy"]];
    plan.tables.insurance.forEach(function (row) {
      insuranceRows.push([
        row.type,
        row.required,
        row.existing,
        row.gap,
        row.adequacy / 100
      ]);
    });
    appendSheet(workbook, "Insurance Analysis", insuranceRows, [20, 16, 16, 16, 12], [1, 2, 3], [4]);

    const recommendationRows = [["Urgency", "Action Item", "Description"]];
    plan.actionItems.forEach(function (item) {
      recommendationRows.push([item.urgency, item.title, item.description]);
    });
    appendSheet(workbook, "Recommendations", recommendationRows, [14, 28, 60], [], []);

    return workbook;
  }

  function downloadExcel(plan) {
    const workbook = buildWorkbook(plan);
    const fileName = safeFileBaseName(plan.householdName) + "-" + formatDateForFilename(plan.generatedOn) + ".xlsx";
    XLSX.writeFile(workbook, fileName);
  }

  async function downloadPdf(plan) {
    const dashboardRoot = document.getElementById("dashboardRoot");
    if (!dashboardRoot) {
      return;
    }

    const sections = Array.from(dashboardRoot.querySelectorAll(".hero-score-section, .dashboard-card"));
    const pdfLib = window.jspdf;
    if (!pdfLib || !pdfLib.jsPDF) {
      throw new Error("jsPDF is not available.");
    }

    const pdf = new pdfLib.jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    let isFirstPage = true;

    for (const section of sections) {
      const canvas = await html2canvas(section, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true
      });

      const imageData = canvas.toDataURL("image/png");
      const imageWidth = pageWidth - (margin * 2);
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      if (!isFirstPage) {
        pdf.addPage();
      }
      isFirstPage = false;

      let renderHeight = imageHeight;
      let renderY = margin;
      if (imageHeight > pageHeight - (margin * 2)) {
        renderHeight = pageHeight - (margin * 2);
        renderY = margin;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(plan.householdName + " Financial Plan", margin, 7);
      pdf.addImage(imageData, "PNG", margin, renderY + 5, imageWidth, renderHeight - 5, undefined, "FAST");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text("Generated " + new Date(plan.generatedOn).toLocaleDateString("en-IN"), margin, pageHeight - 4);
    }

    const fileName = safeFileBaseName(plan.householdName) + "-" + formatDateForFilename(plan.generatedOn) + ".pdf";
    pdf.save(fileName);
  }

  window.FinancialPlannerExport = {
    buildWorkbook: buildWorkbook,
    downloadExcel: downloadExcel,
    downloadPdf: downloadPdf
  };
})();

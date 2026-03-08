(function () {
  const tableTemplateMap = {
    familyRows: "familyRowTemplate",
    incomeRows: "incomeRowTemplate",
    expenseRows: "expenseRowTemplate",
    assetRows: "assetRowTemplate",
    liabilityRows: "liabilityRowTemplate",
    insuranceRows: "insuranceRowTemplate",
    goalRows: "goalRowTemplate"
  };

  const defaultRowCounts = {
    familyRows: 2,
    incomeRows: 1,
    expenseRows: 3,
    assetRows: 3,
    liabilityRows: 1,
    insuranceRows: 2,
    goalRows: 2
  };

  let currentStepIndex = 0;
  let latestPlan = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function createRow(tableId, seedData) {
    const template = byId(tableTemplateMap[tableId]);
    const target = byId(tableId);
    if (!template || !target) {
      return;
    }

    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector(".dynamic-row");

    if (seedData) {
      row.querySelectorAll("[data-field]").forEach(function (field) {
        const key = field.dataset.field;
        if (Object.prototype.hasOwnProperty.call(seedData, key)) {
          field.value = seedData[key];
        }
      });
    }

    target.appendChild(fragment);
  }

  function ensureInitialRows() {
    Object.keys(tableTemplateMap).forEach(function (tableId) {
      const target = byId(tableId);
      if (!target) {
        return;
      }
      target.innerHTML = "";
      for (let index = 0; index < defaultRowCounts[tableId]; index += 1) {
        createRow(tableId);
      }
    });
  }

  function updateStepUi() {
    const steps = all(".wizard-step");
    const tabs = all(".step-tab");
    steps.forEach(function (step, index) {
      step.classList.toggle("active", index === currentStepIndex);
    });
    tabs.forEach(function (tab, index) {
      tab.classList.toggle("active", index === currentStepIndex);
    });

    byId("stepCounter").textContent = "Step " + (currentStepIndex + 1) + " of " + steps.length;
    byId("progressBarFill").style.width = (((currentStepIndex + 1) / steps.length) * 100) + "%";
    byId("prevStepBtn").disabled = currentStepIndex === 0;
    byId("nextStepBtn").disabled = currentStepIndex === steps.length - 1;
  }

  function goToStep(index) {
    const steps = all(".wizard-step");
    currentStepIndex = Math.max(0, Math.min(index, steps.length - 1));
    updateStepUi();
  }

  function attachUiEvents() {
    document.addEventListener("click", function (event) {
      const addRowButton = event.target.closest(".add-row-btn");
      if (addRowButton) {
        createRow(addRowButton.dataset.table);
      }

      const removeRowButton = event.target.closest("[data-remove-row]");
      if (removeRowButton) {
        const row = removeRowButton.closest(".dynamic-row");
        const container = row && row.parentElement;
        if (container && container.children.length > 1) {
          row.remove();
        }
      }

      const stepTab = event.target.closest(".step-tab");
      if (stepTab) {
        goToStep(Number(stepTab.dataset.stepTarget));
      }
    });

    byId("prevStepBtn").addEventListener("click", function () {
      goToStep(currentStepIndex - 1);
    });

    byId("nextStepBtn").addEventListener("click", function () {
      goToStep(currentStepIndex + 1);
    });

    byId("plannerForm").addEventListener("submit", function (event) {
      event.preventDefault();
      generatePlan();
    });

    byId("generatePlanBtnTop").addEventListener("click", generatePlan);
    byId("loadSampleDataBtn").addEventListener("click", loadSampleData);
    byId("downloadExcelBtn").addEventListener("click", function () {
      if (latestPlan) {
        FinancialPlannerExport.downloadExcel(latestPlan);
      }
    });
    byId("downloadPdfBtn").addEventListener("click", async function () {
      if (!latestPlan) {
        return;
      }

      const pdfButton = byId("downloadPdfBtn");
      pdfButton.disabled = true;
      pdfButton.textContent = "Preparing PDF...";
      try {
        await FinancialPlannerExport.downloadPdf(latestPlan);
      } finally {
        pdfButton.disabled = false;
        pdfButton.textContent = "Download PDF";
      }
    });
  }

  function readRows(tableId) {
    return Array.from(byId(tableId).querySelectorAll(".dynamic-row")).map(function (row) {
      const record = {};
      row.querySelectorAll("[data-field]").forEach(function (field) {
        record[field.dataset.field] = field.value;
      });
      return record;
    }).filter(function (row) {
      return Object.values(row).some(function (value) {
        return String(value || "").trim() !== "";
      });
    });
  }

  function readForm() {
    return {
      householdName: byId("plannerForm").elements.householdName.value,
      planningYear: byId("plannerForm").elements.planningYear.value,
      familyMembers: readRows("familyRows"),
      incomes: readRows("incomeRows"),
      expenses: readRows("expenseRows"),
      assets: readRows("assetRows"),
      liabilities: readRows("liabilityRows"),
      insurances: readRows("insuranceRows"),
      goals: readRows("goalRows"),
      emergencyFundExisting: byId("plannerForm").elements.emergencyFundExisting.value,
      elderlyDependents: byId("plannerForm").elements.elderlyDependents.value,
      section80cCurrent: byId("plannerForm").elements.section80cCurrent.value,
      section80dCurrent: byId("plannerForm").elements.section80dCurrent.value,
      retirementLifestyle: byId("plannerForm").elements.retirementLifestyle.value,
      plannerNotes: byId("plannerForm").elements.plannerNotes.value
    };
  }

  function generatePlan() {
    const data = readForm();
    latestPlan = FinancialPlannerCompute.computePlan(data);
    FinancialPlannerDashboard.renderDashboard(latestPlan);
    byId("downloadExcelBtn").disabled = false;
    byId("downloadPdfBtn").disabled = false;
    byId("dashboardRoot").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function populateTable(tableId, rows) {
    const target = byId(tableId);
    target.innerHTML = "";
    rows.forEach(function (row) {
      createRow(tableId, row);
    });
  }

  function loadSampleData() {
    byId("plannerForm").elements.householdName.value = "Sharma Family";
    byId("plannerForm").elements.planningYear.value = new Date().getFullYear();
    byId("plannerForm").elements.emergencyFundExisting.value = 420000;
    byId("plannerForm").elements.elderlyDependents.value = 1;
    byId("plannerForm").elements.section80cCurrent.value = 120000;
    byId("plannerForm").elements.section80dCurrent.value = 18000;
    byId("plannerForm").elements.retirementLifestyle.value = "comfortable";
    byId("plannerForm").elements.plannerNotes.value = "Assumes annual salary revisions continue and one education goal starts in 2036.";

    populateTable("familyRows", [
      { name: "Amit Sharma", age: 38, relation: "Self", occupation: "Software Engineer", isEarning: "true", isDependent: "false" },
      { name: "Priya Sharma", age: 35, relation: "Spouse", occupation: "Marketing Manager", isEarning: "true", isDependent: "false" },
      { name: "Aarav Sharma", age: 7, relation: "Son", occupation: "Student", isEarning: "false", isDependent: "true" }
    ]);

    populateTable("incomeRows", [
      { member: "Amit Sharma", monthlyIncome: 180000, annualBonus: 250000, growthRate: 8, retirementAge: 60 },
      { member: "Priya Sharma", monthlyIncome: 95000, annualBonus: 100000, growthRate: 7, retirementAge: 58 }
    ]);

    populateTable("expenseRows", [
      { category: "Home & Utilities", monthlyAmount: 52000, expenseType: "essential", inflationRate: 6 },
      { category: "Education", monthlyAmount: 18000, expenseType: "essential", inflationRate: 10 },
      { category: "Lifestyle & Travel", monthlyAmount: 22000, expenseType: "discretionary", inflationRate: 6 },
      { category: "Healthcare", monthlyAmount: 8000, expenseType: "essential", inflationRate: 8 }
    ]);

    populateTable("assetRows", [
      { type: "Savings Account", category: "cash", currentValue: 250000, monthlyContribution: 10000, expectedReturn: 4, liquidity: "High", isRetirementAsset: "false", isPrimaryResidence: "false" },
      { type: "Equity Mutual Fund", category: "equity", currentValue: 1800000, monthlyContribution: 35000, expectedReturn: 12, liquidity: "Medium", isRetirementAsset: "true", isPrimaryResidence: "false" },
      { type: "EPF", category: "debt", currentValue: 1400000, monthlyContribution: 18000, expectedReturn: 8.25, liquidity: "Low", isRetirementAsset: "true", isPrimaryResidence: "false" },
      { type: "Primary Residence", category: "real-estate", currentValue: 6500000, monthlyContribution: 0, expectedReturn: 6, liquidity: "Low", isRetirementAsset: "false", isPrimaryResidence: "true" }
    ]);

    populateTable("liabilityRows", [
      { type: "Home Loan", outstanding: 3200000, interestRate: 8.4, emi: 32500, tenureYears: 14 },
      { type: "Car Loan", outstanding: 420000, interestRate: 9.2, emi: 9800, tenureYears: 3 }
    ]);

    populateTable("insuranceRows", [
      { type: "life", insuredPerson: "Amit Sharma", coverage: 7500000, premium: 28000 },
      { type: "health", insuredPerson: "Family Floater", coverage: 1000000, premium: 22000 },
      { type: "critical-illness", insuredPerson: "Amit Sharma", coverage: 500000, premium: 6000 }
    ]);

    populateTable("goalRows", [
      { name: "Child Education", targetYear: new Date().getFullYear() + 11, currentCost: 2500000, inflationRate: 10, priority: "High" },
      { name: "Retirement Travel Fund", targetYear: new Date().getFullYear() + 20, currentCost: 1200000, inflationRate: 6, priority: "Medium" },
      { name: "Home Renovation", targetYear: new Date().getFullYear() + 4, currentCost: 800000, inflationRate: 6, priority: "Low" }
    ]);

    goToStep(0);
  }

  function initialize() {
    byId("plannerForm").elements.planningYear.value = new Date().getFullYear();
    ensureInitialRows();
    attachUiEvents();
    updateStepUi();
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();

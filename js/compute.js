(function () {
  const DEFAULTS = {
    planningYear: new Date().getFullYear(),
    inflationGeneral: 0.06,
    inflationEducation: 0.1,
    inflationHealthcare: 0.08,
    equityReturn: 0.12,
    debtReturn: 0.07,
    ppfRate: 0.071,
    epfRate: 0.0825,
    npsReturn: 0.1,
    safeWithdrawalRate: 0.04,
    lifeInsuranceMultiplier: 12,
    emergencyFundTargetMonths: 6,
    idealSavingsRate: 30,
    healthyEmiRatio: 40,
    section80cLimit: 150000,
    section80dLimit: 25000,
    section80dParentsLimit: 50000
  };

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function toBoolean(value) {
    return value === true || value === "true" || value === "1" || value === 1;
  }

  function round(value, decimals) {
    const factor = 10 ** (decimals || 2);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function sum(items, selector) {
    return items.reduce(function (total, item) {
      return total + selector(item);
    }, 0);
  }

  function inferGoalInflation(goalName) {
    const label = String(goalName || "").toLowerCase();
    if (label.includes("education")) {
      return DEFAULTS.inflationEducation;
    }
    if (label.includes("health")) {
      return DEFAULTS.inflationHealthcare;
    }
    return DEFAULTS.inflationGeneral;
  }

  function inferGoalReturn(yearsRemaining) {
    if (yearsRemaining >= 10) {
      return DEFAULTS.equityReturn;
    }
    if (yearsRemaining >= 5) {
      return 0.1;
    }
    return DEFAULTS.debtReturn;
  }

  function monthlySipRequired(futureValue, annualReturn, months) {
    if (futureValue <= 0 || months <= 0) {
      return 0;
    }

    const monthlyRate = annualReturn / 12;
    if (monthlyRate <= 0) {
      return futureValue / months;
    }

    const denominator = ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
    return denominator > 0 ? futureValue / denominator : 0;
  }

  function annualizeContribution(monthlyContribution) {
    return toNumber(monthlyContribution, 0) * 12;
  }

  function futureValueOfSip(monthlyContribution, annualReturn, months) {
    if (monthlyContribution <= 0 || months <= 0) {
      return 0;
    }

    const monthlyRate = annualReturn / 12;
    if (monthlyRate <= 0) {
      return monthlyContribution * months;
    }

    return monthlyContribution * (((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate));
  }

  function projectAssetToFuture(asset, years) {
    const annualReturn = toNumber(asset.expectedReturnRate, DEFAULTS.debtReturn);
    const months = Math.max(0, Math.round(years * 12));
    const currentValue = toNumber(asset.currentValue, 0);
    const monthlyContribution = toNumber(asset.monthlyContribution, 0);
    const futureCurrent = currentValue * Math.pow(1 + annualReturn, Math.max(0, years));
    const futureSip = futureValueOfSip(monthlyContribution, annualReturn, months);
    return futureCurrent + futureSip;
  }

  function normalizeFamily(data, assumptions) {
    const members = (data.familyMembers || []).filter(function (member) {
      return Object.values(member || {}).some(function (value) {
        return String(value || "").trim() !== "";
      });
    }).map(function (member, index) {
      return {
        id: "family-" + index,
        name: String(member.name || "Member " + (index + 1)).trim(),
        age: toNumber(member.age, 0),
        relation: String(member.relation || "Family").trim(),
        occupation: String(member.occupation || "Not specified").trim(),
        isEarning: toBoolean(member.isEarning),
        isDependent: toBoolean(member.isDependent)
      };
    });

    if (members.length === 0) {
      assumptions.push("No family members were provided, so the report uses placeholder household assumptions.");
    }

    return members;
  }

  function normalizeIncome(data, assumptions) {
    const incomes = (data.incomes || []).filter(function (income) {
      return Object.values(income || {}).some(function (value) {
        return String(value || "").trim() !== "";
      });
    }).map(function (income, index) {
      const growthRate = toNumber(income.growthRate, 8) / 100;
      const retirementAge = toNumber(income.retirementAge, 60);

      if (income.growthRate === "" || income.growthRate == null) {
        assumptions.push("Income growth for " + (income.member || "an income source") + " was missing, so 8% was assumed.");
      }

      return {
        id: "income-" + index,
        member: String(income.member || "Income Source " + (index + 1)).trim(),
        monthlyIncome: toNumber(income.monthlyIncome, 0),
        annualBonus: toNumber(income.annualBonus, 0),
        growthRate: growthRate,
        retirementAge: retirementAge
      };
    });

    if (incomes.length === 0) {
      assumptions.push("No income details were entered, so all income-dependent calculations will remain conservative.");
    }

    return incomes;
  }

  function normalizeExpenses(data, assumptions) {
    return (data.expenses || []).filter(function (expense) {
      return Object.values(expense || {}).some(function (value) {
        return String(value || "").trim() !== "";
      });
    }).map(function (expense, index) {
      const inflationRate = expense.inflationRate === "" || expense.inflationRate == null
        ? DEFAULTS.inflationGeneral
        : toNumber(expense.inflationRate, 6) / 100;

      if (expense.inflationRate === "" || expense.inflationRate == null) {
        assumptions.push("Expense inflation for " + (expense.category || "an expense") + " was missing, so 6% was assumed.");
      }

      return {
        id: "expense-" + index,
        category: String(expense.category || "Expense " + (index + 1)).trim(),
        monthlyAmount: toNumber(expense.monthlyAmount, 0),
        expenseType: String(expense.expenseType || "essential").toLowerCase(),
        inflationRate: inflationRate
      };
    });
  }

  function normalizeAssets(data, assumptions) {
    return (data.assets || []).filter(function (asset) {
      return Object.values(asset || {}).some(function (value) {
        return String(value || "").trim() !== "";
      });
    }).map(function (asset, index) {
      let expectedReturn = asset.expectedReturn === "" || asset.expectedReturn == null
        ? null
        : toNumber(asset.expectedReturn, 0) / 100;

      const typeLabel = String(asset.type || "").toLowerCase();
      if (expectedReturn == null) {
        if (typeLabel.includes("ppf")) {
          expectedReturn = DEFAULTS.ppfRate;
        } else if (typeLabel.includes("epf")) {
          expectedReturn = DEFAULTS.epfRate;
        } else if (typeLabel.includes("nps")) {
          expectedReturn = DEFAULTS.npsReturn;
        } else if (String(asset.category || "").toLowerCase() === "equity") {
          expectedReturn = DEFAULTS.equityReturn;
        } else {
          expectedReturn = DEFAULTS.debtReturn;
        }
        assumptions.push("Expected return for " + (asset.type || "an asset") + " was missing, so a category-based default was used.");
      }

      return {
        id: "asset-" + index,
        type: String(asset.type || "Asset " + (index + 1)).trim(),
        category: String(asset.category || "other").toLowerCase(),
        currentValue: toNumber(asset.currentValue, 0),
        monthlyContribution: toNumber(asset.monthlyContribution, 0),
        expectedReturnRate: expectedReturn,
        liquidity: String(asset.liquidity || "Medium"),
        isRetirementAsset: toBoolean(asset.isRetirementAsset),
        isPrimaryResidence: toBoolean(asset.isPrimaryResidence)
      };
    });
  }

  function normalizeLiabilities(data) {
    return (data.liabilities || []).filter(function (liability) {
      return Object.values(liability || {}).some(function (value) {
        return String(value || "").trim() !== "";
      });
    }).map(function (liability, index) {
      return {
        id: "liability-" + index,
        type: String(liability.type || "Loan " + (index + 1)).trim(),
        outstanding: toNumber(liability.outstanding, 0),
        interestRate: toNumber(liability.interestRate, 0) / 100,
        emi: toNumber(liability.emi, 0),
        tenureYears: toNumber(liability.tenureYears, 0)
      };
    });
  }

  function normalizeInsurance(data) {
    return (data.insurances || []).filter(function (insurance) {
      return Object.values(insurance || {}).some(function (value) {
        return String(value || "").trim() !== "";
      });
    }).map(function (insurance, index) {
      return {
        id: "insurance-" + index,
        type: String(insurance.type || "life").toLowerCase(),
        insuredPerson: String(insurance.insuredPerson || "Household").trim(),
        coverage: toNumber(insurance.coverage, 0),
        premium: toNumber(insurance.premium, 0)
      };
    });
  }

  function normalizeGoals(data, planningYear, assumptions) {
    return (data.goals || []).filter(function (goal) {
      return Object.values(goal || {}).some(function (value) {
        return String(value || "").trim() !== "";
      });
    }).map(function (goal, index) {
      let targetYear = toNumber(goal.targetYear, planningYear + 5);
      if (targetYear < planningYear) {
        targetYear = planningYear;
        assumptions.push("Goal target year for " + (goal.name || "a goal") + " was earlier than the planning year, so it was aligned to the current year.");
      }

      const inflationRate = goal.inflationRate === "" || goal.inflationRate == null
        ? inferGoalInflation(goal.name)
        : toNumber(goal.inflationRate, 0) / 100;

      if (goal.inflationRate === "" || goal.inflationRate == null) {
        assumptions.push("Goal inflation for " + (goal.name || "a goal") + " was missing, so an India-specific default was used.");
      }

      return {
        id: "goal-" + index,
        name: String(goal.name || "Goal " + (index + 1)).trim(),
        targetYear: targetYear,
        currentCost: toNumber(goal.currentCost, 0),
        inflationRate: inflationRate,
        priority: String(goal.priority || "Medium")
      };
    });
  }

  function computeAllocation(assets, totalAssets) {
    const byCategory = {
      equity: 0,
      debt: 0,
      cash: 0,
      "real-estate": 0,
      gold: 0,
      other: 0
    };

    assets.forEach(function (asset) {
      const key = Object.prototype.hasOwnProperty.call(byCategory, asset.category) ? asset.category : "other";
      byCategory[key] += asset.currentValue;
    });

    const labels = Object.keys(byCategory);
    const series = labels.map(function (label) {
      return totalAssets > 0 ? round((byCategory[label] / totalAssets) * 100, 1) : 0;
    });

    return { byCategory: byCategory, labels: labels, series: series };
  }

  function determineIdealAllocation(age) {
    if (age <= 0) {
      age = 35;
    }
    if (age < 35) {
      return { equity: 60, debt: 20, cash: 10, gold: 5, "real-estate": 5, other: 0 };
    }
    if (age < 45) {
      return { equity: 55, debt: 25, cash: 10, gold: 5, "real-estate": 5, other: 0 };
    }
    if (age < 55) {
      return { equity: 45, debt: 30, cash: 10, gold: 5, "real-estate": 10, other: 0 };
    }
    return { equity: 35, debt: 40, cash: 10, gold: 5, "real-estate": 10, other: 0 };
  }

  function scoreEmergency(monthsCovered) {
    if (monthsCovered >= 6) {
      return 100;
    }
    if (monthsCovered >= 3) {
      return round(50 + ((monthsCovered - 3) / 3) * 50, 1);
    }
    return round((monthsCovered / 3) * 50, 1);
  }

  function scoreSavings(savingsRate) {
    if (savingsRate >= DEFAULTS.idealSavingsRate) {
      return 100;
    }
    if (savingsRate <= 0) {
      return 0;
    }
    return round((savingsRate / DEFAULTS.idealSavingsRate) * 100, 1);
  }

  function scoreInsurance(lifeRatio, healthRatio, ciRatio) {
    return round(
      clamp(lifeRatio, 0, 1) * 50 +
      clamp(healthRatio, 0, 1) * 35 +
      clamp(ciRatio, 0, 1) * 15,
      1
    );
  }

  function scoreGoals(totalGoalSipNeeded, freeCashFlow) {
    if (totalGoalSipNeeded <= 0) {
      return 100;
    }
    if (freeCashFlow <= 0) {
      return 15;
    }
    const ratio = totalGoalSipNeeded / freeCashFlow;
    return round(clamp(140 - ratio * 80, 0, 100), 1);
  }

  function scoreDebt(emiToIncomeRatio, debtToAssetRatio) {
    const emiScore = clamp(100 - (emiToIncomeRatio / DEFAULTS.healthyEmiRatio) * 100, 0, 100);
    const assetScore = clamp(100 - debtToAssetRatio, 0, 100);
    return round(emiScore * 0.65 + assetScore * 0.35, 1);
  }

  function scoreDiversification(current, ideal) {
    const labels = Object.keys(ideal);
    const totalDifference = labels.reduce(function (diff, key) {
      return diff + Math.abs((current.byCategory[key] || 0) - 0);
    }, 0);

    const totalAssets = sum(labels, function (key) {
      return current.byCategory[key] || 0;
    });

    if (totalAssets <= 0) {
      return 0;
    }

    const normalizedDifference = labels.reduce(function (diff, key) {
      const currentPct = ((current.byCategory[key] || 0) / totalAssets) * 100;
      const idealPct = ideal[key] || 0;
      return diff + Math.abs(currentPct - idealPct);
    }, 0);

    return round(clamp(100 - normalizedDifference, 0, 100), 1);
  }

  function makeScoreColor(score) {
    if (score >= 75) {
      return "green";
    }
    if (score >= 50) {
      return "amber";
    }
    return "red";
  }

  function createActionItems(context) {
    const items = [];

    if (context.monthsCovered < 6) {
      items.push({
        urgency: context.monthsCovered < 3 ? "High" : "Medium",
        title: "Strengthen emergency reserves",
        description: "Build emergency savings to at least 6 months of expenses. Current coverage is " + round(context.monthsCovered, 1) + " months."
      });
    }

    if (context.savingsRate < DEFAULTS.idealSavingsRate) {
      items.push({
        urgency: context.savingsRate < 15 ? "High" : "Medium",
        title: "Improve monthly savings rate",
        description: "Increase monthly savings toward 30%+ of income. The current savings rate is " + round(context.savingsRate, 1) + "%."
      });
    }

    if (context.insuranceGap.life > 0 || context.insuranceGap.health > 0) {
      items.push({
        urgency: context.insuranceGap.life > 0 ? "High" : "Medium",
        title: "Close insurance gaps",
        description: "Add life and health cover to reduce uncovered risk. Life gap: Rs " + round(context.insuranceGap.life, 0) + ", Health gap: Rs " + round(context.insuranceGap.health, 0) + "."
      });
    }

    if (context.retirementReadinessScore < 75) {
      items.push({
        urgency: context.retirementReadinessScore < 50 ? "High" : "Medium",
        title: "Increase retirement investing",
        description: "Retirement readiness is " + round(context.retirementReadinessScore, 1) + "%. Increase EPF/PPF/NPS or long-term equity contributions."
      });
    }

    if (context.totalGoalSipNeeded > context.freeCashFlow) {
      items.push({
        urgency: "High",
        title: "Prioritize goal funding",
        description: "Goal SIP demand exceeds free cash flow. Review goal timing, funding sources, or reduce discretionary spending."
      });
    }

    if (context.emiToIncomeRatio > DEFAULTS.healthyEmiRatio) {
      items.push({
        urgency: "High",
        title: "Reduce debt stress",
        description: "EMI to income ratio is " + round(context.emiToIncomeRatio, 1) + "%. Consider prepayment or loan restructuring."
      });
    }

    if (context.diversificationScore < 70) {
      items.push({
        urgency: "Medium",
        title: "Rebalance portfolio allocation",
        description: "Current asset allocation is drifting from the age-appropriate ideal mix. Rebalance future SIPs toward underweight categories."
      });
    }

    if (context.unused80c > 0 || context.unused80d > 0) {
      items.push({
        urgency: "Low",
        title: "Use remaining tax deductions",
        description: "Unutilized deductions remain under 80C and 80D. Redirect surplus toward tax-efficient investments and health cover."
      });
    }

    return items.slice(0, 5);
  }

  function createExecutiveSummary(summaryData) {
    const points = [];
    points.push("Overall financial health is " + round(summaryData.overallScore, 1) + "/100, indicating a " + summaryData.scoreBand + " position.");
    points.push("Monthly income of Rs " + round(summaryData.totalMonthlyIncome, 0) + " supports expenses of Rs " + round(summaryData.totalMonthlyExpenses, 0) + " and EMIs of Rs " + round(summaryData.totalMonthlyEmi, 0) + ".");
    points.push("Net worth stands at Rs " + round(summaryData.netWorth, 0) + ", with liquid assets covering " + round(summaryData.monthsCovered, 1) + " months of expenses.");
    points.push("Retirement readiness is " + round(summaryData.retirementReadinessScore, 1) + "% against a required corpus of Rs " + round(summaryData.retirementCorpusRequired, 0) + ".");

    if (summaryData.goals.length > 0) {
      points.push("Funding all listed goals requires about Rs " + round(summaryData.totalGoalSipNeeded, 0) + " per month in dedicated investments.");
    } else {
      points.push("No financial goals were entered, so the plan is currently focused on protection, liquidity, and retirement readiness.");
    }

    points.push("Insurance adequacy is " + round(summaryData.insuranceAdequacyScore, 1) + "% and debt health is " + round(summaryData.debtHealthScore, 1) + "%.");
    points.push("Tax utilization shows Rs " + round(summaryData.unused80c, 0) + " of 80C room and Rs " + round(summaryData.unused80d, 0) + " of 80D room still available.");

    return points.slice(0, 7);
  }

  function computePlan(rawData) {
    const assumptions = [];
    const planningYear = toNumber(rawData.planningYear, DEFAULTS.planningYear);
    const familyMembers = normalizeFamily(rawData, assumptions);
    const incomes = normalizeIncome(rawData, assumptions);
    const expenses = normalizeExpenses(rawData, assumptions);
    const assets = normalizeAssets(rawData, assumptions);
    const liabilities = normalizeLiabilities(rawData);
    const insurances = normalizeInsurance(rawData);
    const goals = normalizeGoals(rawData, planningYear, assumptions);

    const householdName = String(rawData.householdName || "Household").trim() || "Household";
    if (!rawData.householdName) {
      assumptions.push("Household name was missing, so a generic name was used.");
    }

    const retirementLifestyle = String(rawData.retirementLifestyle || "moderate");
    const lifestyleMultiplier = retirementLifestyle === "aspirational" ? 1.25 : retirementLifestyle === "comfortable" ? 1.1 : 1;
    const emergencyFundExisting = toNumber(rawData.emergencyFundExisting, 0);
    const elderlyDependents = toNumber(rawData.elderlyDependents, 0);
    const section80cCurrent = toNumber(rawData.section80cCurrent, 0);
    const section80dCurrent = toNumber(rawData.section80dCurrent, 0);
    const plannerNotes = String(rawData.plannerNotes || "").trim();

    const totalMonthlyIncome = sum(incomes, function (item) { return item.monthlyIncome; });
    const totalAnnualIncome = totalMonthlyIncome * 12 + sum(incomes, function (item) { return item.annualBonus; });
    const maxMemberIncome = incomes.length > 0 ? Math.max.apply(null, incomes.map(function (item) { return item.monthlyIncome; })) : 0;
    const incomeConcentrationRatio = totalMonthlyIncome > 0 ? maxMemberIncome / totalMonthlyIncome : 0;

    const totalMonthlyExpenses = sum(expenses, function (item) { return item.monthlyAmount; });
    const essentialExpenseTotal = sum(expenses.filter(function (item) { return item.expenseType === "essential"; }), function (item) { return item.monthlyAmount; });
    const discretionaryExpenseTotal = sum(expenses.filter(function (item) { return item.expenseType !== "essential"; }), function (item) { return item.monthlyAmount; });
    const savingsRate = totalMonthlyIncome > 0 ? ((totalMonthlyIncome - totalMonthlyExpenses) / totalMonthlyIncome) * 100 : 0;

    const totalMonthlyEmi = sum(liabilities, function (item) { return item.emi; });
    const totalMonthlySipContributions = sum(assets, function (item) { return item.monthlyContribution; });
    const monthlySurplus = totalMonthlyIncome - totalMonthlyExpenses - totalMonthlyEmi;
    const freeCashFlow = monthlySurplus - totalMonthlySipContributions;

    const totalAssets = sum(assets, function (item) { return item.currentValue; });
    const totalLiabilities = sum(liabilities, function (item) { return item.outstanding; });
    const netWorth = totalAssets - totalLiabilities;
    const liquidNetWorth = sum(assets.filter(function (item) { return item.liquidity === "High"; }), function (item) { return item.currentValue; });
    const investableNetWorth = sum(assets.filter(function (item) { return !item.isPrimaryResidence; }), function (item) { return item.currentValue; });

    const emergencyFundRequired = totalMonthlyExpenses * DEFAULTS.emergencyFundTargetMonths;
    const monthsCovered = totalMonthlyExpenses > 0 ? emergencyFundExisting / totalMonthlyExpenses : 0;
    const emergencyAdequacy = monthsCovered >= 6 ? "green" : monthsCovered >= 3 ? "amber" : "red";

    const ageBase = familyMembers.filter(function (member) { return member.isEarning; }).map(function (member) { return member.age; });
    const averageEarningAge = ageBase.length > 0 ? sum(ageBase, function (age) { return age; }) / ageBase.length : 35;
    const primaryIncome = incomes.slice().sort(function (a, b) { return b.monthlyIncome - a.monthlyIncome; })[0] || { retirementAge: 60, growthRate: 0.08, member: "Primary Earner" };
    const primaryMember = familyMembers.find(function (member) { return member.name.toLowerCase() === String(primaryIncome.member || "").toLowerCase(); });
    const currentAge = primaryMember ? primaryMember.age : averageEarningAge;
    const yearsToRetirement = Math.max(0, toNumber(primaryIncome.retirementAge, 60) - currentAge);

    const annualExpenseAtRetirement = totalMonthlyExpenses * 12 * Math.pow(1 + DEFAULTS.inflationGeneral, yearsToRetirement) * lifestyleMultiplier;
    const retirementCorpusRequired = annualExpenseAtRetirement / DEFAULTS.safeWithdrawalRate;
    const retirementAssets = assets.filter(function (asset) { return asset.isRetirementAsset; });
    const retirementCorpusExisting = sum(retirementAssets, function (asset) {
      return projectAssetToFuture(asset, yearsToRetirement);
    });
    const retirementReadinessScore = retirementCorpusRequired > 0
      ? clamp((retirementCorpusExisting / retirementCorpusRequired) * 100, 0, 100)
      : 0;

    const totalLifeCoverage = sum(insurances.filter(function (item) { return item.type === "life"; }), function (item) { return item.coverage; });
    const totalHealthCoverage = sum(insurances.filter(function (item) { return item.type === "health"; }), function (item) { return item.coverage; });
    const totalCriticalCoverage = sum(insurances.filter(function (item) { return item.type === "critical-illness"; }), function (item) { return item.coverage; });
    const familyCount = Math.max(1, familyMembers.length);
    const lifeInsuranceRequired = totalAnnualIncome * DEFAULTS.lifeInsuranceMultiplier;
    const healthInsuranceRequired = familyCount * 1000000;
    const criticalIllnessRequired = Math.max(500000, familyCount * 300000);
    const insuranceGap = {
      life: Math.max(0, lifeInsuranceRequired - totalLifeCoverage),
      health: Math.max(0, healthInsuranceRequired - totalHealthCoverage),
      critical: Math.max(0, criticalIllnessRequired - totalCriticalCoverage)
    };
    const insuranceAdequacyScore = scoreInsurance(
      lifeInsuranceRequired > 0 ? totalLifeCoverage / lifeInsuranceRequired : 0,
      healthInsuranceRequired > 0 ? totalHealthCoverage / healthInsuranceRequired : 0,
      criticalIllnessRequired > 0 ? totalCriticalCoverage / criticalIllnessRequired : 0
    );

    const emiToIncomeRatio = totalMonthlyIncome > 0 ? (totalMonthlyEmi / totalMonthlyIncome) * 100 : 0;
    const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

    const allocation = computeAllocation(assets, totalAssets);
    const idealAllocation = determineIdealAllocation(currentAge);

    const goalsProjection = goals.map(function (goal) {
      const yearsRemaining = Math.max(0, goal.targetYear - planningYear);
      const futureValue = goal.currentCost * Math.pow(1 + goal.inflationRate, yearsRemaining);
      const annualReturn = inferGoalReturn(yearsRemaining);
      const monthsRemaining = Math.max(1, yearsRemaining * 12);
      const monthlyInvestmentNeeded = monthlySipRequired(futureValue, annualReturn, monthsRemaining);
      return {
        id: goal.id,
        name: goal.name,
        priority: goal.priority,
        currentCost: goal.currentCost,
        inflationRate: goal.inflationRate,
        targetYear: goal.targetYear,
        yearsRemaining: yearsRemaining,
        futureValue: futureValue,
        monthlyInvestmentNeeded: monthlyInvestmentNeeded,
        fundingGap: Math.max(0, monthlyInvestmentNeeded - Math.max(0, freeCashFlow / Math.max(goals.length, 1)))
      };
    });

    const totalGoalSipNeeded = sum(goalsProjection, function (goal) { return goal.monthlyInvestmentNeeded; });
    const emergencyScore = scoreEmergency(monthsCovered);
    const savingsScore = scoreSavings(savingsRate);
    const goalFundingScore = scoreGoals(totalGoalSipNeeded, freeCashFlow);
    const debtHealthScore = scoreDebt(emiToIncomeRatio, debtToAssetRatio);
    const diversificationScore = scoreDiversification(allocation, idealAllocation);

    const weightedScores = {
      emergencyFund: emergencyScore,
      savingsRate: savingsScore,
      insuranceAdequacy: insuranceAdequacyScore,
      retirementReadiness: retirementReadinessScore,
      goalFunding: goalFundingScore,
      debtHealth: debtHealthScore,
      portfolioDiversification: diversificationScore
    };

    const overallFinancialHealthScore =
      emergencyScore * 0.15 +
      savingsScore * 0.15 +
      insuranceAdequacyScore * 0.15 +
      retirementReadinessScore * 0.2 +
      goalFundingScore * 0.15 +
      debtHealthScore * 0.1 +
      diversificationScore * 0.1;

    const projected80cFromAssets = sum(assets.filter(function (asset) {
      const type = asset.type.toLowerCase();
      return type.includes("ppf") || type.includes("epf") || type.includes("elss") || type.includes("nps");
    }), function (asset) {
      return annualizeContribution(asset.monthlyContribution);
    });
    const healthPremiums = sum(insurances.filter(function (item) { return item.type === "health"; }), function (item) { return item.premium; });
    const max80dLimit = elderlyDependents > 0 ? DEFAULTS.section80dLimit + DEFAULTS.section80dParentsLimit : DEFAULTS.section80dLimit;
    const total80cUtilization = clamp(section80cCurrent + projected80cFromAssets, 0, DEFAULTS.section80cLimit);
    const total80dUtilization = clamp(section80dCurrent + healthPremiums, 0, max80dLimit);
    const unused80c = Math.max(0, DEFAULTS.section80cLimit - total80cUtilization);
    const unused80d = Math.max(0, max80dLimit - total80dUtilization);

    const riskDiagnostics = {
      cashFlowResilience: round((emergencyScore + savingsScore) / 2, 1),
      protection: round(insuranceAdequacyScore, 1),
      goalPreparedness: round(goalFundingScore, 1),
      retirement: round(retirementReadinessScore, 1),
      debtManagement: round(debtHealthScore, 1),
      diversification: round(diversificationScore, 1)
    };

    const actionItems = createActionItems({
      monthsCovered: monthsCovered,
      savingsRate: savingsRate,
      insuranceGap: insuranceGap,
      retirementReadinessScore: retirementReadinessScore,
      totalGoalSipNeeded: totalGoalSipNeeded,
      freeCashFlow: freeCashFlow,
      emiToIncomeRatio: emiToIncomeRatio,
      diversificationScore: diversificationScore,
      unused80c: unused80c,
      unused80d: unused80d
    });

    const scoreBand = overallFinancialHealthScore >= 75 ? "strong" : overallFinancialHealthScore >= 50 ? "moderate" : "fragile";
    const goalSuccessProbability = clamp((goalFundingScore * 0.55) + (retirementReadinessScore * 0.15) + (savingsScore * 0.15) + (emergencyScore * 0.15), 0, 100);
    const financialFreedomStatus = overallFinancialHealthScore >= 75
      ? "On track"
      : overallFinancialHealthScore >= 50
        ? "Needs optimization"
        : "Needs attention";

    if (!plannerNotes) {
      assumptions.push("Planner notes were not entered, so the report relies only on structured form inputs.");
    } else {
      assumptions.push("Planner notes included: " + plannerNotes);
    }

    if (assets.length === 0) {
      assumptions.push("No assets were listed, so net worth, liquidity, and retirement projections are understated.");
    }
    if (goals.length === 0) {
      assumptions.push("No goals were entered, so goal funding output is intentionally limited.");
    }
    if (insurances.length === 0) {
      assumptions.push("No insurance details were entered, so coverage adequacy is assumed to be zero.");
    }

    const executiveSummary = createExecutiveSummary({
      overallScore: overallFinancialHealthScore,
      scoreBand: scoreBand,
      totalMonthlyIncome: totalMonthlyIncome,
      totalMonthlyExpenses: totalMonthlyExpenses,
      totalMonthlyEmi: totalMonthlyEmi,
      netWorth: netWorth,
      monthsCovered: monthsCovered,
      retirementReadinessScore: retirementReadinessScore,
      retirementCorpusRequired: retirementCorpusRequired,
      goals: goalsProjection,
      totalGoalSipNeeded: totalGoalSipNeeded,
      insuranceAdequacyScore: insuranceAdequacyScore,
      debtHealthScore: debtHealthScore,
      unused80c: unused80c,
      unused80d: unused80d
    });

    return {
      householdName: householdName,
      planningYear: planningYear,
      generatedOn: new Date().toISOString(),
      rawInput: {
        familyMembers: familyMembers,
        incomes: incomes,
        expenses: expenses,
        assets: assets,
        liabilities: liabilities,
        insurances: insurances,
        goals: goals,
        emergencyFundExisting: emergencyFundExisting,
        elderlyDependents: elderlyDependents,
        section80cCurrent: section80cCurrent,
        section80dCurrent: section80dCurrent,
        retirementLifestyle: retirementLifestyle,
        plannerNotes: plannerNotes
      },
      metrics: {
        totalMonthlyIncome: totalMonthlyIncome,
        totalAnnualIncome: totalAnnualIncome,
        incomeConcentrationRatio: incomeConcentrationRatio,
        totalMonthlyExpenses: totalMonthlyExpenses,
        essentialExpenseTotal: essentialExpenseTotal,
        discretionaryExpenseTotal: discretionaryExpenseTotal,
        savingsRate: savingsRate,
        totalMonthlyEmi: totalMonthlyEmi,
        totalMonthlySipContributions: totalMonthlySipContributions,
        monthlySurplus: monthlySurplus,
        freeCashFlow: freeCashFlow,
        totalAssets: totalAssets,
        totalLiabilities: totalLiabilities,
        netWorth: netWorth,
        liquidNetWorth: liquidNetWorth,
        investableNetWorth: investableNetWorth,
        emergencyFundRequired: emergencyFundRequired,
        emergencyFundExisting: emergencyFundExisting,
        monthsCovered: monthsCovered,
        emergencyAdequacy: emergencyAdequacy,
        annualExpenseAtRetirement: annualExpenseAtRetirement,
        retirementCorpusRequired: retirementCorpusRequired,
        retirementCorpusExisting: retirementCorpusExisting,
        yearsToRetirement: yearsToRetirement,
        retirementReadinessScore: retirementReadinessScore,
        lifeInsuranceRequired: lifeInsuranceRequired,
        healthInsuranceRequired: healthInsuranceRequired,
        criticalIllnessRequired: criticalIllnessRequired,
        totalLifeCoverage: totalLifeCoverage,
        totalHealthCoverage: totalHealthCoverage,
        totalCriticalCoverage: totalCriticalCoverage,
        insuranceGap: insuranceGap,
        insuranceAdequacyScore: insuranceAdequacyScore,
        emiToIncomeRatio: emiToIncomeRatio,
        debtToAssetRatio: debtToAssetRatio,
        totalGoalSipNeeded: totalGoalSipNeeded,
        emergencyScore: emergencyScore,
        savingsScore: savingsScore,
        goalFundingScore: goalFundingScore,
        debtHealthScore: debtHealthScore,
        diversificationScore: diversificationScore,
        overallFinancialHealthScore: overallFinancialHealthScore,
        total80cUtilization: total80cUtilization,
        total80dUtilization: total80dUtilization,
        unused80c: unused80c,
        unused80d: unused80d,
        goalSuccessProbability: goalSuccessProbability,
        financialFreedomStatus: financialFreedomStatus,
        scoreBand: scoreBand
      },
      charts: {
        incomeSplit: incomes.map(function (income) {
          return { label: income.member, value: income.monthlyIncome };
        }),
        surplusBreakdown: [
          { label: "Income", value: totalMonthlyIncome },
          { label: "Expenses", value: totalMonthlyExpenses },
          { label: "EMI", value: totalMonthlyEmi },
          { label: "SIP", value: totalMonthlySipContributions },
          { label: "Free Cash Flow", value: freeCashFlow }
        ],
        netWorth: [
          { label: "Assets", value: totalAssets },
          { label: "Liabilities", value: totalLiabilities }
        ],
        currentAllocation: allocation,
        idealAllocation: idealAllocation,
        riskDiagnostics: riskDiagnostics,
        taxEfficiency: {
          labels: ["80C Utilized", "80C Available", "80D Utilized", "80D Available"],
          values: [total80cUtilization, unused80c, total80dUtilization, unused80d]
        }
      },
      tables: {
        goals: goalsProjection,
        insurance: [
          {
            type: "Life",
            required: lifeInsuranceRequired,
            existing: totalLifeCoverage,
            gap: insuranceGap.life,
            adequacy: lifeInsuranceRequired > 0 ? round((totalLifeCoverage / lifeInsuranceRequired) * 100, 1) : 0
          },
          {
            type: "Health",
            required: healthInsuranceRequired,
            existing: totalHealthCoverage,
            gap: insuranceGap.health,
            adequacy: healthInsuranceRequired > 0 ? round((totalHealthCoverage / healthInsuranceRequired) * 100, 1) : 0
          },
          {
            type: "Critical Illness",
            required: criticalIllnessRequired,
            existing: totalCriticalCoverage,
            gap: insuranceGap.critical,
            adequacy: criticalIllnessRequired > 0 ? round((totalCriticalCoverage / criticalIllnessRequired) * 100, 1) : 0
          }
        ],
        liabilities: liabilities
      },
      scores: weightedScores,
      actionItems: actionItems,
      executiveSummary: executiveSummary,
      assumptions: Array.from(new Set(assumptions)),
      palette: {
        brand: "#1a237e",
        green: "#4caf50",
        amber: "#ff9800",
        red: "#f44336"
      },
      helpers: {
        scoreColor: makeScoreColor(overallFinancialHealthScore)
      }
    };
  }

  window.FinancialPlannerCompute = {
    DEFAULTS: DEFAULTS,
    computePlan: computePlan
  };
})();

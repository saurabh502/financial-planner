---
name: indian-financial-planner
description: >
  Generates a comprehensive, advisor-grade Indian household financial plan from user-provided data
  (Excel upload, structured text, or conversational input). Produces an HTML dashboard with
  interactive visuals AND a downloadable Excel workbook. Use this skill whenever the user:
  - uploads a financial plan Excel template (even partially filled)
  - provides income, expenses, assets, liabilities, goals, or insurance data for financial planning
  - asks to "create a financial plan", "analyze my finances", "build a financial plan", or
    "generate a financial report"
  - mentions SIP, EPFO, NPS, PPF, home loan, retirement corpus, or education/marriage goals
  - asks to update or regenerate a financial plan with new data
  Always use this skill — even for partial data — and clearly note what's missing.
---

# Indian Financial Planner Skill

## Overview

This skill ingests household financial data (from Excel uploads or user-provided text) and produces:

1. **HTML Dashboard** — Interactive, advisor-grade visual report with scoring, charts, and recommendations
2. **Excel Workbook** — Downloadable `.xlsx` with all computed outputs, formulas, and goal projections

---

## Step 1: Parse Input Data

Read the uploaded Excel (or user-provided text) across these sheets:

| Sheet | Key Fields |
|---|---|
| Family Profile | names, ages, relations, occupation, earning/dependent flags |
| Income Details | monthly income, bonuses, growth rate, retirement age |
| Expenses | categories, monthly amounts, essential vs discretionary, inflation % |
| Assets & Investments | type, current value, monthly contribution, expected return % |
| Liabilities | loan type, outstanding, interest rate, EMI, tenure |
| Insurance | type, coverage, premium |
| Financial Goals | goal name, target year, current cost, inflation %, priority |
| Emergency & Dependency | emergency fund amount, months covered, elderly dependent |

Use `openpyxl` to read the file. Handle formula strings (e.g., `=C2*12`) by computing them manually from available cell values.

---

## Step 2: Compute All Outputs

Run the full computation engine (see `scripts/compute_engine.py`) to generate every metric. Key formulas:

### Income
- `total_monthly_income` = sum of all member monthly incomes
- `total_annual_income` = monthly × 12 + all bonuses
- `income_concentration_ratio` = max_member_income / total_monthly_income

### Expenses
- Resolve formula cells: if monthly is null but annual is given, divide by 12 (and vice versa)
- `total_monthly_expenses` = sum all resolved monthly amounts
- `savings_rate` = (total_monthly_income - total_monthly_expenses) / total_monthly_income × 100
- `essential_expense_total` = sum of essential-flagged expenses
- `discretionary_expense_total` = sum of discretionary-flagged expenses

### Cash Flow
- `monthly_surplus` = total_monthly_income - total_monthly_expenses - total_monthly_emi
- `free_cash_flow` = monthly_surplus - total_monthly_sip_contributions

### Net Worth
- `total_assets` = sum of all current asset values
- `total_liabilities` = sum of all outstanding loans
- `net_worth` = total_assets - total_liabilities
- `liquid_net_worth` = assets with liquidity=High
- `investable_net_worth` = assets excludng primary residence

### Emergency Fund
- `emergency_fund_required` = total_monthly_expenses × 6
- `months_covered` = emergency_fund_existing / total_monthly_expenses
- Adequacy flag: green if ≥6 months, yellow 3–6, red <3

### Goal Planning (Future Value)
For each goal: `FV = current_cost × (1 + inflation)^years_remaining`
- `monthly_investment_needed` = FV / [((1+r)^n - 1)/r × (1+r)] where r = monthly return rate, n = months

### Retirement
- Retirement corpus required = annual_expense_at_retirement / safe_withdrawal_rate (4%)
- `years_to_retirement` = retirement_age - current_age
- `retirement_corpus_existing` = sum of locked retirement assets projected to retirement
- `retirement_readiness_score` = min(100, existing_projected / required × 100)

### Insurance Adequacy
- Life insurance required = 10-15× annual income
- Health insurance required = ₹10L+ per member (₹5L minimum)
- `insurance_adequacy_score`: compare existing vs required

### Liability Health
- `emi_to_income_ratio` = total_emi / total_monthly_income × 100 (healthy: <40%)
- `debt_to_asset_ratio` = total_liabilities / total_assets × 100

### Scoring (0–100)
| Component | Weight |
|---|---|
| Emergency Fund | 15% |
| Savings Rate | 15% |
| Insurance Adequacy | 15% |
| Retirement Readiness | 20% |
| Goal Funding | 15% |
| Debt Health | 10% |
| Portfolio Diversification | 10% |

`overall_financial_health_score` = weighted sum of component scores

---

## Step 3: Generate HTML Dashboard

Create a single-file HTML with:

### Header / Hero
- Household name, date, overall financial health score (large gauge/donut)
- Color: green (75+), amber (50–74), red (<50)

### Section Cards
1. **Income & Cash Flow** — income split pie, monthly surplus bar, savings rate
2. **Net Worth Snapshot** — assets vs liabilities stacked bar, liquid/investable breakdown
3. **Asset Allocation** — current vs ideal allocation donut charts
4. **Goal Tracker** — table with FV, monthly SIP needed, funding gap per goal
5. **Retirement Readiness** — progress bar, corpus required vs existing, readiness score
6. **Insurance Adequacy** — life/health/critical illness gap table
7. **Emergency Fund** — gauge showing months covered
8. **Liability Health** — EMI-to-income ratio, loan summary table
9. **Tax Efficiency** — 80C/80D utilization, savings potential
10. **Risk Diagnostics** — spider/radar chart across 6 risk dimensions
11. **Priority Action Items** — top 5 recommendations with urgency flags
12. **Executive Summary** — financial freedom status, probability of goal success

### Styling
- Professional color scheme: `#1a237e` (deep blue), `#f5f5f5` (bg), `#4caf50` (green), `#ff9800` (amber), `#f44336` (red)
- Use Chart.js from CDN for all charts
- Print-friendly CSS with page breaks between major sections
- Responsive grid layout

---

## Step 4: Generate Excel Workbook

Create a well-formatted `.xlsx` with these sheets:

1. **Dashboard** — Summary KPIs with conditional formatting
2. **Inputs Echo** — Family, Income, Expenses (cleaned/resolved)
3. **Cash Flow Analysis** — Monthly breakdown
4. **Net Worth** — Asset/liability detail
5. **Goal Projections** — FV calculations with formulas
6. **Retirement Plan** — Corpus calculation, projection table
7. **Insurance Analysis** — Gap analysis
8. **Recommendations** — Action items with priority

Use `openpyxl` with:
- Header rows in deep blue (#1a237e) with white text
- Alternating row colors
- Currency cells formatted as `₹#,##0`
- Percentage cells formatted as `0.0%`
- Conditional color formatting for scores/ratios

---

## Step 5: Output to User

1. Save HTML to `/mnt/user-data/outputs/financial_plan_<name>.html`
2. Save Excel to `/mnt/user-data/outputs/financial_plan_<name>.xlsx`
3. Call `present_files` with both files
4. Write a brief executive summary in the chat (5–8 bullet points of most critical findings)

---

## Data Quality Handling

- If a cell has an Excel formula string (e.g., `=C2*12`), compute it from available data
- If a required field is missing, use sensible defaults (note them in the report)
- If income/expense amounts seem in annual terms when monthly expected (or vice versa), flag and normalize
- Never fail silently — surface all assumptions in the report's "Assumptions" section

---

## India-Specific Defaults

| Parameter | Default |
|---|---|
| Inflation (general) | 6% |
| Inflation (education) | 10% |
| Inflation (healthcare) | 8% |
| Equity expected return | 12% |
| Debt expected return | 7% |
| PPF rate | 7.1% |
| EPF rate | 8.25% |
| NPS expected return | 10% |
| Safe withdrawal rate | 4% |
| Life insurance multiplier | 12× annual income |
| Emergency fund target | 6 months expenses |
| Ideal savings rate | 30%+ |
| Healthy EMI-to-income | <40% |
| Section 80C limit | ₹1,50,000 |
| Section 80D limit | ₹25,000 (self) + ₹50,000 (parents senior) |

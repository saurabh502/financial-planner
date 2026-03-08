---
title: Indian Financial Planner
emoji: 📈
colorFrom: blue
colorTo: green
sdk: static
pinned: false
---

# Indian Financial Planner

A browser-based Indian household financial planning tool built with plain HTML, CSS, and JavaScript.

## Features

- Multi-step household financial input wizard
- Dynamic financial planning dashboard with Chart.js visuals
- Goal projections, retirement readiness, insurance gap analysis, tax diagnostics, and action items
- Excel download via SheetJS
- PDF download via jsPDF and html2canvas
- Static hosting friendly: works on GitHub Pages and Hugging Face Spaces

## Run Locally

Open `index.html` in a modern browser.

## Deploy on GitHub Pages

1. Create a new public GitHub repository.
2. Upload all files in this project, including `css/`, `js/`, `README.md`, and `.nojekyll`.
3. In GitHub, open `Settings -> Pages`.
4. Set the source to `Deploy from a branch`.
5. Select the `main` branch and the `/ (root)` folder.
6. Save. GitHub will publish the app at `https://<username>.github.io/<repo-name>/`.

## Deploy on Hugging Face Spaces

1. Create a new Space.
2. Choose `Static` as the SDK.
3. Upload the full project contents.
4. Hugging Face will use this `README.md` frontmatter and serve `index.html` automatically.

## Project Files

- `index.html` - app shell and dashboard layout
- `css/style.css` - styling and print rules
- `js/compute.js` - financial planning formulas and scoring
- `js/dashboard.js` - dashboard rendering and charts
- `js/export.js` - Excel and PDF downloads
- `js/app.js` - form wizard, row management, sample data, and orchestration

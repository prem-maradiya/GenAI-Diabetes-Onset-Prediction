# Rebuilding the deck and report

These scripts produced `reports/Diabetes_Onset_Prediction_Final_Jury_Deck.pptx` and
`reports/Diabetes_Onset_Prediction_Final_Report.docx` from `reports/metrics.json`, the figures and the
dashboard screenshots.

1. `python app/app.py`, then `python reports/build/shots.py reports/screenshots <temp-profile-dir>` (headless Edge).
2. In a folder with `npm install pptxgenjs@3.12.0 docx@9.0.2`, create `assets/` with the screenshot crops and a
   `dims.json` of image sizes, then run `node build_deck.js <project> <out.pptx>` and
   `node build_report.js <project> <out.docx>`.
3. `python reports/build/strip_dirs.py <out.pptx>` and `python reports/build/fix_docx.py <out.docx>` remove ZIP
   folder entries and an orphan font table so the files open cleanly from Google Drive / OneDrive.

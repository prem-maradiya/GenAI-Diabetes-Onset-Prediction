# Diabetes Onset Prediction — a recall-first screener with a generative AI layer

**Generative AI · Final Jury · Model Making**
Pima Indians Diabetes Database (UCI / NIDDK) · Python · scikit-learn · SDV (CTGAN / TVAE) · SHAP · Gemini

---

## The one-paragraph version

Type-2 diabetes develops silently, so the value of a screening model lies in finding the person who
does not yet know. The two possible errors are deeply unequal: a **false negative** sends a patient who
will develop diabetes out of the screening funnel for years, while a **false positive** costs one
confirmatory blood test. This project optimises for **recall**: it repairs 652 measurements the source
data had silently corrupted into zeros, cross-validates seven models on identical folds, and tunes the
decision threshold on out-of-fold probabilities. On a held-out test set recall rises from
**74.1% to 90.7% [95% CI 82.4–98.0]**, cutting missed diabetic patients from **14 to 5 of 54**.

Two **generative AI layers** sit on top:

1. **Synthetic patients** — CTGAN (a GAN), TVAE (a variational autoencoder) and a Gaussian Copula are
   benchmarked against SMOTE and no augmentation, with every generator fitted inside each training fold.
2. **LLM explanations** — exact TreeSHAP values and clinical reference bands are turned by Gemini into a
   plain-language summary for the patient, with a clinician-review disclaimer appended on every response.

---

## Results

| | Threshold 0.50 | Recall-first 0.28 | 95% CI at 0.28 |
|---|---|---|---|
| **Recall** | 0.741 | **0.907** | 0.824 – 0.980 |
| Precision | 0.606 | 0.527 | 0.423 – 0.625 |
| F1 | 0.667 | 0.667 | 0.571 – 0.747 |
| F2 | 0.709 | **0.793** | 0.712 – 0.859 |
| Specificity | 0.740 | 0.560 | 0.455 – 0.653 |
| ROC-AUC | 0.820 | 0.820 | 0.746 – 0.882 |
| Brier score | 0.167 | 0.167 | 0.138 – 0.199 |
| **Missed cases** | **14** | **5** | |

Confusion matrix at 0.28 (154 test patients): TN 56 · FP 44 · **FN 5** · TP 49.
Calibration slope 1.07 (isotonic recalibration barely changes the Brier score). Decision-curve net
benefit at the cost-model threshold (pt = 1/6): **0.259** for the model vs 0.218 for testing everyone.

### Generative layer 1 — does synthetic data help?

| Variant (same forest, same folds) | Recall at its recall-first cut-off | PR-AUC | Discriminator AUC |
|---|---|---|---|
| None — class weights (**deployed**) | **0.916** | 0.704 | — |
| SMOTE | 0.916 | 0.708 | 0.75 |
| Gaussian Copula | 0.911 | 0.692 | 0.82 |
| TVAE | 0.902 | 0.694 | 0.86 |
| None — unweighted | 0.902 | 0.711 | — |
| CTGAN | 0.878 | 0.677 | 0.93 |

**No generator beat class weighting.** With about 170 diabetic patients per fold a GAN cannot learn the
joint distribution; its samples are easy to spot (discriminator AUC 0.93) and pile up on the variable
bounds. SMOTE's rows sit closest to real patients (a privacy consideration). The threshold, not the data
generator, was the lever — so the deployed model trains on real patients only.

### External validity for India

Recall carries over under a prevalence shift; precision does not. At the ICMR-INDIAB prevalence of 11.4%,
precision at the 0.28 threshold falls to about **21%**, below the 0.50 guard. The threshold must be
re-tuned on an Indian cohort; the dashboard and `src/rigour.py` give the re-validation protocol, and any
same-schema CSV placed in `data/external/` is scored with the frozen pipeline automatically.

---

## Quick start

```bash
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

python src/pipeline.py          # full rebuild: model, metrics, 24 figures  (~6 min, CTGAN/TVAE included)
python src/pipeline.py --fast   # reuse the cached CTGAN/TVAE comparison    (~2 min)
python app/app.py               # dashboard at http://127.0.0.1:5000
python -m pytest -q             # 17 regression tests
```

**LLM explanations (optional).** Copy `.env.example` to `.env` and add `GEMINI_API_KEY=...` (a Gemini API key from Google AI Studio; set `GOOGLE_GENAI_USE_VERTEXAI=true` to route it via Vertex AI instead).
Without a key — or without a network in the jury room — the dashboard uses a deterministic template built
from the same SHAP values, and says so on screen.

Regenerate and execute the notebook:

```bash
python src/make_notebook.py
python -m nbconvert --to notebook --execute --inplace notebooks/diabetes_onset_prediction.ipynb
```

---

## Deliverables

| Requirement | Where it is |
|---|---|
| **Notebook** | `notebooks/diabetes_onset_prediction.ipynb` — all steps plus the generative layer, executed |
| **Feature-importance chart** | figure 13 (permutation), 14 (consensus), 23 (SHAP) |
| **Recall-focused evaluation** | figures 08–10, 17, 20 (bootstrap CIs), 21 (calibration), 22 (decision curve) |
| **Generative component** | `src/synthetic.py` (figures 18–19), `src/genai_explain.py` (Live Predictor) |
| Trained model | `models/diabetes_model.joblib` — fitted pipeline **and** its tuned threshold |
| Ethics artefact | `models/model_card.json` (v2: generative components, India limitation) |
| Every number quoted anywhere | `reports/metrics.json` |
| Interactive presentation | the Flask dashboard (press **P** for presentation mode) |
| Jury deck and report | `reports/` |

---

## Project structure

```
├── data/
│   ├── raw/pima_diabetes.csv          auto-downloaded and cached
│   ├── processed/pima_imputed.csv
│   └── external/                      drop a same-schema CSV here for external validation
├── src/
│   ├── config.py                      paths, features, cost constants, clinical reference bands
│   ├── data_loader.py                 Step 1 — load + inspect
│   ├── preprocess.py                  Step 2 — impossible zeros, missingness audit, imputers
│   ├── train.py                       Step 3 — model zoo, CV, selection rule, threshold tuning
│   ├── evaluate.py                    Step 3 — recall-first metrics, curves, cost, impact
│   ├── rigour.py                      bootstrap CIs, calibration, decision curve, India transport
│   ├── synthetic.py                   GenAI 1 — CTGAN / TVAE / Copula vs SMOTE, fidelity audit
│   ├── genai_explain.py               GenAI 2 — TreeSHAP -> prompt -> Gemini -> safe summary
│   ├── explain.py                     Step 4 — permutation / impurity / odds-ratio views
│   ├── plots.py, plots_genai.py       all 24 figures in one design system
│   ├── pipeline.py                    end-to-end runner — writes every artefact
│   └── make_notebook.py               generates the notebook deliverable
├── app/                               Flask API + dashboard (templates, static css/js/data)
├── tests/test_project.py              regression tests for every claim made to the jury
├── notebooks/  models/  reports/
```

---

## The dashboard

Eight views: Overview (with a *Jury 2 feedback → where it is answered* table), Data & Cleaning,
Model & Evaluation, Threshold Lab, Explainability (SHAP beeswarm), Generative AI, Live Predictor, and
Impact, Ethics & India. Light and dark themes; **P** toggles a projector-friendly presentation mode,
**←/→** move between sections.

The **Live Predictor** scores a patient with the deployed forest, shows the exact SHAP waterfall, colours
each input by its clinical band (WHO / ADA, Asian-Indian BMI cut-offs), re-scores *what-if* scenarios
for the modifiable factors, and — on **Explain with AI** — asks the LLM for a patient-friendly summary,
showing the exact prompt it received.

### API

| Endpoint | Purpose |
|---|---|
| `GET /api/results` | every number the pipeline produced |
| `GET /api/model-card` | the ethics artefact |
| `GET /api/patient/random` | a real held-out patient, with the ground truth |
| `POST /api/predict` | score one patient + exact TreeSHAP contributions; inputs validated and clamped |
| `POST /api/explain` | the generative layer: SHAP → LLM → summary + disclaimer + provenance |
| `GET /api/llm-status` | whether an LLM key is configured (never reveals it) |
| `GET /health` | readiness probe |

---

## Reproducibility

`random_state = 42` throughout — split, models, CV folds, SMOTE, CTGAN/TVAE (torch seed), bootstrap and
PCA. `python src/pipeline.py` reproduces every figure and number in this README.

## Honest limitations

This is **not** deployable in a clinic. The cohort is 768 women of a single ancestry aged 21+; there is
no external validation set; the test set holds 54 positive cases (hence the intervals); the threshold is
calibrated to 34.9% prevalence; and the LLM can be fluent and wrong — it sees only computed numbers, may
not diagnose or prescribe, and every summary carries a clinician-review disclaimer. What *is*
transferable is the process: the domain-rule audit, the leak-free pipeline, the recall-first threshold
with a stated cost model, measured (not asserted) generative components, and the model card.

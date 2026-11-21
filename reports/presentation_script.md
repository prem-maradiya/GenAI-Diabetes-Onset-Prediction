# Presentation script — 4 speakers, 10 minutes

**Diabetes Onset Prediction — a recall-first screening model**

Timed at ~7 minutes of speech + ~2.5 minutes of live demo, leaving slack for
transitions. Don't add material — if you're running long, the demo is what suffers,
and the demo is your strongest asset.

| Speaker | Slides | Speaking | Owns these questions |
|---|---|---|---|
| Member 1 | 1–2 | 1:40 | Problem framing, why recall, the cost model |
| Member 2 | 3–5 | 2:00 | Data cleaning, leakage, model selection |
| Member 3 | 6–8 | 1:55 | Threshold tuning, results, feature importance |
| Member 4 | 9–12 | 1:40 + demo | Ethics, limitations, deployment, syllabus |

Every member must be able to answer on their own section. Appendix slides 13–15 hold
prepared answers — all four of you read all of them, not just your own.

Numbers in **bold** must be said exactly right. Text in *(brackets)* is an action, not
something you say.

---

## MEMBER 1 — The problem and the objective (1:40)

### Slide 1 — Title (0:20)

> Good morning. We built a screening model that predicts diabetes onset from eight
> routine clinical measurements.
>
> The interesting part isn't the model. It's that we deliberately made it **worse at
> being right overall**, so it would be **better at not missing sick people**. That
> decision drove everything else.

### Slide 2 — Accuracy is the wrong objective (1:20)

> Here's the problem with the obvious approach.
>
> **34.9%** of patients in this dataset are diabetic. So a model that just says "nobody
> has diabetes" scores **65.1% accuracy** — and catches **zero patients**. It's
> worthless.
>
> Accuracy does that because it treats both mistakes as one unit of wrongness. In
> screening they're nothing alike.
>
> *(point at the left column)*
>
> A **false negative** tells a patient who will develop diabetes that they're fine. They
> leave the programme, nothing prompts a second look, and the harm compounds silently
> for years — by diagnosis, the damage can be permanent. They never find out we were
> wrong about them.
>
> A **false positive** means one confirmatory blood test. Anxiety and a needle. Real,
> but recoverable.
>
> So we wrote that asymmetry down as a number: a missed case costs **five times** a
> false alarm. That constant sits in our config file, not buried in a notebook cell — if
> you disagree with the weighting, you change one number and everything re-derives.
>
> Our target is **recall**, with precision held above **0.50** so the follow-up clinic
> doesn't drown.

**Handoff:** "[Name] will show you what we found when we actually looked at the data."

---

## MEMBER 2 — The data and the method (2:00)

### Slide 3 — 652 impossible zeros (0:55)

> The dataset lies about itself.
>
> Run `df.isnull().sum()` and it reports **zero** missing values. It actually has
> **652**, written as zeros.
>
> *(point at the table)*
>
> A living patient cannot have zero plasma glucose. Zero diastolic pressure means no
> circulation. A skin fold cannot be zero millimetres. These aren't measurements —
> they're blanks someone filled with a zero. Insulin is the worst: **374** patients,
> nearly half the dataset.
>
> One detail, because it's where most people get this wrong. We did **not** blanket-
> replace every zero. **Pregnancies** is excluded — zero pregnancies is a valid, common
> value, and replacing those would have destroyed real information for **111 patients**.
> The rule is applied per column, on medical grounds.
>
> We also didn't delete the affected rows — that would have thrown away **48.7%** of
> our data. We repaired them with a median fill.

### Slide 4 — The pipeline, and not leaking (0:40)

> Here's how that repair happens without cheating.
>
> Everything that *learns* from the data — the imputer, the scaler, SMOTE — lives inside
> one scikit-learn Pipeline. So when we cross-validate, each is refitted from scratch on
> every training fold. The data we're testing on never influences how its own gaps get
> filled.
>
> The zero-to-NaN rule sits outside the pipeline deliberately: it's a fixed medical rule
> that learns no parameter, so it's safe everywhere.
>
> And we never imputed using the outcome column. Grouping medians by whether the patient
> was diabetic leaks the answer into the features — you get beautiful validation scores
> and a model that collapses in production.

### Slide 5 — Choosing the model (0:25)

> We trained **seven** models on identical folds, and selected on **F2**, which weights
> recall four times more than precision.
>
> We wrote the selection rule down *before* touching the test set — because on 614 rows
> a 0.002 F2 difference is noise, and picking the raw maximum would have let the random
> seed choose our model. Anything within 0.01 counts as tied; ties break on recall, then
> interpretability. Random Forest won.

**Handoff:** "Model locked. [Name] has the change that mattered most."

---

## MEMBER 3 — The threshold and the results (1:55)

### Slide 6 — The threshold is the lever (0:55)

> This is the most important slide we have.
>
> Every classifier flags a case above **0.50** probability. That's a convention from
> balanced problems. **Nobody chose it for medicine.**
>
> So we tuned it — swept every cut-off on out-of-fold probabilities from the training
> set, never the test set, and took the one maximising recall with precision above 0.50.
> That's **0.28**.
>
> *(point at both panels)*
>
> Same model both sides. Same patients. Only the cut-off moved.
>
> At the default: recall **74.1%**, and we miss **14** of our 54 diabetic patients.
> At 0.28: recall **90.7%**, and we miss **5**.
>
> **Nine more people caught, for eighteen extra blood tests.**
>
> Accuracy *falls* — **74.0%** to **68.2%**. That's not a regression, it's the trade,
> made deliberately. ROC-AUC doesn't move at all: **0.820** both sides, because the
> model never changed. Only our decision about it did.

### Slide 7 — Held-out results (0:30)

> These are the confusion matrices on **154** patients the model never saw — during
> training, selection, or tuning. We scored it **once**, after everything was locked.
>
> *(point at the bottom-left cell of each)*
>
> That cell is the one that matters: patients who have diabetes and were told they
> don't. **Fourteen** on the left. **Five** on the right.

### Slide 8 — What drives risk (0:30)

> We then asked what the model actually uses, with three methods that could have
> disagreed — permutation importance on recall, tree impurity, and logistic
> coefficients.
>
> All three give the same top three: **Glucose, BMI, Age.**
>
> Glucose dominating is reassuring, not surprising — it's nearly a direct measurement of
> the condition. A model that *didn't* put it first would be the alarming result. One
> standard deviation of glucose multiplies the odds by **3.27**; BMI by **2.03**.
>
> BMI is the clinically interesting one — it's the driver a patient can change.

**Handoff:** "[Name] will close on what this costs in people, and where it shouldn't be used."

---

## MEMBER 4 — Ethics, limits, and the demo (1:40 + demo)

### Slide 9 — The trade in people (0:30)

> Percentages are easy to nod along to, so we restated everything as people.
>
> Per **10,000** screened: at the default we miss **909** diabetic patients. At our
> threshold, **325**.
>
> That's **584 people** who'd have been told they were healthy, and now aren't. It costs
> **1,169** extra blood tests. We think that's defensible — and the point is we state it
> in people, rather than hide it inside an accuracy score.

### Slide 10 — We would not deploy this (0:45)

> We want to be straight about the limits, because being able to say this is part of the
> work.
>
> **No, we would not put this in a clinic.**
>
> Every patient here is female, of Pima heritage, over 21 — applying it to men or
> children is extrapolation, not prediction. Our test set has **54** positive cases, so
> every number carries a wide confidence interval. There's no external validation
> cohort. And the threshold is calibrated to **34.9%** prevalence — in a general
> population, precision would collapse and it would need re-tuning.
>
> What *is* transferable is the process: the domain audit, the leak-free pipeline, the
> recall-first threshold with a stated cost model, and the model card we ship beside the
> weights.

### Slide 11 — Syllabus mapping (0:20)

> Briefly — this is classical ML, deliberately. With 768 rows and 8 tabular features a
> deep network has nothing to learn representations from; knowing when *not* to reach
> for it is the point.
>
> On generative versus discriminative, we benchmarked it rather than described it.
> **Gaussian Naive Bayes** is in our model zoo — genuinely generative, modelling P(x
> given y) and inverting it with Bayes' rule — measured against discriminative models.
> **SMOTE** synthesises new minority patients. And our PCA projection is an explicit
> latent-space view.

### Slide 12 + LIVE DEMO (0:05 speaking, then demo)

> It's all live, so let us show you rather than tell you.
>
> *(switch to the dashboard — Threshold Lab tab)*
>
> **Threshold Lab.** *(drag the slider slowly)* This is the whole project in one
> control. The model is fixed — as I drag the cut-off, watch recall, the confusion
> matrix and the cost per 10,000 move together. Push it up, we miss more people. Pull it
> down, we flag more healthy ones. No setting is free. There's only the choice, and we
> made ours explicitly.
>
> *(click Live Predictor, then "Load a real held-out patient")*
>
> **Live Predictor.** This pulls a real patient from our 20% test split and scores them
> against the actual saved model through the API. The true outcome shows next to the
> prediction — so you can see whether we got this one right. And this is the per-feature
> explanation for this specific patient.
>
> That's our project. Thank you — happy to take questions.

---

## Before you walk in

- **Start the dashboard beforehand** and leave it open on the Threshold Lab tab. Do not
  start it live in front of the panel.
  ```
  .venv311/Scripts/python.exe app/app.py
  ```
  Then open http://127.0.0.1:5000
- **Have the notebook open in a second tab** in case they ask to see code.
- **All four read appendix slides 13–15**, not just your own section.
- If the demo fails: every chart is also a static figure in `reports/figures/` and in
  the report. Say "we have that as a figure" and keep moving. Do not debug in front of
  the panel.

## The two questions you will almost certainly get

**1. "Why focus on recall?"** — Member 1. The two errors have completely different
costs; accuracy weighs them identically; at 34.9% prevalence a do-nothing model scores
65.1%. We bought recall in three places — class weights, F2 selection, and the
threshold. We stopped at precision 0.50 rather than pushing recall to 1.0, because
flagging everyone destroys the follow-up clinic.

**2. "How did you handle the impossible zeros?"** — Member 2. Detect, mask, impute.
652 zeros across five columns, found by medical plausibility, not statistics.
Pregnancies deliberately excluded. Median fill *inside* the pipeline so it refits per
fold. Never imputed using the outcome. Never dropped rows.

## If you're asked something nobody prepared

Say so, then give the honest shape of an answer: *"We didn't test that specifically.
What we can say is…"* A panel respects a clean "we didn't measure that" far more than a
confident guess — and this project's whole argument is about being honest with numbers.

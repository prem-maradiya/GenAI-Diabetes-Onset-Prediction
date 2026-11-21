"""Capture dashboard screenshots with headless Edge. Usage: python shots.py <out_dir> <profile_dir>"""
import subprocess
import sys
from pathlib import Path

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
out = Path(sys.argv[1])
profile = sys.argv[2]
out.mkdir(parents=True, exist_ok=True)

SHOTS = [
    ("01_overview", "?theme=light#overview", 1700, 6000),
    ("02_data_cleaning", "?theme=light#data", 2050, 6000),
    ("03_model_evaluation", "?theme=light#performance", 2350, 6000),
    ("04_threshold_lab", "?theme=light#lab", 1500, 6000),
    ("05_explainability", "?theme=light#importance", 1950, 6000),
    ("06_generative_ai", "?theme=light#genai", 2650, 6000),
    ("07_predictor_median", "?theme=light#predictor", 1650, 6000),
    ("08_predictor_ai_explained", "?demo=highrisk&explain=1&theme=light#predictor", 2100, 15000),
    ("09_impact_india", "?theme=light#impact", 1900, 6000),
    ("10_dark_theme", "?theme=dark#overview", 900, 6000),
]

for name, url, height, budget in SHOTS:
    target = out / f"{name}.png"
    subprocess.run(
        [EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
         f"--user-data-dir={profile}", f"--window-size=1440,{height}",
         f"--virtual-time-budget={budget}", f"--screenshot={target}",
         f"http://127.0.0.1:5000/{url}"],
        capture_output=True, timeout=120,
    )
    print(name, target.stat().st_size if target.exists() else "MISSING")

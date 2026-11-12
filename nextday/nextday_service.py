"""
Integration layer for next_day_model.py (keep both files in the same folder).

Use it 3 ways:
  1) As a function:  from nextday_service import get_predictions
  2) As a JSON file: python nextday_service.py   -> writes predictions.json (good for cron)
  3) As an API:      uvicorn nextday_service:app --port 8000
                     GET /predictions            (cached)
                     GET /predictions?refresh=1  (force recompute)

Install: pip install fastapi uvicorn yfinance lightgbm pandas numpy
"""
import json
import os
import time
from pathlib import Path

import lightgbm as lgb

import next_day_model as m

CACHE_FILE = Path(os.environ.get("NEXTDAY_OUT", "predictions.json"))
CACHE_TTL = 6 * 3600  # seconds


def compute(top_k: int = m.TOP_K) -> dict:
    """Train on all history and rank every ticker for the next trading day."""
    data = m.download()
    panel = m.build_panel(data)

    labeled = panel.dropna(subset=m.FEATURES + ["next_ret"]).copy()
    labeled["y"] = (labeled["next_ret"] >= m.THRESH).astype(int)
    model = lgb.LGBMClassifier(**m.PARAMS).fit(labeled[m.FEATURES], labeled["y"])

    last = panel["date"].max()
    today = panel[panel["date"] == last].dropna(subset=m.FEATURES).copy()
    today["p"] = model.predict_proba(today[m.FEATURES])[:, 1]
    today = today.sort_values("p", ascending=False).reset_index(drop=True)

    rows = []
    for rank, r in today.iterrows():
        rows.append({
            "rank": rank + 1,
            "ticker": r["ticker"],
            "probability": round(float(r["p"]), 4),
            "today_return": round(float(r["r1"]), 4),
            "volume_rel": round(float(r["vol_rel"]), 2),
            "rsi": round(float(r["rsi"]), 1),
            "is_top_pick": rank < top_k,
        })

    return {
        "as_of": f"{last:%Y-%m-%d}",
        "generated_at": int(time.time()),
        "target": f"next-day return >= {m.THRESH:.0%}",
        "top_k": top_k,
        "predictions": rows,
        "disclaimer": "Statistical ranking, not financial advice. Validate with paper trading.",
    }


def get_predictions(refresh: bool = False) -> dict:
    """Cached wrapper: recomputes only if cache is missing/old or refresh=True."""
    if not refresh and CACHE_FILE.exists():
        cached = json.loads(CACHE_FILE.read_text())
        if time.time() - cached.get("generated_at", 0) < CACHE_TTL:
            return cached
    result = compute()
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(result, indent=2))
    return result


# ---- optional FastAPI app (only built if fastapi is installed) ----
try:
    from fastapi import FastAPI

    app = FastAPI(title="Next-Day Model")

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/predictions")
    def predictions(refresh: bool = False):
        return get_predictions(refresh=refresh)

except ImportError:
    app = None


if __name__ == "__main__":
    out = get_predictions(refresh=True)
    print(f"Saved {CACHE_FILE} (as of {out['as_of']})")
    for p in out["predictions"][: out["top_k"]]:
        print(f"{p['rank']}. {p['ticker']:6s} {p['probability']:.1%}")

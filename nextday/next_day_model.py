"""
Next-day winner ranking model.
Install:  pip install yfinance lightgbm pandas numpy
Run:      python next_day_model.py
"""
import time

import numpy as np
import pandas as pd
import yfinance as yf
import lightgbm as lgb

TICKERS = ["ASML", "SNDK", "MU", "CAT", "AXON", "MSFT", "AMD", "WDC", "TSM", "UNH",
           "AVGO", "JPM", "TSLA", "GOOGL", "LRCX", "AMZN", "VRT", "MRVL", "NVDA",
           "PLTR", "MRNA", "XOM", "GLW", "SPCX", "WMT", "ALT", "BE", "STX", "EXPE"]
BENCH = ["SPY", "SMH", "^VIX"]

THRESH = 0.03      # label: next-day return >= +3%
TOP_K = 5          # how many picks per day
RETRAIN_EVERY = 60 # days between retrains in walk-forward
MIN_TRAIN = 500    # min rows before first test


def download():
    raw = None
    last_err = None
    for attempt in range(1, 4):  # 3 attempts: yfinance sometimes gets rate-limited
        try:
            raw = yf.download(TICKERS + BENCH, period="5y", auto_adjust=True,
                              group_by="ticker", progress=False)
            if raw is not None and len(raw) > 0:
                break
            last_err = RuntimeError("yfinance returned an empty frame")
        except Exception as e:
            last_err = e
        print(f"download attempt {attempt}/3 failed: {last_err}")
        if attempt < 3:
            time.sleep(15)
    if raw is None or len(raw) == 0:
        raise RuntimeError(f"download failed after 3 attempts: {last_err}")
    data = {}
    for t in TICKERS + BENCH:
        try:
            df = raw[t].dropna(how="all")
            if len(df) > 300:
                data[t] = df
        except KeyError:
            print(f"skip {t}: no data")
    return data


def rsi(close, n=14):
    d = close.diff()
    up = d.clip(lower=0).rolling(n).mean()
    dn = (-d.clip(upper=0)).rolling(n).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def market_features(data):
    spy, smh, vix = data["SPY"]["Close"], data["SMH"]["Close"], data["^VIX"]["Close"]
    m = pd.DataFrame(index=spy.index)
    m["spy_r1"] = spy.pct_change()
    m["spy_r5"] = spy.pct_change(5)
    m["smh_r1"] = smh.pct_change()
    m["smh_r5"] = smh.pct_change(5)
    m["vix"] = vix
    m["vix_chg"] = vix.pct_change()
    return m


def stock_features(df, mkt):
    c, h, l, o, v = df["Close"], df["High"], df["Low"], df["Open"], df["Volume"]
    f = pd.DataFrame(index=df.index)
    f["r1"] = c.pct_change()
    f["r5"] = c.pct_change(5)
    f["r20"] = c.pct_change(20)
    f["gap"] = o / c.shift() - 1
    f["vol_rel"] = v / v.rolling(20).mean()
    f["rsi"] = rsi(c)
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    f["atr_pct"] = tr.rolling(14).mean() / c
    f["dist_h20"] = c / h.rolling(20).max() - 1
    f["dist_h50"] = c / h.rolling(50).max() - 1
    f["close_pos"] = (c - l) / (h - l).replace(0, np.nan)   # where it closed in the day's range
    f = f.join(mkt)
    f["rs_smh5"] = f["r5"] - f["smh_r5"]
    f["rs_spy5"] = f["r5"] - f["spy_r5"]
    # label: next-day return (never used as a feature)
    f["next_ret"] = c.pct_change().shift(-1)
    return f


def build_panel(data):
    mkt = market_features(data)
    frames = []
    for t in TICKERS:
        if t in data:
            f = stock_features(data[t], mkt)
            f["ticker"] = t
            frames.append(f)
    panel = pd.concat(frames)
    panel.index.name = "date"
    panel = panel.reset_index()
    # cross-sectional ranks per day (how strong vs the other stocks today)
    for col in ["r1", "r5", "vol_rel"]:
        panel[f"{col}_rank"] = panel.groupby("date")[col].rank(pct=True)
    return panel


FEATURES = ["r1", "r5", "r20", "gap", "vol_rel", "rsi", "atr_pct", "dist_h20", "dist_h50",
            "close_pos", "spy_r1", "spy_r5", "smh_r1", "smh_r5", "vix", "vix_chg",
            "rs_smh5", "rs_spy5", "r1_rank", "r5_rank", "vol_rel_rank"]

PARAMS = dict(objective="binary", learning_rate=0.03, n_estimators=300, num_leaves=15,
              min_child_samples=50, subsample=0.8, subsample_freq=1,
              colsample_bytree=0.8, reg_lambda=5.0, verbose=-1)


def walk_forward(panel):
    labeled = panel.dropna(subset=FEATURES + ["next_ret"]).copy()
    labeled["y"] = (labeled["next_ret"] >= THRESH).astype(int)
    dates = np.sort(labeled["date"].unique())
    preds = []
    i = MIN_TRAIN
    while i < len(dates):
        train_dates = dates[:i - 1]  # 1-day gap so no label leaks into training
        test_dates = dates[i:i + RETRAIN_EVERY]
        tr = labeled[labeled["date"].isin(train_dates)]
        te = labeled[labeled["date"].isin(test_dates)].copy()
        model = lgb.LGBMClassifier(**PARAMS).fit(tr[FEATURES], tr["y"])
        te["p"] = model.predict_proba(te[FEATURES])[:, 1]
        preds.append(te)
        i += RETRAIN_EVERY
    return pd.concat(preds)


def evaluate(oos):
    base_rate = oos["y"].mean()
    picks = (oos.sort_values(["date", "p"], ascending=[True, False])
                .groupby("date").head(TOP_K))
    prec = picks["y"].mean()
    print("\n=== WALK-FORWARD RESULTS (out-of-sample) ===")
    print(f"Days tested:            {oos['date'].nunique()}")
    print(f"Base rate (any stock >= {THRESH:.0%}): {base_rate:.1%}")
    print(f"Top-{TOP_K} precision:        {prec:.1%}   (lift x{prec / base_rate:.2f})")
    print(f"Avg next-day return, top-{TOP_K}: {picks['next_ret'].mean():+.2%}")
    print(f"Avg next-day return, all:   {oos['next_ret'].mean():+.2%}")
    print("Note: ignores fees/slippage. Lift near 1.0 = no edge.")


def predict_tomorrow(panel):
    labeled = panel.dropna(subset=FEATURES + ["next_ret"]).copy()
    labeled["y"] = (labeled["next_ret"] >= THRESH).astype(int)
    model = lgb.LGBMClassifier(**PARAMS).fit(labeled[FEATURES], labeled["y"])
    last = panel["date"].max()
    today = panel[(panel["date"] == last)].dropna(subset=FEATURES).copy()
    today["p"] = model.predict_proba(today[FEATURES])[:, 1]
    top = today.sort_values("p", ascending=False).head(TOP_K)
    print(f"\n=== TOP {TOP_K} FOR NEXT TRADING DAY (data as of {last:%Y-%m-%d}) ===")
    for _, r in top.iterrows():
        print(f"{r['ticker']:6s} prob>={THRESH:.0%}: {r['p']:.1%}   today: {r['r1']:+.2%}")
    imp = pd.Series(model.feature_importances_, FEATURES).sort_values(ascending=False)
    print("\nTop features:", ", ".join(imp.head(6).index))


if __name__ == "__main__":
    data = download()
    panel = build_panel(data)
    oos = walk_forward(panel)
    evaluate(oos)
    predict_tomorrow(panel)

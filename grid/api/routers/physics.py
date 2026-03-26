"""
GRID API — Market physics endpoints.

Provides REST API access to physics verification, conventions, and transforms:
  GET  /api/v1/physics/verify           — Run full verification suite
  GET  /api/v1/physics/momentum         — News sentiment momentum analysis
  GET  /api/v1/physics/conventions      — List all financial conventions
  GET  /api/v1/physics/conventions/{domain} — Get convention for a domain
  GET  /api/v1/physics/ou/{feature}     — Estimate OU parameters for a feature
  GET  /api/v1/physics/hurst/{feature}  — Compute Hurst exponent for a feature
  GET  /api/v1/physics/energy/{feature} — Compute energy decomposition for a feature
  GET  /api/v1/physics/news-energy      — News energy decomposition from Crucix/GDELT
  GET  /api/v1/physics/dashboard        — Comprehensive physics dashboard
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger as log

from api.auth import require_auth

router = APIRouter(
    prefix="/api/v1/physics",
    tags=["physics"],
    dependencies=[Depends(require_auth)],
)


@router.get("/verify")
async def verify(as_of: str | None = Query(default=None)) -> dict[str, Any]:
    """Run full market physics verification suite."""
    from db import get_engine
    from physics.verify import MarketPhysicsVerifier
    from store.pit import PITStore

    try:
        as_of_date = date.fromisoformat(as_of) if as_of else date.today()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format '{as_of}'. Use ISO format: YYYY-MM-DD",
        )

    try:
        engine = get_engine()
        pit = PITStore(engine)
        verifier = MarketPhysicsVerifier(engine, pit)
        results = verifier.verify_all(as_of_date)
        return results
    except Exception as exc:
        log.error("Physics verification endpoint failed: {e}", e=str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Verification failed: {str(exc)}",
        )


@router.get("/momentum")
async def momentum(
    as_of: str | None = Query(default=None),
    lookback_days: int = Query(default=90, ge=7, le=365),
) -> dict[str, Any]:
    """Analyze news sentiment momentum using GDELT data.

    Returns sentiment trend, momentum direction, kinetic energy state,
    and optional cross-correlation with price features.
    Gracefully degrades if GDELT data is not yet available.
    """
    from db import get_engine
    from physics.momentum import NewsMomentumAnalyzer
    from store.pit import PITStore

    try:
        as_of_date = date.fromisoformat(as_of) if as_of else date.today()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format '{as_of}'. Use ISO format: YYYY-MM-DD",
        )

    try:
        engine = get_engine()
        pit = PITStore(engine)
        analyzer = NewsMomentumAnalyzer(engine, pit)
        result = analyzer.analyze(as_of_date, lookback_days=lookback_days)
        return result.to_dict()
    except Exception as exc:
        log.error("News momentum endpoint failed: {e}", e=str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Momentum analysis failed: {str(exc)}",
        )


@router.get("/conventions")
async def list_conventions() -> dict[str, Any]:
    """List all financial conventions."""
    from physics.conventions import list_conventions

    return {"conventions": list_conventions()}


@router.get("/conventions/{domain}")
async def get_convention(domain: str) -> dict[str, Any]:
    """Get convention for a specific domain."""
    from physics.conventions import get_convention as _get

    conv = _get(domain)
    if conv is None:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not found")

    return {
        "domain": conv.domain,
        "unit": conv.unit,
        "annualized": conv.annualized,
        "day_count": conv.day_count,
        "method": conv.method,
        "trading_days": conv.trading_days,
        "frequency": conv.frequency,
        "notes": conv.notes,
    }


@router.get("/ou/{feature}")
async def ou_parameters(
    feature: str,
    window: int = Query(default=252, ge=30, le=2520),
) -> dict[str, Any]:
    """Estimate Ornstein-Uhlenbeck parameters for a feature.

    Returns theta (mean-reversion speed), mu (equilibrium), sigma (noise),
    and half-life in trading days.
    """
    from db import get_engine
    from features.lab import FeatureLab
    from physics.transforms import estimate_ou_parameters
    from store.pit import PITStore

    engine = get_engine()
    pit = PITStore(engine)
    lab = FeatureLab(engine, pit)

    series = lab._get_pit_series(feature, date.today(), lookback_days=window * 2)
    if series is None or len(series) < 30:
        raise HTTPException(
            status_code=404,
            detail=f"Insufficient data for feature '{feature}'",
        )

    params = estimate_ou_parameters(series)
    params["feature"] = feature
    params["window"] = window
    params["data_points"] = len(series)
    return params


@router.get("/hurst/{feature}")
async def hurst(
    feature: str,
    max_lag: int = Query(default=100, ge=10, le=500),
) -> dict[str, Any]:
    """Compute Hurst exponent for a feature.

    H < 0.5: mean-reverting, H = 0.5: random walk, H > 0.5: trending.
    """
    from db import get_engine
    from features.lab import FeatureLab
    from physics.transforms import hurst_exponent
    from store.pit import PITStore

    engine = get_engine()
    pit = PITStore(engine)
    lab = FeatureLab(engine, pit)

    series = lab._get_pit_series(feature, date.today(), lookback_days=504)
    if series is None or len(series) < 50:
        raise HTTPException(
            status_code=404,
            detail=f"Insufficient data for feature '{feature}'",
        )

    h = hurst_exponent(series, max_lag)
    interpretation = "random walk"
    if h < 0.45:
        interpretation = "mean-reverting"
    elif h > 0.55:
        interpretation = "trending/persistent"

    return {
        "feature": feature,
        "hurst_exponent": round(float(h), 4) if not (h != h) else None,
        "interpretation": interpretation,
        "data_points": len(series),
    }


@router.get("/energy/{feature}")
async def energy_decomposition(
    feature: str,
    short_window: int = Query(default=21),
    long_window: int = Query(default=252),
) -> dict[str, Any]:
    """Compute kinetic/potential/total energy decomposition for a feature."""
    from db import get_engine
    from features.lab import FeatureLab
    from physics.transforms import kinetic_energy, potential_energy, total_energy
    from store.pit import PITStore

    engine = get_engine()
    pit = PITStore(engine)
    lab = FeatureLab(engine, pit)

    series = lab._get_pit_series(feature, date.today(), lookback_days=long_window * 2)
    if series is None or len(series) < long_window:
        raise HTTPException(
            status_code=404,
            detail=f"Insufficient data for feature '{feature}'",
        )

    ke = kinetic_energy(series, short_window)
    pe = potential_energy(series, long_window)
    te = total_energy(series, short_window, long_window)

    # Return latest values
    ke_val = ke.dropna().iloc[-1] if not ke.dropna().empty else None
    pe_val = pe.dropna().iloc[-1] if not pe.dropna().empty else None
    te_val = te.dropna().iloc[-1] if not te.dropna().empty else None

    return {
        "feature": feature,
        "kinetic_energy": round(float(ke_val), 6) if ke_val is not None else None,
        "potential_energy": round(float(pe_val), 6) if pe_val is not None else None,
        "total_energy": round(float(te_val), 6) if te_val is not None else None,
        "short_window": short_window,
        "long_window": long_window,
    }


@router.get("/news-energy")
async def news_energy(
    lookback_days: int = Query(default=30, ge=7, le=365),
    as_of: str | None = Query(default=None),
) -> dict[str, Any]:
    """Compute news energy decomposition from Crucix/GDELT data streams.

    Decomposes all available news sources into kinetic energy (rate of
    change), potential energy (deviation from baseline), and total energy.
    Detects regime shifts via energy conservation violations and builds
    a force vector showing which sources are injecting the most energy.

    Parameters:
        lookback_days: Days of history to analyze (default 30).
        as_of: Decision date in ISO format (default today).
    """
    from db import get_engine
    from physics.news_energy import NewsEnergyEngine
    from store.pit import PITStore

    as_of_date = date.fromisoformat(as_of) if as_of else date.today()

    engine = get_engine()
    pit = PITStore(engine)
    nee = NewsEnergyEngine(engine, pit)

    result = nee.analyze(lookback_days=lookback_days, as_of_date=as_of_date)
    return result


@router.get("/dashboard")
async def physics_dashboard(
    as_of: str | None = Query(default=None),
) -> dict[str, Any]:
    """Comprehensive physics dashboard for the frontend.

    Returns in a single call:
    1. Market energy state (KE, PE, total) for key assets
    2. News energy decomposition from Crucix/GDELT sources
    3. Hurst exponents for key features
    4. OU mean-reversion estimates for key features
    5. Energy conservation check (equilibrium vs transitioning)
    6. Plain-English summary of current conditions

    Parameters:
        as_of: Decision date in ISO format (default today).
    """
    from db import get_engine
    from features.lab import FeatureLab
    from physics.news_energy import NewsEnergyEngine
    from physics.transforms import (
        estimate_ou_parameters,
        hurst_exponent,
        kinetic_energy,
        potential_energy,
        total_energy,
    )
    from store.pit import PITStore

    as_of_date = date.fromisoformat(as_of) if as_of else date.today()

    engine = get_engine()
    pit = PITStore(engine)
    lab = FeatureLab(engine, pit)

    # Key market features to profile
    key_features = ["sp500", "vix", "us_treasury_10y", "us_treasury_2y", "dxy_index"]

    # 1. Market energy state
    market_energy: dict[str, Any] = {}
    for feat_name in key_features:
        series = lab._get_pit_series(feat_name, as_of_date, lookback_days=600)
        if series is None or len(series) < 30:
            market_energy[feat_name] = {
                "kinetic_energy": None,
                "potential_energy": None,
                "total_energy": None,
                "status": "insufficient_data",
            }
            continue

        ke = kinetic_energy(series, window=21)
        pe = potential_energy(series, window=252)

        ke_val = float(ke.dropna().iloc[-1]) if not ke.dropna().empty else None
        pe_val = float(pe.dropna().iloc[-1]) if not pe.dropna().empty else None
        te_val = (ke_val or 0) + (pe_val or 0) if ke_val is not None or pe_val is not None else None

        market_energy[feat_name] = {
            "kinetic_energy": round(ke_val, 6) if ke_val is not None else None,
            "potential_energy": round(pe_val, 6) if pe_val is not None else None,
            "total_energy": round(te_val, 6) if te_val is not None else None,
            "status": "ok",
        }

    # 2. News energy decomposition
    nee = NewsEnergyEngine(engine, pit)
    news_result = nee.analyze(lookback_days=30, as_of_date=as_of_date)

    # 3. Hurst exponents
    hurst_results: dict[str, Any] = {}
    for feat_name in key_features:
        series = lab._get_pit_series(feat_name, as_of_date, lookback_days=600)
        if series is None or len(series) < 50:
            hurst_results[feat_name] = {"hurst": None, "interpretation": "insufficient_data"}
            continue

        h = hurst_exponent(series, max_lag=100)
        if h != h:  # NaN check
            hurst_results[feat_name] = {"hurst": None, "interpretation": "computation_failed"}
        else:
            interp = "random walk"
            if h < 0.45:
                interp = "mean-reverting"
            elif h > 0.55:
                interp = "trending"
            hurst_results[feat_name] = {
                "hurst": round(float(h), 4),
                "interpretation": interp,
            }

    # 4. OU mean-reversion estimates
    ou_results: dict[str, Any] = {}
    for feat_name in key_features:
        series = lab._get_pit_series(feat_name, as_of_date, lookback_days=600)
        if series is None or len(series) < 50:
            ou_results[feat_name] = {"theta": None, "mu": None, "half_life_days": None}
            continue

        params = estimate_ou_parameters(series)
        ou_results[feat_name] = {
            "theta": params.get("theta"),
            "mu": params.get("mu"),
            "sigma": params.get("sigma"),
            "half_life_days": params.get("half_life_days"),
            "mean_reverting": params.get("mean_reverting", False),
        }

    # 5. Energy conservation check
    total_market_e = sum(
        v["total_energy"] for v in market_energy.values()
        if v.get("total_energy") is not None
    )
    news_regime = news_result.get("regime_signal", {})
    conservation = {
        "total_market_energy": round(total_market_e, 6),
        "total_news_energy": news_result.get("total_news_energy", 0.0),
        "regime_signal": news_regime,
    }

    # Determine equilibrium state from regime violations
    n_violations = news_regime.get("violations", 0)
    is_equilibrium = news_regime.get("equilibrium", True)
    if n_violations > 2:
        eq_state = "transitioning"
    elif not is_equilibrium:
        eq_state = "stressed"
    else:
        eq_state = "equilibrium"
    conservation["state"] = eq_state

    # 6. Plain-English summary
    summary_parts = []

    # Market energy summary
    high_energy_assets = [
        k for k, v in market_energy.items()
        if v.get("total_energy") is not None and v["total_energy"] > 0.5
    ]
    if high_energy_assets:
        summary_parts.append(
            f"High energy detected in {', '.join(high_energy_assets)} — "
            "these assets are moving significantly or far from equilibrium."
        )
    else:
        summary_parts.append("Market energy is within normal bounds across key assets.")

    # Trending/reverting summary
    trending = [k for k, v in hurst_results.items() if v.get("interpretation") == "trending"]
    reverting = [k for k, v in hurst_results.items() if v.get("interpretation") == "mean-reverting"]
    if trending:
        summary_parts.append(f"Trending behavior in: {', '.join(trending)}.")
    if reverting:
        summary_parts.append(f"Mean-reverting behavior in: {', '.join(reverting)}.")

    # News energy summary
    n_news_sources = news_result.get("n_news_sources", 0)
    if n_news_sources > 0:
        summary_parts.append(news_result.get("summary", ""))
    else:
        summary_parts.append("No news data available for energy analysis.")

    # Equilibrium state
    summary_parts.append(f"Overall market state: {eq_state}.")

    return {
        "as_of_date": as_of_date.isoformat(),
        "market_energy": market_energy,
        "news_energy": {
            "n_sources": n_news_sources,
            "total_news_energy": news_result.get("total_news_energy", 0.0),
            "coherence": news_result.get("coherence", {}),
            "force_vector": news_result.get("force_vector", []),
            "energy_by_source": news_result.get("energy_by_source", []),
            "regime_signal": news_regime,
        },
        "hurst_exponents": hurst_results,
        "ou_parameters": ou_results,
        "energy_conservation": conservation,
        "summary": " ".join(summary_parts),
    }


@router.get("/energy-trajectory")
async def energy_trajectory(
    days: int = Query(default=90, ge=14, le=730),
    feature: str = Query(default="sp500", description="Feature to compute energy for"),
    as_of: str | None = Query(default=None),
) -> dict[str, Any]:
    """Return time series of kinetic/potential/total energy for ParticleSystem viz.

    Computes daily energy decomposition for a feature and joins regime state
    from decision_journal for coloring.
    """
    from db import get_engine
    from features.lab import FeatureLab
    from physics.transforms import kinetic_energy as ke_fn, potential_energy as pe_fn
    from store.pit import PITStore

    try:
        as_of_date = date.fromisoformat(as_of) if as_of else date.today()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid date format '{as_of}'. Use ISO format: YYYY-MM-DD",
        )

    engine = get_engine()
    pit = PITStore(engine)
    lab = FeatureLab(engine, pit)

    # Need extra lookback for rolling windows (252 for PE)
    series = lab._get_pit_series(feature, as_of_date, lookback_days=days + 300)
    if series is None or len(series) < 50:
        return {"trajectory": []}

    # Compute KE and PE
    ke = ke_fn(series, window=21)
    pe = pe_fn(series, window=252)

    # Trim to requested date range
    from datetime import timedelta

    cutoff = as_of_date - timedelta(days=days)
    ke = ke.loc[ke.index >= str(cutoff)] if not ke.empty else ke
    pe = pe.loc[pe.index >= str(cutoff)] if not pe.empty else pe

    # Align on common dates
    common = ke.dropna().index.intersection(pe.dropna().index)
    if len(common) == 0:
        return {"trajectory": []}

    ke = ke.loc[common]
    pe = pe.loc[common]

    # Compute momentum (rolling 21-day slope of the feature)
    import numpy as np

    momentum_series = series.pct_change(periods=21).reindex(common).fillna(0)

    # Get regime history from decision_journal
    regime_map: dict[str, str] = {}
    with engine.connect() as conn:
        from sqlalchemy import text as sa_text

        regime_rows = conn.execute(
            sa_text(
                "SELECT DATE(decision_timestamp) AS dt, inferred_state "
                "FROM decision_journal "
                "WHERE decision_timestamp >= NOW() - make_interval(days => :days) "
                "ORDER BY decision_timestamp"
            ),
            {"days": days + 30},
        ).fetchall()
    for row in regime_rows:
        regime_map[str(row[0])] = row[1]

    sorted_regime_dates = sorted(regime_map.keys())

    # Build trajectory
    trajectory = []
    for idx_date in common:
        dt_str = str(idx_date.date()) if hasattr(idx_date, "date") else str(idx_date)
        ke_val = float(ke.loc[idx_date])
        pe_val = float(pe.loc[idx_date])

        if ke_val != ke_val:
            ke_val = 0.0
        if pe_val != pe_val:
            pe_val = 0.0

        # Find regime for this date
        regime = "NEUTRAL"
        if dt_str in regime_map:
            regime = regime_map[dt_str]
        else:
            for rd in reversed(sorted_regime_dates):
                if rd <= dt_str:
                    regime = regime_map[rd]
                    break

        mom_val = float(momentum_series.loc[idx_date]) if idx_date in momentum_series.index else 0.0
        if mom_val != mom_val:
            mom_val = 0.0

        trajectory.append({
            "date": dt_str,
            "kinetic_energy": round(ke_val, 6),
            "potential_energy": round(pe_val, 6),
            "total_energy": round(ke_val + pe_val, 6),
            "momentum": round(mom_val, 6),
            "regime": regime,
        })

    log.info(
        "Energy trajectory: {n} points for {f}",
        n=len(trajectory),
        f=feature,
    )
    return {"trajectory": trajectory}

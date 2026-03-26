import React, { useEffect, useState } from 'react';
import api from '../api.js';
import TickerSelector from '../components/TickerSelector.jsx';
import { tokens } from '../styles/tokens.js';

const styles = {
    container: { padding: tokens.spacing.lg },
    header: {
        fontSize: '12px', fontWeight: 600, color: tokens.textMuted,
        letterSpacing: '3px', textTransform: 'uppercase',
        marginBottom: tokens.spacing.md, fontFamily: tokens.fontMono,
    },
    summary: {
        display: 'flex', gap: tokens.spacing.lg, marginBottom: tokens.spacing.lg,
        fontFamily: tokens.fontMono, fontSize: '12px',
    },
    summaryItem: {
        display: 'flex', flexDirection: 'column', gap: tokens.spacing.xs,
    },
    summaryLabel: { fontSize: '9px', color: tokens.textMuted, letterSpacing: '1px', textTransform: 'uppercase' },
    summaryValue: { fontSize: '18px', fontWeight: 700, color: tokens.textBright },
    card: {
        background: tokens.card, border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md, padding: tokens.spacing.lg,
        marginBottom: tokens.spacing.sm,
    },
    cardHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: tokens.spacing.sm,
    },
    ticker: {
        fontSize: '14px', fontWeight: 700, color: tokens.accent,
        fontFamily: tokens.fontMono, letterSpacing: '1px',
    },
    direction: {
        fontSize: '11px', fontWeight: 600, fontFamily: tokens.fontMono,
        padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
        borderRadius: tokens.radius.sm, marginLeft: tokens.spacing.sm,
    },
    score: {
        fontSize: '12px', fontWeight: 700, fontFamily: tokens.fontMono,
        padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
        borderRadius: tokens.radius.sm,
    },
    scoreBarContainer: {
        height: '4px', background: tokens.bgSecondary,
        borderRadius: '2px', marginTop: tokens.spacing.xs,
        marginBottom: tokens.spacing.sm,
    },
    scoreBar: {
        height: '100%', borderRadius: '2px',
    },
    thesis: {
        fontSize: '11px', lineHeight: '1.6', color: tokens.text,
        fontFamily: tokens.fontMono,
    },
    dealerContext: {
        fontSize: '10px', lineHeight: '1.5', color: tokens.textMuted,
        fontFamily: tokens.fontMono, marginTop: tokens.spacing.sm,
        padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
        background: tokens.bgSecondary,
        borderRadius: tokens.radius.sm,
        borderLeft: `2px solid ${tokens.accent}`,
    },
    meta: {
        display: 'flex', gap: tokens.spacing.md, marginTop: tokens.spacing.sm,
        fontSize: '10px', color: tokens.textMuted, fontFamily: tokens.fontMono,
        flexWrap: 'wrap',
    },
    metaItem: {
        display: 'flex', alignItems: 'center', gap: '4px',
    },
    loading: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '200px', color: tokens.textMuted, fontSize: '12px', fontFamily: tokens.fontMono,
    },
    error: { color: tokens.danger, fontSize: '12px', fontFamily: tokens.fontMono, padding: tokens.spacing.lg },
    empty: {
        textAlign: 'center', padding: tokens.spacing.xxl,
        color: tokens.textMuted, fontSize: '12px', fontFamily: tokens.fontMono,
    },
};

function scoreColor(score) {
    if (score >= 8) return tokens.safe;
    if (score >= 6) return tokens.accent;
    if (score >= 4) return tokens.caution;
    return tokens.danger;
}

function directionStyle(direction) {
    const d = (direction || '').toUpperCase();
    if (d === 'BULLISH' || d === 'LONG' || d === 'CALL') {
        return { background: 'rgba(46, 213, 115, 0.12)', color: tokens.safe };
    }
    if (d === 'BEARISH' || d === 'SHORT' || d === 'PUT') {
        return { background: 'rgba(255, 71, 87, 0.12)', color: tokens.danger };
    }
    return { background: 'rgba(255, 165, 2, 0.12)', color: tokens.caution };
}

function Scanner() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        api.getScan()
            .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load'); setLoading(false); } });
        return () => { cancelled = true; };
    }, []);

    const opps = data?.opportunities || [];

    return (
        <div>
            <TickerSelector />
            <div style={styles.container}>
                <div style={styles.header}>Mispricing Scanner</div>
                {loading && <div style={styles.loading}>Running scanner...</div>}
                {error && <div style={styles.error}>{error}</div>}
                {!loading && !error && (
                    <>
                        <div style={styles.summary}>
                            <div style={styles.summaryItem}>
                                <span style={styles.summaryLabel}>Opportunities</span>
                                <span style={styles.summaryValue}>{data?.count || opps.length}</span>
                            </div>
                            <div style={styles.summaryItem}>
                                <span style={styles.summaryLabel}>100x Flags</span>
                                <span style={{ ...styles.summaryValue, color: tokens.caution }}>
                                    {data?.count_100x || opps.filter(o => o.is_100x).length}
                                </span>
                            </div>
                            <div style={styles.summaryItem}>
                                <span style={styles.summaryLabel}>Avg Score</span>
                                <span style={{ ...styles.summaryValue, color: tokens.accent }}>
                                    {opps.length > 0
                                        ? (opps.reduce((s, o) => s + (o.score || 0), 0) / opps.length).toFixed(1)
                                        : '--'}
                                </span>
                            </div>
                        </div>

                        {opps.length === 0 && (
                            <div style={styles.empty}>No mispricing opportunities detected.</div>
                        )}

                        {opps.map((o, i) => {
                            const sc = o.score || 0;
                            const clr = scoreColor(sc);
                            const dStyle = directionStyle(o.direction);

                            return (
                                <div key={i} style={styles.card}>
                                    <div style={styles.cardHeader}>
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={styles.ticker}>{o.ticker}</span>
                                            {o.direction && (
                                                <span style={{ ...styles.direction, ...dStyle }}>
                                                    {o.direction.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <span style={{
                                            ...styles.score,
                                            background: `${clr}22`,
                                            color: clr,
                                        }}>
                                            {sc.toFixed(1)}/10
                                        </span>
                                    </div>

                                    {/* Score bar */}
                                    <div style={styles.scoreBarContainer}>
                                        <div style={{
                                            ...styles.scoreBar,
                                            width: `${Math.min(sc * 10, 100)}%`,
                                            background: clr,
                                        }} />
                                    </div>

                                    {/* Thesis */}
                                    <div style={styles.thesis}>
                                        {o.thesis || 'No thesis available.'}
                                    </div>

                                    {/* Dealer flow context */}
                                    {(o.dealer_context || o.gex_context || o.regime) && (
                                        <div style={styles.dealerContext}>
                                            {o.dealer_context || o.gex_context || `Regime: ${o.regime}`}
                                        </div>
                                    )}

                                    {/* Meta */}
                                    <div style={styles.meta}>
                                        {o.expiry && (
                                            <div style={styles.metaItem}>
                                                <span>EXP: {o.expiry}</span>
                                            </div>
                                        )}
                                        {o.confidence != null && (
                                            <div style={styles.metaItem}>
                                                <span>CONF: {(o.confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        )}
                                        {o.estimated_payoff_multiple != null && (
                                            <div style={styles.metaItem}>
                                                <span style={{ color: tokens.accent, fontWeight: 600 }}>
                                                    {o.estimated_payoff_multiple.toFixed(0)}x payoff
                                                </span>
                                            </div>
                                        )}
                                        {o.is_100x && (
                                            <div style={styles.metaItem}>
                                                <span style={{ color: tokens.caution, fontWeight: 700, letterSpacing: '1px' }}>
                                                    100x
                                                </span>
                                            </div>
                                        )}
                                        {o.signal_type && (
                                            <div style={styles.metaItem}>
                                                <span>{o.signal_type}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}

export default Scanner;

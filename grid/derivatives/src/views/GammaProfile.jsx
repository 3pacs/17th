import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import useStore from '../store.js';
import api from '../api.js';
import TickerSelector from '../components/TickerSelector.jsx';
import { tokens } from '../styles/tokens.js';
import { interpretWalls } from '../lib/interpret.js';

const styles = {
    container: { padding: tokens.spacing.lg },
    header: {
        fontSize: '12px', fontWeight: 600, color: tokens.textMuted,
        letterSpacing: '3px', textTransform: 'uppercase',
        marginBottom: tokens.spacing.md, fontFamily: tokens.fontMono,
    },
    chartContainer: {
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.lg,
        marginBottom: tokens.spacing.lg,
        position: 'relative',
        overflow: 'hidden',
    },
    chartTitle: {
        fontSize: '10px', fontWeight: 600, color: tokens.textMuted,
        letterSpacing: '2px', textTransform: 'uppercase',
        fontFamily: tokens.fontMono, padding: `${tokens.spacing.md} ${tokens.spacing.lg} 0`,
    },
    tabRow: {
        display: 'flex', gap: tokens.spacing.xs,
        padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
    },
    tab: {
        padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
        background: 'none',
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.sm,
        color: tokens.textMuted,
        fontFamily: tokens.fontMono,
        fontSize: '10px', fontWeight: 500,
        cursor: 'pointer',
    },
    tabActive: {
        background: 'rgba(0, 212, 170, 0.1)',
        borderColor: tokens.accent,
        color: tokens.accent,
    },
    wallsRow: {
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg,
    },
    wallCard: {
        background: tokens.card, border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md, padding: tokens.spacing.md, textAlign: 'center',
    },
    wallLabel: {
        fontSize: '9px', fontWeight: 500, color: tokens.textMuted,
        letterSpacing: '1px', textTransform: 'uppercase', fontFamily: tokens.fontMono,
        marginBottom: tokens.spacing.xs,
    },
    wallValue: { fontSize: '18px', fontWeight: 700, fontFamily: tokens.fontMono },
    wallsViz: {
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.lg,
        marginBottom: tokens.spacing.lg,
    },
    wallBar: {
        display: 'flex', alignItems: 'center', gap: tokens.spacing.sm,
        marginBottom: tokens.spacing.sm, fontFamily: tokens.fontMono, fontSize: '11px',
    },
    interpretation: {
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.lg,
        fontSize: '12px', lineHeight: '1.7',
        color: tokens.text, fontFamily: tokens.fontMono,
    },
    noData: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '300px', color: tokens.textMuted,
        fontSize: '12px', fontFamily: tokens.fontMono,
    },
    loading: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '200px', color: tokens.textMuted, fontSize: '12px', fontFamily: tokens.fontMono,
    },
    error: { color: tokens.danger, fontSize: '12px', fontFamily: tokens.fontMono, padding: tokens.spacing.lg },
    tooltip: {
        position: 'absolute', pointerEvents: 'none',
        background: 'rgba(10, 14, 20, 0.95)',
        border: `1px solid ${tokens.accent}`,
        borderRadius: tokens.radius.sm,
        padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
        fontSize: '10px', fontFamily: tokens.fontMono,
        color: tokens.textBright, whiteSpace: 'nowrap', zIndex: 10,
    },
};

function formatGex(n) {
    if (n == null) return '--';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

function StrikeGEXChart({ perStrike, spot, putWall, callWall, gammaFlip, mode }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    const drawChart = useCallback(() => {
        if (!perStrike || perStrike.length === 0 || !svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = 320;
        const margin = { top: 16, right: 16, bottom: 40, left: 60 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // Get value based on mode
        const getValue = (d) => {
            if (mode === 'call') return d.call_gex ?? d.callGex ?? 0;
            if (mode === 'put') return d.put_gex ?? d.putGex ?? 0;
            return d.net_gex ?? d.netGex ?? 0;
        };

        const strikes = perStrike.map(d => d.strike);
        const values = perStrike.map(getValue);

        const x = d3.scaleBand().domain(strikes).range([0, innerW]).padding(0.2);
        const yMax = d3.max(values.map(Math.abs)) || 1;
        const y = d3.scaleLinear().domain([-yMax * 1.1, yMax * 1.1]).range([innerH, 0]);

        // Zero line
        g.append('line')
            .attr('x1', 0).attr('x2', innerW)
            .attr('y1', y(0)).attr('y2', y(0))
            .attr('stroke', tokens.textMuted).attr('stroke-width', 0.5)
            .attr('stroke-dasharray', '3,3');

        // Bars
        g.selectAll('.bar').data(perStrike).enter().append('rect')
            .attr('x', d => x(d.strike))
            .attr('y', d => {
                const v = getValue(d);
                return v >= 0 ? y(v) : y(0);
            })
            .attr('width', x.bandwidth())
            .attr('height', d => {
                const v = getValue(d);
                return Math.abs(y(0) - y(v));
            })
            .attr('fill', d => {
                if (mode === 'net' || mode === 'gamma') {
                    const v = getValue(d);
                    return v >= 0 ? tokens.safe : tokens.danger;
                }
                if (mode === 'call') return tokens.danger;
                if (mode === 'put') return tokens.safe;
                return tokens.accent;
            })
            .attr('opacity', 0.7)
            .attr('rx', 1);

        // Spot line
        if (spot != null) {
            const spotX = x(strikes.reduce((prev, curr) =>
                Math.abs(curr - spot) < Math.abs(prev - spot) ? curr : prev
            ));
            if (spotX != null) {
                g.append('line')
                    .attr('x1', spotX + x.bandwidth() / 2)
                    .attr('x2', spotX + x.bandwidth() / 2)
                    .attr('y1', 0).attr('y2', innerH)
                    .attr('stroke', tokens.textBright).attr('stroke-width', 1.5)
                    .attr('stroke-dasharray', '4,2');
            }
        }

        // Wall markers (horizontal lines at top)
        const markerY = 8;
        if (putWall != null) {
            const pw = x(strikes.reduce((prev, curr) =>
                Math.abs(curr - putWall) < Math.abs(prev - putWall) ? curr : prev
            ));
            if (pw != null) {
                g.append('circle')
                    .attr('cx', pw + x.bandwidth() / 2).attr('cy', markerY)
                    .attr('r', 4).attr('fill', tokens.safe);
                g.append('text')
                    .attr('x', pw + x.bandwidth() / 2).attr('y', markerY - 8)
                    .attr('text-anchor', 'middle')
                    .attr('fill', tokens.safe).attr('font-size', '7px')
                    .attr('font-family', tokens.fontMono).text('PUT');
            }
        }
        if (callWall != null) {
            const cw = x(strikes.reduce((prev, curr) =>
                Math.abs(curr - callWall) < Math.abs(prev - callWall) ? curr : prev
            ));
            if (cw != null) {
                g.append('circle')
                    .attr('cx', cw + x.bandwidth() / 2).attr('cy', markerY)
                    .attr('r', 4).attr('fill', tokens.danger);
                g.append('text')
                    .attr('x', cw + x.bandwidth() / 2).attr('y', markerY - 8)
                    .attr('text-anchor', 'middle')
                    .attr('fill', tokens.danger).attr('font-size', '7px')
                    .attr('font-family', tokens.fontMono).text('CALL');
            }
        }
        if (gammaFlip != null) {
            const gf = x(strikes.reduce((prev, curr) =>
                Math.abs(curr - gammaFlip) < Math.abs(prev - gammaFlip) ? curr : prev
            ));
            if (gf != null) {
                g.append('line')
                    .attr('x1', gf + x.bandwidth() / 2)
                    .attr('x2', gf + x.bandwidth() / 2)
                    .attr('y1', 0).attr('y2', innerH)
                    .attr('stroke', tokens.caution).attr('stroke-width', 1)
                    .attr('stroke-dasharray', '6,3');
            }
        }

        // X axis - only show every Nth label to avoid overlap
        const nTicks = Math.max(1, Math.floor(strikes.length / 8));
        const xAxis = d3.axisBottom(x)
            .tickValues(strikes.filter((_, i) => i % nTicks === 0))
            .tickFormat(d => `$${d}`);
        g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '8px')
            .attr('font-family', tokens.fontMono).attr('transform', 'rotate(-30)').attr('text-anchor', 'end');

        const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => {
            const abs = Math.abs(d);
            if (abs >= 1e9) return `${(d / 1e9).toFixed(1)}B`;
            if (abs >= 1e6) return `${(d / 1e6).toFixed(0)}M`;
            if (abs >= 1e3) return `${(d / 1e3).toFixed(0)}K`;
            return d.toFixed(0);
        });
        g.append('g').call(yAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono);

        g.selectAll('.domain').attr('stroke', tokens.cardBorder);
        g.selectAll('.tick line').attr('stroke', tokens.cardBorder);

        // Hover
        const overlay = g.append('rect')
            .attr('width', innerW).attr('height', innerH)
            .attr('fill', 'none').attr('pointer-events', 'all')
            .style('cursor', 'crosshair');

        overlay.on('mousemove', (event) => {
            const [mx] = d3.pointer(event);
            const eachBand = x.step();
            const idx = Math.min(Math.floor(mx / eachBand), perStrike.length - 1);
            if (idx < 0) return;
            const d = perStrike[idx];
            const v = getValue(d);
            setTooltip({
                left: margin.left + x(d.strike) + x.bandwidth() / 2 + 8,
                top: margin.top + y(v) - 10,
                text: `$${d.strike} | GEX ${formatGex(v)}`,
            });
        });
        overlay.on('mouseleave', () => setTooltip(null));
    }, [perStrike, spot, putWall, callWall, gammaFlip, mode]);

    useEffect(() => {
        drawChart();
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    if (!perStrike || perStrike.length === 0) {
        return <div style={styles.noData}>No strike-level GEX data available</div>;
    }

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <svg ref={svgRef} />
            {tooltip && (
                <div style={{ ...styles.tooltip, left: tooltip.left, top: tooltip.top }}>
                    {tooltip.text}
                </div>
            )}
        </div>
    );
}

function WallsVisualization({ spot, putWall, callWall, gammaFlip }) {
    if (!spot || (!putWall && !callWall)) return null;

    const allPrices = [putWall, spot, callWall, gammaFlip].filter(Boolean);
    const lo = Math.min(...allPrices) * 0.98;
    const hi = Math.max(...allPrices) * 1.02;
    const range = hi - lo;
    const pct = (v) => ((v - lo) / range) * 100;

    return (
        <div style={styles.wallsViz}>
            <div style={{ ...styles.wallLabel, marginBottom: tokens.spacing.md }}>Price Levels</div>
            <div style={{ position: 'relative', height: '40px', background: tokens.bgSecondary, borderRadius: tokens.radius.sm }}>
                {/* Range fill between walls */}
                {putWall && callWall && (
                    <div style={{
                        position: 'absolute', left: `${pct(putWall)}%`, width: `${pct(callWall) - pct(putWall)}%`,
                        top: 0, bottom: 0, background: 'rgba(0, 212, 170, 0.06)', borderRadius: tokens.radius.sm,
                    }} />
                )}
                {/* Put wall */}
                {putWall && (
                    <div style={{
                        position: 'absolute', left: `${pct(putWall)}%`, top: 0, bottom: 0,
                        width: '2px', background: tokens.safe, transform: 'translateX(-1px)',
                    }}>
                        <div style={{ position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)',
                            fontSize: '8px', color: tokens.safe, fontFamily: tokens.fontMono, whiteSpace: 'nowrap' }}>
                            PUT ${putWall.toFixed(0)}
                        </div>
                    </div>
                )}
                {/* Gamma flip */}
                {gammaFlip && (
                    <div style={{
                        position: 'absolute', left: `${pct(gammaFlip)}%`, top: 0, bottom: 0,
                        width: '2px', background: tokens.caution, transform: 'translateX(-1px)',
                        opacity: 0.7,
                    }}>
                        <div style={{ position: 'absolute', bottom: '-16px', left: '50%', transform: 'translateX(-50%)',
                            fontSize: '8px', color: tokens.caution, fontFamily: tokens.fontMono, whiteSpace: 'nowrap' }}>
                            FLIP ${gammaFlip.toFixed(0)}
                        </div>
                    </div>
                )}
                {/* Call wall */}
                {callWall && (
                    <div style={{
                        position: 'absolute', left: `${pct(callWall)}%`, top: 0, bottom: 0,
                        width: '2px', background: tokens.danger, transform: 'translateX(-1px)',
                    }}>
                        <div style={{ position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)',
                            fontSize: '8px', color: tokens.danger, fontFamily: tokens.fontMono, whiteSpace: 'nowrap' }}>
                            CALL ${callWall.toFixed(0)}
                        </div>
                    </div>
                )}
                {/* Spot */}
                <div style={{
                    position: 'absolute', left: `${pct(spot)}%`, top: '4px', bottom: '4px',
                    width: '3px', background: tokens.textBright, borderRadius: '2px', transform: 'translateX(-1.5px)',
                }}>
                    <div style={{ position: 'absolute', bottom: '-16px', left: '50%', transform: 'translateX(-50%)',
                        fontSize: '8px', color: tokens.textBright, fontFamily: tokens.fontMono, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        SPOT ${spot.toFixed(0)}
                    </div>
                </div>
            </div>
        </div>
    );
}

function GammaProfile() {
    const { selectedTicker } = useStore();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState('net');

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        api.getGEX(selectedTicker)
            .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [selectedTicker]);

    const perStrike = data?.per_strike || [];
    const spot = data?.spot;
    const putWall = data?.put_wall;
    const callWall = data?.call_wall;
    const gammaFlip = data?.gamma_flip;
    const gammaWall = data?.gamma_wall;

    const wallNarrative = interpretWalls(putWall, callWall, gammaFlip, spot);

    return (
        <div>
            <TickerSelector />
            <div style={styles.container}>
                <div style={styles.header}>Gamma Exposure Profile</div>
                {loading && <div style={styles.loading}>Computing gamma profile...</div>}
                {error && <div style={styles.error}>{error}</div>}
                {!loading && !error && (
                    <>
                        {/* Walls row */}
                        <div style={styles.wallsRow}>
                            <div style={styles.wallCard}>
                                <div style={styles.wallLabel}>Put Wall</div>
                                <div style={{ ...styles.wallValue, color: tokens.safe }}>
                                    {putWall != null ? `$${putWall.toFixed(0)}` : '--'}
                                </div>
                            </div>
                            <div style={styles.wallCard}>
                                <div style={styles.wallLabel}>Gamma Flip</div>
                                <div style={{ ...styles.wallValue, color: tokens.caution }}>
                                    {gammaFlip != null ? `$${gammaFlip.toFixed(0)}` : (gammaWall != null ? `$${gammaWall.toFixed(0)}` : '--')}
                                </div>
                            </div>
                            <div style={styles.wallCard}>
                                <div style={styles.wallLabel}>Call Wall</div>
                                <div style={{ ...styles.wallValue, color: tokens.danger }}>
                                    {callWall != null ? `$${callWall.toFixed(0)}` : '--'}
                                </div>
                            </div>
                        </div>

                        {/* Walls visualization */}
                        <WallsVisualization spot={spot} putWall={putWall} callWall={callWall} gammaFlip={gammaFlip} />

                        {/* Chart with tabs */}
                        <div style={styles.chartContainer}>
                            <div style={styles.chartTitle}>GEX by Strike</div>
                            <div style={styles.tabRow}>
                                {[
                                    { key: 'net', label: 'Net GEX' },
                                    { key: 'call', label: 'Call GEX' },
                                    { key: 'put', label: 'Put GEX' },
                                ].map(t => (
                                    <button
                                        key={t.key}
                                        style={{ ...styles.tab, ...(mode === t.key ? styles.tabActive : {}) }}
                                        onClick={() => setMode(t.key)}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <StrikeGEXChart
                                perStrike={perStrike}
                                spot={spot}
                                putWall={putWall}
                                callWall={callWall}
                                gammaFlip={gammaFlip}
                                mode={mode}
                            />
                        </div>

                        {/* Interpretation */}
                        {wallNarrative.range && (
                            <div style={styles.interpretation}>
                                <div>{wallNarrative.support}</div>
                                <div style={{ marginTop: '6px' }}>{wallNarrative.resistance}</div>
                                <div style={{ marginTop: '6px', color: tokens.accent }}>{wallNarrative.range}</div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default GammaProfile;

import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import useStore from '../store.js';
import api from '../api.js';
import TickerSelector from '../components/TickerSelector.jsx';
import { tokens } from '../styles/tokens.js';
import { interpretRegime, interpretWalls, interpretVanna, interpretCharm, interpretOpex } from '../lib/interpret.js';

const styles = {
    container: { padding: tokens.spacing.lg },
    header: {
        fontSize: '12px', fontWeight: 600, color: tokens.textMuted,
        letterSpacing: '3px', textTransform: 'uppercase',
        marginBottom: tokens.spacing.md, fontFamily: tokens.fontMono,
    },
    regimeBanner: {
        padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
        borderRadius: tokens.radius.md,
        marginBottom: tokens.spacing.lg,
        fontFamily: tokens.fontMono,
        fontSize: '14px',
        fontWeight: 700,
        letterSpacing: '2px',
        textAlign: 'center',
    },
    regimeDesc: {
        fontSize: '11px',
        fontWeight: 400,
        letterSpacing: '0px',
        marginTop: tokens.spacing.xs,
        lineHeight: '1.5',
    },
    metricsRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: tokens.spacing.sm,
        marginBottom: tokens.spacing.lg,
    },
    metricCard: {
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.md,
    },
    metricLabel: {
        fontSize: '9px', fontWeight: 500, color: tokens.textMuted,
        letterSpacing: '1px', textTransform: 'uppercase',
        fontFamily: tokens.fontMono, marginBottom: tokens.spacing.xs,
    },
    metricValue: {
        fontSize: '16px', fontWeight: 700,
        fontFamily: tokens.fontMono, color: tokens.textBright,
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
    interpretation: {
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.lg,
        fontSize: '12px',
        lineHeight: '1.7',
        color: tokens.text,
        fontFamily: tokens.fontMono,
    },
    interpSection: {
        marginBottom: tokens.spacing.md,
    },
    interpLabel: {
        fontSize: '9px', fontWeight: 600, color: tokens.accent,
        letterSpacing: '1px', textTransform: 'uppercase',
        fontFamily: tokens.fontMono, marginBottom: tokens.spacing.xs,
    },
    noData: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '240px', color: tokens.textMuted,
        fontSize: '12px', fontFamily: tokens.fontMono,
    },
    loading: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '200px', color: tokens.textMuted, fontSize: '12px', fontFamily: tokens.fontMono,
    },
    error: { color: tokens.danger, fontSize: '12px', fontFamily: tokens.fontMono, padding: tokens.spacing.lg },
    tooltip: {
        position: 'absolute',
        pointerEvents: 'none',
        background: 'rgba(10, 14, 20, 0.95)',
        border: `1px solid ${tokens.accent}`,
        borderRadius: tokens.radius.sm,
        padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
        fontSize: '10px',
        fontFamily: tokens.fontMono,
        color: tokens.textBright,
        whiteSpace: 'nowrap',
        zIndex: 10,
    },
};

function formatNum(n) {
    if (n == null) return '--';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
    return `${sign}$${abs.toFixed(0)}`;
}

function getRegimeStyle(regime) {
    if (regime === 'LONG_GAMMA') return { background: 'rgba(46, 213, 115, 0.12)', color: tokens.safe, borderLeft: `3px solid ${tokens.safe}` };
    if (regime === 'SHORT_GAMMA') return { background: 'rgba(255, 71, 87, 0.12)', color: tokens.danger, borderLeft: `3px solid ${tokens.danger}` };
    return { background: 'rgba(255, 165, 2, 0.12)', color: tokens.caution, borderLeft: `3px solid ${tokens.caution}` };
}

function getRegimeLabel(regime) {
    if (regime === 'LONG_GAMMA') return 'LONG GAMMA';
    if (regime === 'SHORT_GAMMA') return 'SHORT GAMMA';
    return 'NEUTRAL';
}

function getRegimeDesc(regime) {
    if (regime === 'LONG_GAMMA') return 'Dealers dampening moves. Mean-reversion likely. Sell the rip, buy the dip.';
    if (regime === 'SHORT_GAMMA') return 'Dealers amplifying moves. Trend continuation and breakout risk. Hedging reinforces direction.';
    return 'Near the flip point. Regime could shift quickly with any positioning change.';
}

/** GEX Profile D3 Chart */
function GEXProfileChart({ profile, spot, gammaFlip, putWall, callWall }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    const drawChart = useCallback(() => {
        if (!profile || profile.length === 0 || !svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = 260;
        const margin = { top: 16, right: 16, bottom: 36, left: 56 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const xExtent = d3.extent(profile, d => d.spot);
        const yExtent = d3.extent(profile, d => d.gex);
        const yPad = Math.max(Math.abs(yExtent[1] - yExtent[0]) * 0.1, 1);

        const x = d3.scaleLinear().domain(xExtent).range([0, innerW]);
        const y = d3.scaleLinear().domain([yExtent[0] - yPad, yExtent[1] + yPad]).range([innerH, 0]);

        // Shade regions: green above zero, red below zero
        const zeroY = y(0);
        const areaAbove = d3.area()
            .x(d => x(d.spot))
            .y0(Math.min(zeroY, innerH))
            .y1(d => Math.min(y(Math.max(d.gex, 0)), innerH))
            .curve(d3.curveMonotoneX);
        const areaBelow = d3.area()
            .x(d => x(d.spot))
            .y0(Math.max(zeroY, 0))
            .y1(d => Math.max(y(Math.min(d.gex, 0)), 0))
            .curve(d3.curveMonotoneX);

        g.append('path').datum(profile).attr('d', areaAbove)
            .attr('fill', 'rgba(46, 213, 115, 0.15)').attr('stroke', 'none');
        g.append('path').datum(profile).attr('d', areaBelow)
            .attr('fill', 'rgba(255, 71, 87, 0.15)').attr('stroke', 'none');

        // Zero line
        g.append('line')
            .attr('x1', 0).attr('x2', innerW)
            .attr('y1', zeroY).attr('y2', zeroY)
            .attr('stroke', tokens.textMuted).attr('stroke-width', 0.5)
            .attr('stroke-dasharray', '3,3');

        // GEX line
        const line = d3.line().x(d => x(d.spot)).y(d => y(d.gex)).curve(d3.curveMonotoneX);
        g.append('path').datum(profile).attr('d', line)
            .attr('fill', 'none').attr('stroke', tokens.accent).attr('stroke-width', 1.5);

        // Current spot vertical line
        if (spot != null && spot >= xExtent[0] && spot <= xExtent[1]) {
            g.append('line')
                .attr('x1', x(spot)).attr('x2', x(spot))
                .attr('y1', 0).attr('y2', innerH)
                .attr('stroke', tokens.textBright).attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4,2');
            g.append('text')
                .attr('x', x(spot)).attr('y', -4)
                .attr('text-anchor', 'middle')
                .attr('fill', tokens.textBright).attr('font-size', '9px')
                .attr('font-family', tokens.fontMono)
                .text(`SPOT $${spot.toFixed(0)}`);
        }

        // Gamma flip marker
        if (gammaFlip != null && gammaFlip >= xExtent[0] && gammaFlip <= xExtent[1]) {
            g.append('line')
                .attr('x1', x(gammaFlip)).attr('x2', x(gammaFlip))
                .attr('y1', 0).attr('y2', innerH)
                .attr('stroke', tokens.caution).attr('stroke-width', 1)
                .attr('stroke-dasharray', '6,3');
            g.append('text')
                .attr('x', x(gammaFlip) + 4).attr('y', 12)
                .attr('fill', tokens.caution).attr('font-size', '8px')
                .attr('font-family', tokens.fontMono)
                .text(`FLIP $${gammaFlip.toFixed(0)}`);
        }

        // Put wall marker
        if (putWall != null && putWall >= xExtent[0] && putWall <= xExtent[1]) {
            g.append('line')
                .attr('x1', x(putWall)).attr('x2', x(putWall))
                .attr('y1', 0).attr('y2', innerH)
                .attr('stroke', tokens.safe).attr('stroke-width', 1)
                .attr('stroke-dasharray', '2,4');
            g.append('text')
                .attr('x', x(putWall)).attr('y', innerH + 12)
                .attr('text-anchor', 'middle')
                .attr('fill', tokens.safe).attr('font-size', '8px')
                .attr('font-family', tokens.fontMono)
                .text(`PUT $${putWall.toFixed(0)}`);
        }

        // Call wall marker
        if (callWall != null && callWall >= xExtent[0] && callWall <= xExtent[1]) {
            g.append('line')
                .attr('x1', x(callWall)).attr('x2', x(callWall))
                .attr('y1', 0).attr('y2', innerH)
                .attr('stroke', tokens.danger).attr('stroke-width', 1)
                .attr('stroke-dasharray', '2,4');
            g.append('text')
                .attr('x', x(callWall)).attr('y', innerH + 12)
                .attr('text-anchor', 'middle')
                .attr('fill', tokens.danger).attr('font-size', '8px')
                .attr('font-family', tokens.fontMono)
                .text(`CALL $${callWall.toFixed(0)}`);
        }

        // Axes
        const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d => `$${d.toFixed(0)}`);
        const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => {
            const abs = Math.abs(d);
            if (abs >= 1e9) return `${(d / 1e9).toFixed(1)}B`;
            if (abs >= 1e6) return `${(d / 1e6).toFixed(0)}M`;
            if (abs >= 1e3) return `${(d / 1e3).toFixed(0)}K`;
            return d.toFixed(0);
        });

        g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono);
        g.append('g').call(yAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono);

        g.selectAll('.domain').attr('stroke', tokens.cardBorder);
        g.selectAll('.tick line').attr('stroke', tokens.cardBorder);

        // Crosshair overlay
        const crosshairGroup = g.append('g').style('display', 'none');
        crosshairGroup.append('line').attr('class', 'ch-x')
            .attr('y1', 0).attr('y2', innerH)
            .attr('stroke', tokens.textMuted).attr('stroke-width', 0.5);
        crosshairGroup.append('line').attr('class', 'ch-y')
            .attr('x1', 0).attr('x2', innerW)
            .attr('stroke', tokens.textMuted).attr('stroke-width', 0.5);
        crosshairGroup.append('circle')
            .attr('r', 3).attr('fill', tokens.accent).attr('stroke', tokens.bg).attr('stroke-width', 1);

        const bisect = d3.bisector(d => d.spot).left;

        const overlay = g.append('rect')
            .attr('width', innerW).attr('height', innerH)
            .attr('fill', 'none').attr('pointer-events', 'all')
            .style('cursor', 'crosshair');

        overlay.on('mousemove', (event) => {
            const [mx] = d3.pointer(event);
            const spotVal = x.invert(mx);
            const idx = bisect(profile, spotVal, 1);
            const d0 = profile[idx - 1];
            const d1 = profile[idx];
            if (!d0) return;
            const d = d1 && (spotVal - d0.spot > d1.spot - spotVal) ? d1 : d0;

            crosshairGroup.style('display', null);
            crosshairGroup.select('.ch-x').attr('x1', x(d.spot)).attr('x2', x(d.spot));
            crosshairGroup.select('.ch-y').attr('y1', y(d.gex)).attr('y2', y(d.gex));
            crosshairGroup.select('circle').attr('cx', x(d.spot)).attr('cy', y(d.gex));

            setTooltip({
                left: margin.left + x(d.spot) + 12,
                top: margin.top + y(d.gex) - 16,
                text: `$${d.spot.toFixed(0)} | GEX ${formatNum(d.gex)}`,
            });
        });

        overlay.on('mouseleave', () => {
            crosshairGroup.style('display', 'none');
            setTooltip(null);
        });
    }, [profile, spot, gammaFlip, putWall, callWall]);

    useEffect(() => {
        drawChart();
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    if (!profile || profile.length === 0) {
        return <div style={styles.noData}>No GEX profile data available</div>;
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

function DealerFlow() {
    const { selectedTicker } = useStore();
    const [data, setData] = useState(null);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            api.getGEX(selectedTicker).catch(() => null),
            api.getOverview().catch(() => null),
        ])
            .then(([gexRes, overviewRes]) => {
                if (!cancelled) {
                    setData(gexRes);
                    setOverview(overviewRes);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load data');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [selectedTicker]);

    const r = data?.regime || overview?.regime || 'NEUTRAL';
    const spot = data?.spot;
    const gex = data?.gex_aggregate;
    const gammaFlip = data?.gamma_flip;
    const putWall = data?.put_wall;
    const callWall = data?.call_wall;
    const vannaExp = data?.vanna_exposure;
    const charmExp = data?.charm_exposure;
    const dealerDelta = data?.dealer_delta;
    const profile = data?.profile;
    const daysToOpex = data?.days_to_opex ?? overview?.days_to_opex;

    // Build interpretation
    const regimeNarrative = interpretRegime(gex, gammaFlip, spot);
    const wallNarrative = interpretWalls(putWall, callWall, gammaFlip, spot);
    const vannaNarrative = interpretVanna(vannaExp, overview?.vix);
    const charmNarrative = interpretCharm(charmExp, daysToOpex);
    const opexNarrative = interpretOpex(daysToOpex, gex);

    return (
        <div>
            <TickerSelector />
            <div style={styles.container}>
                <div style={styles.header}>Dealer Flow Dashboard</div>

                {loading && <div style={styles.loading}>Loading dealer positioning...</div>}
                {error && <div style={styles.error}>{error}</div>}

                {!loading && !error && (
                    <>
                        {/* Regime Banner */}
                        <div style={{ ...styles.regimeBanner, ...getRegimeStyle(r) }}>
                            {getRegimeLabel(r)}
                            <div style={styles.regimeDesc}>{getRegimeDesc(r)}</div>
                        </div>

                        {/* Key Metrics Row */}
                        <div style={styles.metricsRow}>
                            <div style={styles.metricCard}>
                                <div style={styles.metricLabel}>GEX Aggregate</div>
                                <div style={{ ...styles.metricValue, color: gex != null && gex >= 0 ? tokens.safe : tokens.danger }}>
                                    {formatNum(gex)}
                                </div>
                            </div>
                            <div style={styles.metricCard}>
                                <div style={styles.metricLabel}>Gamma Flip</div>
                                <div style={styles.metricValue}>
                                    {gammaFlip != null ? `$${gammaFlip.toFixed(0)}` : '--'}
                                </div>
                            </div>
                            <div style={styles.metricCard}>
                                <div style={styles.metricLabel}>Vanna Exp</div>
                                <div style={{ ...styles.metricValue, color: tokens.purple }}>
                                    {formatNum(vannaExp)}
                                </div>
                            </div>
                            <div style={styles.metricCard}>
                                <div style={styles.metricLabel}>Charm Exp</div>
                                <div style={{ ...styles.metricValue, color: tokens.caution }}>
                                    {formatNum(charmExp)}
                                </div>
                            </div>
                            <div style={styles.metricCard}>
                                <div style={styles.metricLabel}>Net Delta</div>
                                <div style={{ ...styles.metricValue, color: dealerDelta != null && dealerDelta >= 0 ? tokens.safe : tokens.danger }}>
                                    {formatNum(dealerDelta)}
                                </div>
                            </div>
                            <div style={styles.metricCard}>
                                <div style={styles.metricLabel}>Days to OpEx</div>
                                <div style={{ ...styles.metricValue, color: daysToOpex != null && daysToOpex <= 3 ? tokens.danger : tokens.textBright }}>
                                    {daysToOpex != null ? daysToOpex : '--'}
                                </div>
                            </div>
                        </div>

                        {/* GEX Profile Chart */}
                        <div style={styles.chartContainer}>
                            <div style={styles.chartTitle}>GEX Profile vs Spot Price</div>
                            <GEXProfileChart
                                profile={profile}
                                spot={spot}
                                gammaFlip={gammaFlip}
                                putWall={putWall}
                                callWall={callWall}
                            />
                        </div>

                        {/* Interpretation Panel */}
                        <div style={styles.interpretation}>
                            {regimeNarrative && (
                                <div style={styles.interpSection}>
                                    <div style={styles.interpLabel}>Regime</div>
                                    <div>{regimeNarrative}</div>
                                </div>
                            )}
                            {wallNarrative.range && (
                                <div style={styles.interpSection}>
                                    <div style={styles.interpLabel}>Walls</div>
                                    <div>{wallNarrative.support}</div>
                                    <div style={{ marginTop: '4px' }}>{wallNarrative.resistance}</div>
                                    <div style={{ marginTop: '4px', color: tokens.accent }}>{wallNarrative.range}</div>
                                </div>
                            )}
                            {vannaNarrative && (
                                <div style={styles.interpSection}>
                                    <div style={styles.interpLabel}>Vanna</div>
                                    <div>{vannaNarrative}</div>
                                </div>
                            )}
                            {charmNarrative && (
                                <div style={styles.interpSection}>
                                    <div style={styles.interpLabel}>Charm</div>
                                    <div>{charmNarrative}</div>
                                </div>
                            )}
                            {opexNarrative && (
                                <div style={styles.interpSection}>
                                    <div style={styles.interpLabel}>OpEx</div>
                                    <div>{opexNarrative}</div>
                                </div>
                            )}
                            {!regimeNarrative && !wallNarrative.range && !vannaNarrative && !charmNarrative && (
                                <div style={{ color: tokens.textMuted }}>
                                    No interpretation data available. Waiting for dealer positioning data.
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default DealerFlow;

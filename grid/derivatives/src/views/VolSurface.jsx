import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import useStore from '../store.js';
import api from '../api.js';
import TickerSelector from '../components/TickerSelector.jsx';
import { tokens } from '../styles/tokens.js';
import { interpretSkew } from '../lib/interpret.js';

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
        position: 'relative', overflow: 'hidden',
    },
    chartTitle: {
        fontSize: '10px', fontWeight: 600, color: tokens.textMuted,
        letterSpacing: '2px', textTransform: 'uppercase',
        fontFamily: tokens.fontMono, padding: `${tokens.spacing.md} ${tokens.spacing.lg} 0`,
    },
    skewPanel: {
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.lg,
        marginBottom: tokens.spacing.lg,
        position: 'relative', overflow: 'hidden',
    },
    statsRow: {
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
        gap: tokens.spacing.sm, marginBottom: tokens.spacing.lg,
    },
    statCard: {
        background: tokens.card, border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md, padding: tokens.spacing.md,
    },
    statLabel: {
        fontSize: '9px', fontWeight: 500, color: tokens.textMuted,
        letterSpacing: '1px', textTransform: 'uppercase', fontFamily: tokens.fontMono,
        marginBottom: tokens.spacing.xs,
    },
    statValue: { fontSize: '14px', fontWeight: 700, fontFamily: tokens.fontMono, color: tokens.textBright },
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
    legend: {
        display: 'flex', gap: tokens.spacing.lg, flexWrap: 'wrap',
        padding: `${tokens.spacing.xs} ${tokens.spacing.lg} ${tokens.spacing.md}`,
        fontSize: '9px', fontFamily: tokens.fontMono, color: tokens.textMuted,
    },
    legendItem: {
        display: 'flex', alignItems: 'center', gap: tokens.spacing.xs,
    },
    legendDot: {
        width: '8px', height: '8px', borderRadius: '1px',
    },
};

// Custom Inferno-like color interpolator for dark-bg
function ivColor(value, minIV, maxIV) {
    if (value == null || minIV == null || maxIV == null) return tokens.textMuted;
    const t = maxIV > minIV ? (value - minIV) / (maxIV - minIV) : 0.5;
    return d3.interpolateInferno(Math.max(0.1, Math.min(0.95, t)));
}

function VolSurfaceHeatmap({ surface, spot }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    const drawChart = useCallback(() => {
        if (!surface || surface.length === 0 || !svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = 360;
        const margin = { top: 16, right: 80, bottom: 48, left: 60 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // Compute moneyness (strike/spot) if spot is available, else use strike
        const useMoneyness = spot != null && spot > 0;
        const getX = (d) => useMoneyness ? (d.strike / spot) : d.strike;
        const getDTE = (d) => d.dte ?? d.days_to_expiry ?? 0;
        const getIV = (d) => d.iv ?? d.implied_vol ?? d.mid_iv ?? 0;

        const xVals = [...new Set(surface.map(getX))].sort((a, b) => a - b);
        const yVals = [...new Set(surface.map(getDTE))].sort((a, b) => a - b);
        const ivVals = surface.map(getIV).filter(v => v > 0);
        const minIV = d3.min(ivVals) || 0;
        const maxIV = d3.max(ivVals) || 1;

        const x = d3.scaleBand().domain(xVals).range([0, innerW]).padding(0.02);
        const y = d3.scaleBand().domain(yVals).range([0, innerH]).padding(0.02);

        // Build lookup
        const lookup = {};
        for (const d of surface) {
            const key = `${getX(d)}_${getDTE(d)}`;
            lookup[key] = d;
        }

        // Draw cells
        for (const xv of xVals) {
            for (const yv of yVals) {
                const key = `${xv}_${yv}`;
                const d = lookup[key];
                if (!d) continue;
                const iv = getIV(d);
                if (iv <= 0) continue;

                g.append('rect')
                    .attr('x', x(xv))
                    .attr('y', y(yv))
                    .attr('width', x.bandwidth())
                    .attr('height', y.bandwidth())
                    .attr('fill', ivColor(iv, minIV, maxIV))
                    .attr('rx', 1);
            }
        }

        // ATM moneyness line (vertical at 1.0 if using moneyness)
        if (useMoneyness) {
            const closestATM = xVals.reduce((prev, curr) =>
                Math.abs(curr - 1.0) < Math.abs(prev - 1.0) ? curr : prev
            );
            const atmX = x(closestATM);
            if (atmX != null) {
                g.append('line')
                    .attr('x1', atmX + x.bandwidth() / 2)
                    .attr('x2', atmX + x.bandwidth() / 2)
                    .attr('y1', 0).attr('y2', innerH)
                    .attr('stroke', tokens.textBright).attr('stroke-width', 1)
                    .attr('stroke-dasharray', '4,2');
                g.append('text')
                    .attr('x', atmX + x.bandwidth() / 2).attr('y', -4)
                    .attr('text-anchor', 'middle')
                    .attr('fill', tokens.textBright).attr('font-size', '8px')
                    .attr('font-family', tokens.fontMono).text('ATM');
            }
        }

        // Axes
        const nXTicks = Math.max(1, Math.floor(xVals.length / 8));
        const xAxis = d3.axisBottom(x)
            .tickValues(xVals.filter((_, i) => i % nXTicks === 0))
            .tickFormat(d => useMoneyness ? d.toFixed(2) : `$${d}`);
        g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '8px')
            .attr('font-family', tokens.fontMono).attr('transform', 'rotate(-30)').attr('text-anchor', 'end');

        const nYTicks = Math.max(1, Math.floor(yVals.length / 6));
        const yAxis = d3.axisLeft(y)
            .tickValues(yVals.filter((_, i) => i % nYTicks === 0))
            .tickFormat(d => `${d}d`);
        g.append('g').call(yAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono);

        g.selectAll('.domain').attr('stroke', tokens.cardBorder);
        g.selectAll('.tick line').attr('stroke', tokens.cardBorder);

        // Axis labels
        svg.append('text')
            .attr('x', margin.left + innerW / 2).attr('y', height - 4)
            .attr('text-anchor', 'middle')
            .attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono)
            .text(useMoneyness ? 'Moneyness (K/S)' : 'Strike');

        svg.append('text')
            .attr('transform', `translate(12, ${margin.top + innerH / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono)
            .text('DTE');

        // Color legend
        const legendW = 12;
        const legendH = innerH;
        const legendG = svg.append('g')
            .attr('transform', `translate(${width - margin.right + 16}, ${margin.top})`);

        const nSteps = 40;
        const legendScale = d3.scaleLinear().domain([0, nSteps - 1]).range([minIV, maxIV]);
        for (let i = 0; i < nSteps; i++) {
            legendG.append('rect')
                .attr('x', 0).attr('y', legendH - (i + 1) * legendH / nSteps)
                .attr('width', legendW).attr('height', legendH / nSteps + 1)
                .attr('fill', ivColor(legendScale(i), minIV, maxIV));
        }
        legendG.append('text')
            .attr('x', legendW + 4).attr('y', 8)
            .attr('fill', tokens.textMuted).attr('font-size', '8px').attr('font-family', tokens.fontMono)
            .text(`${(maxIV * 100).toFixed(0)}%`);
        legendG.append('text')
            .attr('x', legendW + 4).attr('y', legendH)
            .attr('fill', tokens.textMuted).attr('font-size', '8px').attr('font-family', tokens.fontMono)
            .text(`${(minIV * 100).toFixed(0)}%`);
        legendG.append('text')
            .attr('x', legendW / 2).attr('y', -6).attr('text-anchor', 'middle')
            .attr('fill', tokens.textMuted).attr('font-size', '7px').attr('font-family', tokens.fontMono)
            .text('IV');

        // Hover overlay
        const overlay = g.append('rect')
            .attr('width', innerW).attr('height', innerH)
            .attr('fill', 'none').attr('pointer-events', 'all')
            .style('cursor', 'crosshair');

        overlay.on('mousemove', (event) => {
            const [mx, my] = d3.pointer(event);
            // Find closest cell
            let closestX = null;
            let closestY = null;
            let minDist = Infinity;

            for (const xv of xVals) {
                for (const yv of yVals) {
                    const cx = x(xv) + x.bandwidth() / 2;
                    const cy = y(yv) + y.bandwidth() / 2;
                    const dist = Math.abs(cx - mx) + Math.abs(cy - my);
                    if (dist < minDist) {
                        minDist = dist;
                        closestX = xv;
                        closestY = yv;
                    }
                }
            }

            if (closestX != null && closestY != null) {
                const key = `${closestX}_${closestY}`;
                const d = lookup[key];
                if (d) {
                    const iv = getIV(d);
                    const strike = d.strike;
                    setTooltip({
                        left: margin.left + x(closestX) + x.bandwidth() + 8,
                        top: margin.top + y(closestY) - 6,
                        text: `K=$${strike} | DTE=${getDTE(d)} | IV=${(iv * 100).toFixed(1)}%`,
                    });
                }
            }
        });
        overlay.on('mouseleave', () => setTooltip(null));
    }, [surface, spot]);

    useEffect(() => {
        drawChart();
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    if (!surface || surface.length === 0) {
        return <div style={styles.noData}>No vol surface data available</div>;
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

function SkewChart({ surface, spot }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);

    const drawChart = useCallback(() => {
        if (!surface || surface.length === 0 || !svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = 200;
        const margin = { top: 16, right: 16, bottom: 36, left: 56 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const getDTE = (d) => d.dte ?? d.days_to_expiry ?? 0;
        const getIV = (d) => d.iv ?? d.implied_vol ?? d.mid_iv ?? 0;
        const getX = (d) => spot > 0 ? (d.strike / spot) : d.strike;

        // Group by DTE, take nearest 3 expiries
        const byDTE = {};
        for (const d of surface) {
            const dte = getDTE(d);
            if (!byDTE[dte]) byDTE[dte] = [];
            byDTE[dte].push(d);
        }
        const dtes = Object.keys(byDTE).map(Number).sort((a, b) => a - b);
        const selectedDTEs = dtes.slice(0, Math.min(3, dtes.length));
        const colors = [tokens.accent, tokens.purple, tokens.caution];

        const allPoints = selectedDTEs.flatMap(dte => byDTE[dte]);
        const xExtent = d3.extent(allPoints, getX);
        const yExtent = d3.extent(allPoints, getIV);
        if (!xExtent[0] || !yExtent[0]) return;

        const yPad = (yExtent[1] - yExtent[0]) * 0.1;
        const x = d3.scaleLinear().domain(xExtent).range([0, innerW]);
        const y = d3.scaleLinear().domain([yExtent[0] - yPad, yExtent[1] + yPad]).range([innerH, 0]);

        selectedDTEs.forEach((dte, idx) => {
            const points = byDTE[dte].sort((a, b) => getX(a) - getX(b));
            const line = d3.line().x(d => x(getX(d))).y(d => y(getIV(d))).curve(d3.curveMonotoneX);
            g.append('path').datum(points).attr('d', line)
                .attr('fill', 'none').attr('stroke', colors[idx]).attr('stroke-width', 1.5);
        });

        // ATM line
        if (spot > 0) {
            const atmX = x(1.0);
            if (atmX >= 0 && atmX <= innerW) {
                g.append('line')
                    .attr('x1', atmX).attr('x2', atmX)
                    .attr('y1', 0).attr('y2', innerH)
                    .attr('stroke', tokens.textMuted).attr('stroke-width', 0.5)
                    .attr('stroke-dasharray', '3,3');
            }
        }

        const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d => spot > 0 ? d.toFixed(2) : `$${d}`);
        const yAxis = d3.axisLeft(y).ticks(4).tickFormat(d => `${(d * 100).toFixed(0)}%`);
        g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '8px').attr('font-family', tokens.fontMono);
        g.append('g').call(yAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono);
        g.selectAll('.domain').attr('stroke', tokens.cardBorder);
        g.selectAll('.tick line').attr('stroke', tokens.cardBorder);
    }, [surface, spot]);

    useEffect(() => {
        drawChart();
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    if (!surface || surface.length === 0) return null;

    const getDTE = (d) => d.dte ?? d.days_to_expiry ?? 0;
    const dtes = [...new Set(surface.map(getDTE))].sort((a, b) => a - b).slice(0, 3);
    const colors = [tokens.accent, tokens.purple, tokens.caution];

    return (
        <div ref={containerRef}>
            <svg ref={svgRef} />
            <div style={styles.legend}>
                {dtes.map((dte, i) => (
                    <div key={dte} style={styles.legendItem}>
                        <div style={{ ...styles.legendDot, background: colors[i] }} />
                        <span>{dte}d DTE</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function VolSurface() {
    const { selectedTicker } = useStore();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        api.getVolSurface(selectedTicker)
            .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [selectedTicker]);

    const surface = data?.surface || [];
    const spot = data?.spot;
    const nPoints = surface.length;
    const getIV = (d) => d.iv ?? d.implied_vol ?? d.mid_iv ?? 0;
    const getDTE = (d) => d.dte ?? d.days_to_expiry ?? 0;
    const expiries = surface.length > 0 ? [...new Set(surface.map(getDTE))].length : 0;
    const strikes = surface.length > 0 ? [...new Set(surface.map(d => d.strike))].length : 0;
    const ivVals = surface.map(getIV).filter(v => v > 0);
    const avgIV = ivVals.length > 0 ? ivVals.reduce((a, b) => a + b, 0) / ivVals.length : null;

    // Compute simple skew metric if possible
    const skew = data?.skew ?? null;
    const skewNarrative = skew != null ? interpretSkew(skew) : null;

    return (
        <div>
            <TickerSelector />
            <div style={styles.container}>
                <div style={styles.header}>Volatility Surface</div>
                {loading && <div style={styles.loading}>Loading vol surface...</div>}
                {error && <div style={styles.error}>{error}</div>}
                {!loading && !error && (
                    <>
                        {/* Stats */}
                        <div style={styles.statsRow}>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Grid Points</div>
                                <div style={styles.statValue}>{nPoints}</div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Expiries</div>
                                <div style={styles.statValue}>{expiries}</div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Strikes</div>
                                <div style={styles.statValue}>{strikes}</div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Avg IV</div>
                                <div style={{ ...styles.statValue, color: tokens.accent }}>
                                    {avgIV != null ? `${(avgIV * 100).toFixed(1)}%` : '--'}
                                </div>
                            </div>
                        </div>

                        {/* Heatmap */}
                        <div style={styles.chartContainer}>
                            <div style={styles.chartTitle}>IV Heatmap — Moneyness x DTE</div>
                            <VolSurfaceHeatmap surface={surface} spot={spot} />
                        </div>

                        {/* Skew Panel */}
                        <div style={styles.skewPanel}>
                            <div style={styles.chartTitle}>IV Skew by Expiry</div>
                            <SkewChart surface={surface} spot={spot} />
                        </div>

                        {/* Interpretation */}
                        {skewNarrative && skewNarrative.text && (
                            <div style={styles.interpretation}>
                                {skewNarrative.text}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default VolSurface;

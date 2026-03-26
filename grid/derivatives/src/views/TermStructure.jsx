import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import useStore from '../store.js';
import api from '../api.js';
import TickerSelector from '../components/TickerSelector.jsx';
import { tokens } from '../styles/tokens.js';
import { interpretTermStructure } from '../lib/interpret.js';

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
    legend: {
        display: 'flex', gap: tokens.spacing.lg, flexWrap: 'wrap',
        padding: `${tokens.spacing.xs} ${tokens.spacing.lg} ${tokens.spacing.md}`,
        fontSize: '9px', fontFamily: tokens.fontMono, color: tokens.textMuted,
    },
    legendItem: {
        display: 'flex', alignItems: 'center', gap: tokens.spacing.xs,
    },
    legendDot: {
        width: '8px', height: '3px', borderRadius: '1px',
    },
    interpretation: {
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.lg,
        fontSize: '12px', lineHeight: '1.7',
        color: tokens.text, fontFamily: tokens.fontMono,
        marginBottom: tokens.spacing.lg,
    },
    table: {
        width: '100%', borderCollapse: 'collapse', fontFamily: tokens.fontMono, fontSize: '11px',
    },
    th: {
        padding: `${tokens.spacing.sm} ${tokens.spacing.xs}`, textAlign: 'right',
        color: tokens.textMuted, fontWeight: 500, fontSize: '9px', letterSpacing: '1px',
        borderBottom: `1px solid ${tokens.cardBorder}`, textTransform: 'uppercase',
    },
    td: {
        padding: `${tokens.spacing.xs}`, textAlign: 'right', color: tokens.text,
        borderBottom: `1px solid rgba(0,212,170,0.05)`,
    },
    noData: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '280px', color: tokens.textMuted,
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

function TermCurveChart({ points }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    const drawChart = useCallback(() => {
        if (!points || points.length === 0 || !svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = 280;
        const margin = { top: 16, right: 16, bottom: 36, left: 56 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const sorted = [...points].sort((a, b) => (a.dte || 0) - (b.dte || 0));
        const getDTE = d => d.dte || 0;
        const getATM = d => d.iv_atm ?? d.atm_iv ?? 0;
        const get25Put = d => d.iv_25d_put ?? d.put_25d ?? null;
        const get25Call = d => d.iv_25d_call ?? d.call_25d ?? null;

        const xExtent = d3.extent(sorted, getDTE);
        const allIVs = sorted.flatMap(d => [getATM(d), get25Put(d), get25Call(d)]).filter(v => v != null && v > 0);
        const yExtent = d3.extent(allIVs);
        if (!yExtent[0]) return;
        const yPad = (yExtent[1] - yExtent[0]) * 0.15;

        const x = d3.scaleLinear().domain(xExtent).range([0, innerW]);
        const y = d3.scaleLinear().domain([yExtent[0] - yPad, yExtent[1] + yPad]).range([innerH, 0]);

        // Area fill under ATM
        const area = d3.area()
            .x(d => x(getDTE(d)))
            .y0(innerH)
            .y1(d => y(getATM(d)))
            .curve(d3.curveMonotoneX);
        g.append('path').datum(sorted.filter(d => getATM(d) > 0)).attr('d', area)
            .attr('fill', 'rgba(0, 212, 170, 0.08)');

        // ATM IV line
        const atmLine = d3.line()
            .x(d => x(getDTE(d)))
            .y(d => y(getATM(d)))
            .defined(d => getATM(d) > 0)
            .curve(d3.curveMonotoneX);
        g.append('path').datum(sorted).attr('d', atmLine)
            .attr('fill', 'none').attr('stroke', tokens.accent).attr('stroke-width', 2);

        // ATM dots
        g.selectAll('.atm-dot').data(sorted.filter(d => getATM(d) > 0)).enter()
            .append('circle')
            .attr('cx', d => x(getDTE(d))).attr('cy', d => y(getATM(d)))
            .attr('r', 3).attr('fill', tokens.accent);

        // 25d Put IV line
        const putPoints = sorted.filter(d => get25Put(d) != null && get25Put(d) > 0);
        if (putPoints.length > 1) {
            const putLine = d3.line()
                .x(d => x(getDTE(d)))
                .y(d => y(get25Put(d)))
                .curve(d3.curveMonotoneX);
            g.append('path').datum(putPoints).attr('d', putLine)
                .attr('fill', 'none').attr('stroke', tokens.danger).attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,3');
        }

        // 25d Call IV line
        const callPoints = sorted.filter(d => get25Call(d) != null && get25Call(d) > 0);
        if (callPoints.length > 1) {
            const callLine = d3.line()
                .x(d => x(getDTE(d)))
                .y(d => y(get25Call(d)))
                .curve(d3.curveMonotoneX);
            g.append('path').datum(callPoints).attr('d', callLine)
                .attr('fill', 'none').attr('stroke', tokens.safe).attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,3');
        }

        // Highlight inverted segments
        for (let i = 1; i < sorted.length; i++) {
            const prev = getATM(sorted[i - 1]);
            const curr = getATM(sorted[i]);
            if (prev > 0 && curr > 0 && prev > curr) {
                // Inverted: near-term vol is higher
                g.append('line')
                    .attr('x1', x(getDTE(sorted[i - 1])))
                    .attr('x2', x(getDTE(sorted[i])))
                    .attr('y1', y(prev))
                    .attr('y2', y(curr))
                    .attr('stroke', tokens.danger)
                    .attr('stroke-width', 2.5);
            }
        }

        // Axes
        const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d => `${d}d`);
        const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d => `${(d * 100).toFixed(0)}%`);
        g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono);
        g.append('g').call(yAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono);
        g.selectAll('.domain').attr('stroke', tokens.cardBorder);
        g.selectAll('.tick line').attr('stroke', tokens.cardBorder);

        // Crosshair
        const crosshairGroup = g.append('g').style('display', 'none');
        crosshairGroup.append('line').attr('class', 'ch-x')
            .attr('y1', 0).attr('y2', innerH)
            .attr('stroke', tokens.textMuted).attr('stroke-width', 0.5);
        crosshairGroup.append('circle')
            .attr('r', 4).attr('fill', 'none').attr('stroke', tokens.accent).attr('stroke-width', 1.5);

        const bisect = d3.bisector(d => getDTE(d)).left;

        const overlay = g.append('rect')
            .attr('width', innerW).attr('height', innerH)
            .attr('fill', 'none').attr('pointer-events', 'all')
            .style('cursor', 'crosshair');

        overlay.on('mousemove', (event) => {
            const [mx] = d3.pointer(event);
            const dteVal = x.invert(mx);
            const validSorted = sorted.filter(d => getATM(d) > 0);
            if (validSorted.length === 0) return;
            const idx = bisect(validSorted, dteVal, 1);
            const d0 = validSorted[idx - 1];
            const d1 = validSorted[idx];
            if (!d0) return;
            const d = d1 && (dteVal - getDTE(d0) > getDTE(d1) - dteVal) ? d1 : d0;

            crosshairGroup.style('display', null);
            crosshairGroup.select('.ch-x').attr('x1', x(getDTE(d))).attr('x2', x(getDTE(d)));
            crosshairGroup.select('circle').attr('cx', x(getDTE(d))).attr('cy', y(getATM(d)));

            const parts = [`DTE=${getDTE(d)}`, `ATM=${(getATM(d) * 100).toFixed(1)}%`];
            if (get25Put(d)) parts.push(`25dP=${(get25Put(d) * 100).toFixed(1)}%`);
            if (get25Call(d)) parts.push(`25dC=${(get25Call(d) * 100).toFixed(1)}%`);

            setTooltip({
                left: margin.left + x(getDTE(d)) + 12,
                top: margin.top + y(getATM(d)) - 16,
                text: parts.join(' | '),
            });
        });
        overlay.on('mouseleave', () => {
            crosshairGroup.style('display', 'none');
            setTooltip(null);
        });
    }, [points]);

    useEffect(() => {
        drawChart();
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    if (!points || points.length === 0) {
        return <div style={styles.noData}>No term structure data available</div>;
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

function TermStructure() {
    const { selectedTicker } = useStore();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        api.getTermStructure(selectedTicker)
            .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [selectedTicker]);

    const points = data?.term_structure || [];

    // Compute slope / inversion
    const sorted = [...points].sort((a, b) => (a.dte || 0) - (b.dte || 0));
    const getATM = d => d.iv_atm ?? d.atm_iv ?? 0;
    const validPoints = sorted.filter(d => getATM(d) > 0);
    let slope = null;
    let isInverted = false;
    if (validPoints.length >= 2) {
        const first = getATM(validPoints[0]);
        const last = getATM(validPoints[validPoints.length - 1]);
        slope = ((last - first) / first) * 100;
        isInverted = slope < 0;
    }

    const narrative = slope != null ? interpretTermStructure(slope, isInverted) : '';

    return (
        <div>
            <TickerSelector />
            <div style={styles.container}>
                <div style={styles.header}>IV Term Structure</div>
                {loading && <div style={styles.loading}>Loading term structure...</div>}
                {error && <div style={styles.error}>{error}</div>}
                {!loading && !error && (
                    <>
                        {/* Interpretation at top */}
                        {narrative && (
                            <div style={styles.interpretation}>
                                {isInverted && (
                                    <span style={{ color: tokens.danger, fontWeight: 700 }}>INVERTED </span>
                                )}
                                {narrative}
                            </div>
                        )}

                        {/* Chart */}
                        <div style={styles.chartContainer}>
                            <div style={styles.chartTitle}>ATM IV by Days to Expiry</div>
                            <TermCurveChart points={points} />
                            <div style={styles.legend}>
                                <div style={styles.legendItem}>
                                    <div style={{ ...styles.legendDot, background: tokens.accent }} />
                                    <span>ATM IV</span>
                                </div>
                                <div style={styles.legendItem}>
                                    <div style={{ ...styles.legendDot, background: tokens.danger }} />
                                    <span>25d Put</span>
                                </div>
                                <div style={styles.legendItem}>
                                    <div style={{ ...styles.legendDot, background: tokens.safe }} />
                                    <span>25d Call</span>
                                </div>
                                <div style={styles.legendItem}>
                                    <div style={{ ...styles.legendDot, background: tokens.danger, height: '3px' }} />
                                    <span style={{ color: tokens.danger }}>Inverted segment</span>
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        {points.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={{ ...styles.th, textAlign: 'left' }}>Expiry</th>
                                            <th style={styles.th}>DTE</th>
                                            <th style={styles.th}>IV ATM</th>
                                            <th style={styles.th}>25d Put</th>
                                            <th style={styles.th}>25d Call</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {points.map((p, i) => (
                                            <tr key={i}>
                                                <td style={{ ...styles.td, textAlign: 'left', color: tokens.textBright }}>
                                                    {p.expiry || '--'}
                                                </td>
                                                <td style={styles.td}>{p.dte != null ? p.dte : '--'}</td>
                                                <td style={{ ...styles.td, color: tokens.accent, fontWeight: 600 }}>
                                                    {getATM(p) > 0 ? `${(getATM(p) * 100).toFixed(1)}%` : '--'}
                                                </td>
                                                <td style={styles.td}>
                                                    {p.iv_25d_put != null ? `${(p.iv_25d_put * 100).toFixed(1)}%` : '--'}
                                                </td>
                                                <td style={styles.td}>
                                                    {p.iv_25d_call != null ? `${(p.iv_25d_call * 100).toFixed(1)}%` : '--'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default TermStructure;

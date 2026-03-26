import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import useStore from '../store.js';
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
    detailPanel: {
        background: tokens.bgSecondary,
        border: `1px solid ${tokens.accent}`,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.lg,
        marginBottom: tokens.spacing.lg,
        fontFamily: tokens.fontMono,
        fontSize: '11px',
    },
    detailRow: {
        display: 'flex', justifyContent: 'space-between',
        padding: `${tokens.spacing.xs} 0`,
        borderBottom: `1px solid rgba(0,212,170,0.05)`,
    },
    detailLabel: { color: tokens.textMuted },
    detailValue: { color: tokens.textBright, fontWeight: 600 },
    noData: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '400px', color: tokens.textMuted,
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

function OIHeatmapChart({ heatmap, mode, onCellClick }) {
    const svgRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    const drawChart = useCallback(() => {
        if (!heatmap || heatmap.length === 0 || !svgRef.current || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = 400;
        const margin = { top: 16, right: 80, bottom: 48, left: 60 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const getOI = (d) => {
            if (mode === 'calls') return d.call_oi ?? 0;
            if (mode === 'puts') return d.put_oi ?? 0;
            return (d.call_oi ?? 0) + (d.put_oi ?? 0);
        };

        const strikes = [...new Set(heatmap.map(d => d.strike))].sort((a, b) => a - b);
        const expiries = [...new Set(heatmap.map(d => d.expiry))].sort();

        const x = d3.scaleBand().domain(strikes).range([0, innerW]).padding(0.02);
        const y = d3.scaleBand().domain(expiries).range([0, innerH]).padding(0.02);

        const allOI = heatmap.map(getOI).filter(v => v > 0);
        const maxOI = d3.max(allOI) || 1;

        // Color scale
        const colorScale = mode === 'calls'
            ? d3.scaleSequential(d3.interpolateGreens).domain([0, maxOI])
            : mode === 'puts'
            ? d3.scaleSequential(d3.interpolateReds).domain([0, maxOI])
            : d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxOI]);

        // Build lookup
        const lookup = {};
        for (const d of heatmap) {
            lookup[`${d.strike}_${d.expiry}`] = d;
        }

        // Draw cells
        for (const s of strikes) {
            for (const e of expiries) {
                const d = lookup[`${s}_${e}`];
                if (!d) continue;
                const oi = getOI(d);
                if (oi <= 0) continue;

                g.append('rect')
                    .attr('x', x(s))
                    .attr('y', y(e))
                    .attr('width', x.bandwidth())
                    .attr('height', y.bandwidth())
                    .attr('fill', colorScale(oi))
                    .attr('rx', 1)
                    .attr('opacity', 0.85)
                    .style('cursor', 'pointer')
                    .on('click', () => {
                        if (onCellClick) onCellClick(d);
                    });
            }
        }

        // Axes
        const nXTicks = Math.max(1, Math.floor(strikes.length / 8));
        const xAxis = d3.axisBottom(x)
            .tickValues(strikes.filter((_, i) => i % nXTicks === 0))
            .tickFormat(d => `$${d}`);
        g.append('g').attr('transform', `translate(0,${innerH})`).call(xAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '8px')
            .attr('font-family', tokens.fontMono).attr('transform', 'rotate(-35)').attr('text-anchor', 'end');

        const nYTicks = Math.max(1, Math.floor(expiries.length / 8));
        const yAxis = d3.axisLeft(y)
            .tickValues(expiries.filter((_, i) => i % nYTicks === 0));
        g.append('g').call(yAxis)
            .selectAll('text').attr('fill', tokens.textMuted).attr('font-size', '8px').attr('font-family', tokens.fontMono);

        g.selectAll('.domain').attr('stroke', tokens.cardBorder);
        g.selectAll('.tick line').attr('stroke', tokens.cardBorder);

        // Axis labels
        svg.append('text')
            .attr('x', margin.left + innerW / 2).attr('y', height - 2)
            .attr('text-anchor', 'middle')
            .attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono)
            .text('Strike');
        svg.append('text')
            .attr('transform', `translate(12, ${margin.top + innerH / 2}) rotate(-90)`)
            .attr('text-anchor', 'middle')
            .attr('fill', tokens.textMuted).attr('font-size', '9px').attr('font-family', tokens.fontMono)
            .text('Expiry');

        // Color legend
        const legendW = 12;
        const legendH = innerH;
        const legendG = svg.append('g')
            .attr('transform', `translate(${width - margin.right + 16}, ${margin.top})`);

        const nSteps = 30;
        for (let i = 0; i < nSteps; i++) {
            const v = (i / (nSteps - 1)) * maxOI;
            legendG.append('rect')
                .attr('x', 0).attr('y', legendH - (i + 1) * legendH / nSteps)
                .attr('width', legendW).attr('height', legendH / nSteps + 1)
                .attr('fill', colorScale(v));
        }
        legendG.append('text')
            .attr('x', legendW + 4).attr('y', 8)
            .attr('fill', tokens.textMuted).attr('font-size', '8px').attr('font-family', tokens.fontMono)
            .text(maxOI >= 1000 ? `${(maxOI / 1000).toFixed(0)}K` : maxOI.toFixed(0));
        legendG.append('text')
            .attr('x', legendW + 4).attr('y', legendH)
            .attr('fill', tokens.textMuted).attr('font-size', '8px').attr('font-family', tokens.fontMono)
            .text('0');
        legendG.append('text')
            .attr('x', legendW / 2).attr('y', -6).attr('text-anchor', 'middle')
            .attr('fill', tokens.textMuted).attr('font-size', '7px').attr('font-family', tokens.fontMono)
            .text('OI');

        // Hover
        const overlay = g.append('rect')
            .attr('width', innerW).attr('height', innerH)
            .attr('fill', 'none').attr('pointer-events', 'all')
            .style('cursor', 'crosshair');

        overlay.on('mousemove', (event) => {
            const [mx, my] = d3.pointer(event);
            // Find closest cell
            let closestStrike = null;
            let closestExpiry = null;
            let minDist = Infinity;

            for (const s of strikes) {
                const cx = x(s) + x.bandwidth() / 2;
                const dx = Math.abs(cx - mx);
                if (dx > x.bandwidth()) continue;
                for (const e of expiries) {
                    const cy = y(e) + y.bandwidth() / 2;
                    const dist = dx + Math.abs(cy - my);
                    if (dist < minDist) {
                        minDist = dist;
                        closestStrike = s;
                        closestExpiry = e;
                    }
                }
            }

            if (closestStrike != null && closestExpiry != null) {
                const d = lookup[`${closestStrike}_${closestExpiry}`];
                if (d) {
                    const oi = getOI(d);
                    setTooltip({
                        left: margin.left + x(closestStrike) + x.bandwidth() + 8,
                        top: margin.top + y(closestExpiry),
                        text: `$${closestStrike} | ${closestExpiry} | OI=${oi.toLocaleString()}`,
                    });
                }
            }
        });
        overlay.on('mouseleave', () => setTooltip(null));
    }, [heatmap, mode, onCellClick]);

    useEffect(() => {
        drawChart();
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    if (!heatmap || heatmap.length === 0) {
        return <div style={styles.noData}>No OI heatmap data available</div>;
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

function PositionHeatmap() {
    const { selectedTicker } = useStore();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState('net');
    const [selectedCell, setSelectedCell] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        api.getOIHeatmap(selectedTicker)
            .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [selectedTicker]);

    const heatmap = data?.heatmap || [];
    const totalCallOI = heatmap.reduce((s, c) => s + (c.call_oi || 0), 0);
    const totalPutOI = heatmap.reduce((s, c) => s + (c.put_oi || 0), 0);
    const pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI) : 0;

    return (
        <div>
            <TickerSelector />
            <div style={styles.container}>
                <div style={styles.header}>Open Interest Heatmap</div>
                {loading && <div style={styles.loading}>Loading OI heatmap...</div>}
                {error && <div style={styles.error}>{error}</div>}
                {!loading && !error && (
                    <>
                        {/* Stats */}
                        <div style={styles.statsRow}>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Total Call OI</div>
                                <div style={{ ...styles.statValue, color: tokens.safe }}>
                                    {totalCallOI.toLocaleString()}
                                </div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Total Put OI</div>
                                <div style={{ ...styles.statValue, color: tokens.danger }}>
                                    {totalPutOI.toLocaleString()}
                                </div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>P/C Ratio</div>
                                <div style={styles.statValue}>{pcr > 0 ? pcr.toFixed(2) : '--'}</div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Grid Cells</div>
                                <div style={styles.statValue}>{heatmap.length}</div>
                            </div>
                        </div>

                        {/* Detail panel for clicked cell */}
                        {selectedCell && (
                            <div style={styles.detailPanel}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: tokens.spacing.sm }}>
                                    <span style={{ color: tokens.accent, fontWeight: 700 }}>
                                        ${selectedCell.strike} | {selectedCell.expiry}
                                    </span>
                                    <button
                                        onClick={() => setSelectedCell(null)}
                                        style={{ background: 'none', border: 'none', color: tokens.textMuted, cursor: 'pointer', fontFamily: tokens.fontMono, fontSize: '10px' }}
                                    >
                                        CLOSE
                                    </button>
                                </div>
                                <div style={styles.detailRow}>
                                    <span style={styles.detailLabel}>Call OI</span>
                                    <span style={{ ...styles.detailValue, color: tokens.safe }}>{(selectedCell.call_oi || 0).toLocaleString()}</span>
                                </div>
                                <div style={styles.detailRow}>
                                    <span style={styles.detailLabel}>Put OI</span>
                                    <span style={{ ...styles.detailValue, color: tokens.danger }}>{(selectedCell.put_oi || 0).toLocaleString()}</span>
                                </div>
                                <div style={styles.detailRow}>
                                    <span style={styles.detailLabel}>Call Volume</span>
                                    <span style={styles.detailValue}>{(selectedCell.call_volume || 0).toLocaleString()}</span>
                                </div>
                                <div style={styles.detailRow}>
                                    <span style={styles.detailLabel}>Put Volume</span>
                                    <span style={styles.detailValue}>{(selectedCell.put_volume || 0).toLocaleString()}</span>
                                </div>
                                {selectedCell.call_iv != null && (
                                    <div style={styles.detailRow}>
                                        <span style={styles.detailLabel}>Call IV</span>
                                        <span style={styles.detailValue}>{(selectedCell.call_iv * 100).toFixed(1)}%</span>
                                    </div>
                                )}
                                {selectedCell.put_iv != null && (
                                    <div style={styles.detailRow}>
                                        <span style={styles.detailLabel}>Put IV</span>
                                        <span style={styles.detailValue}>{(selectedCell.put_iv * 100).toFixed(1)}%</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Heatmap with tabs */}
                        <div style={styles.chartContainer}>
                            <div style={styles.chartTitle}>OI by Strike x Expiry</div>
                            <div style={styles.tabRow}>
                                {[
                                    { key: 'net', label: 'Total' },
                                    { key: 'calls', label: 'Calls' },
                                    { key: 'puts', label: 'Puts' },
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
                            <OIHeatmapChart
                                heatmap={heatmap}
                                mode={mode}
                                onCellClick={setSelectedCell}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default PositionHeatmap;

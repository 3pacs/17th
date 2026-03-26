/**
 * Derivatives View — Vol surface, skew, term structure, and GEX visualization.
 *
 * Layout: Ticker selector at top, 2x2 grid of charts.
 * VolSurface3D | VolSkewChart
 * TermStructureChart | GEX bar chart
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { api } from '../api.js';
import { shared, colors } from '../styles/shared.js';
import VolSurface3D from '../components/VolSurface3D.jsx';
import VolSkewChart from '../components/VolSkewChart.jsx';
import TermStructureChart from '../components/TermStructureChart.jsx';

const TICKERS = ['SPY', 'QQQ', 'IWM', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'MSFT', 'META', 'GOOGL'];

const COLORS = {
    bg: '#0a0e14',
    surface: '#111820',
    border: '#1e2a38',
    text: '#c8d6e5',
    textMuted: '#5a7080',
    accent: '#4fc3f7',
    green: '#22C55E',
    red: '#EF4444',
    amber: '#F59E0B',
};

const styles = {
    container: {
        padding: '16px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        maxWidth: '1200px',
        margin: '0 auto',
    },
    header: {
        fontSize: '22px',
        fontWeight: 600,
        color: '#E8F0F8',
        marginBottom: '16px',
        fontFamily: "'IBM Plex Sans', sans-serif",
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '12px',
    },
    chartCard: {
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        padding: '12px',
        overflow: 'hidden',
    },
    chartTitle: {
        fontSize: '12px',
        fontWeight: 700,
        color: '#E8F0F8',
        marginBottom: '8px',
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.5px',
    },
    selector: {
        display: 'flex',
        gap: '6px',
        marginBottom: '16px',
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    tickerBtn: (active) => ({
        padding: '8px 14px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 700,
        cursor: 'pointer',
        border: 'none',
        fontFamily: "'JetBrains Mono', monospace",
        background: active ? colors.accent : colors.card,
        color: active ? '#fff' : colors.textMuted,
        minHeight: '36px',
        transition: 'all 0.15s ease',
    }),
    loadingState: {
        textAlign: 'center',
        padding: '60px 20px',
        color: colors.textMuted,
        fontSize: '14px',
    },
    emptyState: {
        textAlign: 'center',
        padding: '40px 20px',
        color: colors.textMuted,
        fontSize: '13px',
    },
    spotBanner: {
        display: 'flex',
        gap: '16px',
        marginBottom: '12px',
        flexWrap: 'wrap',
    },
    spotMetric: {
        background: colors.bg,
        borderRadius: '8px',
        padding: '8px 14px',
        textAlign: 'center',
    },
    spotLabel: {
        fontSize: '10px',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    spotValue: {
        fontSize: '16px',
        fontWeight: 700,
        color: '#E8F0F8',
        fontFamily: "'JetBrains Mono', monospace",
        marginTop: '2px',
    },
};

function GexBarChart({ data, width = 500, height = 300 }) {
    const svgRef = useRef(null);

    const perStrike = data?.per_strike || data?.profile || [];
    const spot = data?.spot || 0;

    useEffect(() => {
        if (!svgRef.current || perStrike.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const margin = { top: 16, right: 16, bottom: 36, left: 56 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // Filter to top N by absolute GEX
        const sorted = [...perStrike]
            .filter(d => d.strike && d.gex != null)
            .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
            .slice(0, 30)
            .sort((a, b) => a.strike - b.strike);

        if (sorted.length === 0) return;

        const x = d3.scaleBand()
            .domain(sorted.map(d => d.strike))
            .range([0, w])
            .padding(0.15);

        const maxAbs = d3.max(sorted, d => Math.abs(d.gex)) || 1;
        const y = d3.scaleLinear()
            .domain([-maxAbs, maxAbs])
            .range([h, 0]);

        // Zero line
        g.append('line')
            .attr('x1', 0).attr('x2', w)
            .attr('y1', y(0)).attr('y2', y(0))
            .attr('stroke', COLORS.border)
            .attr('stroke-width', 1);

        // Bars
        g.selectAll('rect')
            .data(sorted)
            .join('rect')
            .attr('x', d => x(d.strike))
            .attr('y', d => d.gex >= 0 ? y(d.gex) : y(0))
            .attr('width', x.bandwidth())
            .attr('height', d => Math.abs(y(0) - y(d.gex)))
            .attr('fill', d => d.gex >= 0 ? COLORS.green : COLORS.red)
            .attr('opacity', 0.8)
            .attr('rx', 1);

        // Spot price marker
        if (spot > 0) {
            const spotX = sorted.reduce((closest, d) =>
                Math.abs(d.strike - spot) < Math.abs(closest.strike - spot) ? d : closest
            );
            if (spotX) {
                g.append('line')
                    .attr('x1', x(spotX.strike) + x.bandwidth() / 2)
                    .attr('y1', 0)
                    .attr('x2', x(spotX.strike) + x.bandwidth() / 2)
                    .attr('y2', h)
                    .attr('stroke', COLORS.amber)
                    .attr('stroke-width', 1.5)
                    .attr('stroke-dasharray', '4,3');
            }
        }

        // Axes
        const tickValues = sorted.filter((_, i) => i % Math.ceil(sorted.length / 8) === 0).map(d => d.strike);
        const xAxis = g.append('g').attr('transform', `translate(0,${h})`).call(
            d3.axisBottom(x).tickValues(tickValues).tickFormat(d => `$${d}`)
        );
        xAxis.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '9px')
            .attr('transform', 'rotate(-30)').attr('text-anchor', 'end');
        xAxis.selectAll('line, path').attr('stroke', COLORS.border);

        const yAxis = g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => {
            if (Math.abs(d) >= 1e9) return `${(d / 1e9).toFixed(1)}B`;
            if (Math.abs(d) >= 1e6) return `${(d / 1e6).toFixed(1)}M`;
            if (Math.abs(d) >= 1e3) return `${(d / 1e3).toFixed(0)}K`;
            return d.toFixed(0);
        }));
        yAxis.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
        yAxis.selectAll('line, path').attr('stroke', COLORS.border);

    }, [perStrike, spot, width, height]);

    if (perStrike.length === 0) {
        return (
            <div style={{
                width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: COLORS.textMuted, fontSize: 13, background: COLORS.bg, borderRadius: 8,
            }}>
                No GEX data available
            </div>
        );
    }

    return (
        <svg ref={svgRef} width={width} height={height}
            style={{ background: COLORS.bg, borderRadius: 8 }} />
    );
}

export default function Derivatives() {
    const [ticker, setTicker] = useState('SPY');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [surfaceData, setSurfaceData] = useState(null);
    const [skewData, setSkewData] = useState(null);
    const [termData, setTermData] = useState(null);
    const [gexData, setGexData] = useState(null);
    const [highlightDte, setHighlightDte] = useState(null);

    // Responsive chart sizing
    const [chartWidth, setChartWidth] = useState(500);
    const containerRef = useRef(null);

    useEffect(() => {
        const measure = () => {
            if (containerRef.current) {
                const cw = containerRef.current.offsetWidth;
                // For 2-column layout, each chart gets ~half minus gaps and padding
                const cols = cw >= 720 ? 2 : 1;
                setChartWidth(Math.floor((cw - (cols === 2 ? 36 : 24)) / cols));
            }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        setHighlightDte(null);

        try {
            const [surf, skew, term, gex] = await Promise.all([
                api.getVolSurface(ticker).catch(() => null),
                api.getSkew(ticker).catch(() => null),
                api.getTermStructure(ticker).catch(() => null),
                api.getGexProfile(ticker).catch(() => null),
            ]);
            setSurfaceData(surf);
            setSkewData(skew);
            setTermData(term);
            setGexData(gex);
        } catch (e) {
            setError('Failed to load derivatives data');
        }
        setLoading(false);
    }, [ticker]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSliceSelect = (dte) => {
        setHighlightDte(dte);
    };

    return (
        <div style={styles.container} ref={containerRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={styles.header}>Derivatives</div>
            </div>

            {/* Ticker selector */}
            <div style={styles.selector}>
                {TICKERS.map(t => (
                    <button
                        key={t}
                        style={styles.tickerBtn(t === ticker)}
                        onClick={() => setTicker(t)}
                    >
                        {t}
                    </button>
                ))}
                <button
                    style={{
                        ...shared.buttonSmall,
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: `1px solid ${colors.border}`,
                        color: colors.textMuted,
                        fontSize: '12px',
                    }}
                    onClick={loadData}
                >
                    Refresh
                </button>
            </div>

            {/* Spot/regime banner */}
            {(termData?.spot || gexData?.spot) && (
                <div style={styles.spotBanner}>
                    <div style={styles.spotMetric}>
                        <div style={styles.spotLabel}>Spot</div>
                        <div style={styles.spotValue}>
                            ${(termData?.spot || gexData?.spot || 0).toFixed(2)}
                        </div>
                    </div>
                    {gexData?.regime && (
                        <div style={styles.spotMetric}>
                            <div style={styles.spotLabel}>Dealer Regime</div>
                            <div style={{
                                ...styles.spotValue,
                                color: gexData.regime === 'LONG_GAMMA' ? COLORS.green
                                    : gexData.regime === 'SHORT_GAMMA' ? COLORS.red
                                    : COLORS.amber,
                                fontSize: '14px',
                            }}>
                                {gexData.regime}
                            </div>
                        </div>
                    )}
                    {gexData?.gamma_flip && (
                        <div style={styles.spotMetric}>
                            <div style={styles.spotLabel}>Gamma Flip</div>
                            <div style={styles.spotValue}>
                                ${gexData.gamma_flip.toFixed(0)}
                            </div>
                        </div>
                    )}
                    {surfaceData?.snap_date && (
                        <div style={styles.spotMetric}>
                            <div style={styles.spotLabel}>Snap Date</div>
                            <div style={{ ...styles.spotValue, fontSize: '13px' }}>
                                {surfaceData.snap_date}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {loading && <div style={styles.loadingState}>Loading {ticker} derivatives data...</div>}

            {error && (
                <div style={styles.emptyState}>
                    <div style={{ color: colors.red, marginBottom: '12px' }}>{error}</div>
                    <button style={shared.buttonSmall} onClick={loadData}>Retry</button>
                </div>
            )}

            {!loading && !error && (
                <div style={styles.grid}>
                    {/* Vol Surface */}
                    <div style={styles.chartCard}>
                        <div style={styles.chartTitle}>VOL SURFACE</div>
                        <VolSurface3D
                            data={surfaceData}
                            width={chartWidth}
                            height={320}
                            onSliceSelect={handleSliceSelect}
                        />
                    </div>

                    {/* Skew */}
                    <div style={styles.chartCard}>
                        <div style={styles.chartTitle}>SKEW CURVES</div>
                        <VolSkewChart
                            data={skewData}
                            width={chartWidth}
                            height={320}
                            highlightDte={highlightDte}
                        />
                    </div>

                    {/* Term Structure */}
                    <div style={styles.chartCard}>
                        <div style={styles.chartTitle}>TERM STRUCTURE</div>
                        <TermStructureChart
                            data={termData}
                            width={chartWidth}
                            height={300}
                        />
                    </div>

                    {/* GEX Profile */}
                    <div style={styles.chartCard}>
                        <div style={styles.chartTitle}>GAMMA EXPOSURE (GEX)</div>
                        <GexBarChart
                            data={gexData}
                            width={chartWidth}
                            height={300}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

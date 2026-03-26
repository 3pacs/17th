/**
 * VolSurface3D — 2D heatmap with D3 contour lines for implied volatility.
 *
 * X = moneyness (strike/spot), Y = DTE
 * Color scale: d3.interpolateInferno mapped to IV range
 * Contour lines at key IV levels
 * Hover shows exact strike/DTE/IV/OI
 * Click DTE slice to highlight that expiry's skew
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

const COLORS = {
    bg: '#0a0e14',
    surface: '#111820',
    border: '#1e2a38',
    text: '#c8d6e5',
    textMuted: '#5a7080',
    accent: '#4fc3f7',
    spot: '#F59E0B',
};

export default function VolSurface3D({ data, width = 600, height = 400, onSliceSelect }) {
    const svgRef = useRef(null);
    const tooltipRef = useRef(null);
    const [selectedDte, setSelectedDte] = useState(null);

    const surface = data?.surface || [];
    const spot = data?.spot || 0;
    const snapDate = data?.snap_date || '';

    useEffect(() => {
        if (!svgRef.current || surface.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const margin = { top: 24, right: 20, bottom: 40, left: 50 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // Compute moneyness
        const spotPrice = spot || d3.median(surface, d => d.strike) || 1;
        const points = surface.map(d => ({
            ...d,
            moneyness: d.strike / spotPrice,
        }));

        const mExtent = d3.extent(points, d => d.moneyness);
        const dteExtent = d3.extent(points, d => d.dte);
        const ivExtent = d3.extent(points, d => d.iv);

        // Clamp moneyness to reasonable range
        const mMin = Math.max(mExtent[0], 0.7);
        const mMax = Math.min(mExtent[1], 1.3);
        const filtered = points.filter(d => d.moneyness >= mMin && d.moneyness <= mMax);
        if (filtered.length === 0) return;

        const x = d3.scaleLinear().domain([mMin, mMax]).range([0, w]);
        const y = d3.scaleLinear().domain([dteExtent[0], Math.min(dteExtent[1], 365)]).range([h, 0]);
        const color = d3.scaleSequential(d3.interpolateInferno)
            .domain([ivExtent[0] || 0, ivExtent[1] || 1]);

        // Build grid for contour generation
        const gridW = 60;
        const gridH = 40;
        const mStep = (mMax - mMin) / gridW;
        const dteMin = dteExtent[0];
        const dteMax = Math.min(dteExtent[1], 365);
        const dStep = (dteMax - dteMin) / gridH;

        const gridValues = new Array(gridW * gridH).fill(0);

        // Nearest-neighbor interpolation onto grid
        for (let j = 0; j < gridH; j++) {
            for (let i = 0; i < gridW; i++) {
                const gm = mMin + (i + 0.5) * mStep;
                const gd = dteMin + (j + 0.5) * dStep;

                // Find nearest point
                let bestDist = Infinity;
                let bestIv = 0;
                for (const p of filtered) {
                    const dm = (p.moneyness - gm) / (mMax - mMin);
                    const dd = (p.dte - gd) / (dteMax - dteMin);
                    const dist = dm * dm + dd * dd;
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestIv = p.iv;
                    }
                }
                gridValues[j * gridW + i] = bestIv;
            }
        }

        // Draw heatmap cells
        for (let j = 0; j < gridH; j++) {
            for (let i = 0; i < gridW; i++) {
                const iv = gridValues[j * gridW + i];
                if (iv <= 0) continue;
                const cellM = mMin + i * mStep;
                const cellD = dteMin + j * dStep;
                g.append('rect')
                    .attr('x', x(cellM))
                    .attr('y', y(cellD + dStep))
                    .attr('width', Math.max(1, x(cellM + mStep) - x(cellM)))
                    .attr('height', Math.max(1, y(cellD) - y(cellD + dStep)))
                    .attr('fill', color(iv))
                    .attr('opacity', 0.85);
            }
        }

        // Contour lines
        const contourLevels = [];
        const ivMin = ivExtent[0] || 0;
        const ivMax = ivExtent[1] || 1;
        for (let lev = Math.ceil(ivMin * 10) / 10; lev <= ivMax; lev += 0.1) {
            contourLevels.push(lev);
        }

        const contours = d3.contours()
            .size([gridW, gridH])
            .thresholds(contourLevels)(gridValues);

        const contourPath = d3.geoPath()
            .projection(d3.geoTransform({
                point: function (px, py) {
                    const m = mMin + (px / gridW) * (mMax - mMin);
                    const d = dteMin + (py / gridH) * (dteMax - dteMin);
                    this.stream.point(x(m), y(d));
                }
            }));

        g.selectAll('path.contour')
            .data(contours)
            .join('path')
            .attr('class', 'contour')
            .attr('d', contourPath)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(255,255,255,0.25)')
            .attr('stroke-width', 0.5);

        // ATM line (moneyness = 1.0)
        if (mMin <= 1.0 && mMax >= 1.0) {
            g.append('line')
                .attr('x1', x(1.0)).attr('y1', 0)
                .attr('x2', x(1.0)).attr('y2', h)
                .attr('stroke', COLORS.spot)
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4,3')
                .attr('opacity', 0.8);

            g.append('text')
                .attr('x', x(1.0) + 4).attr('y', 12)
                .text('ATM')
                .style('fill', COLORS.spot)
                .style('font-size', '10px')
                .style('font-weight', 'bold');
        }

        // Selected DTE highlight
        if (selectedDte !== null) {
            g.append('line')
                .attr('x1', 0).attr('y1', y(selectedDte))
                .attr('x2', w).attr('y2', y(selectedDte))
                .attr('stroke', COLORS.accent)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '6,3')
                .attr('opacity', 0.9);
        }

        // Axes
        const xAxis = g.append('g').attr('transform', `translate(0,${h})`).call(
            d3.axisBottom(x).ticks(6).tickFormat(d => d.toFixed(2))
        );
        xAxis.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
        xAxis.selectAll('line, path').attr('stroke', COLORS.border);

        g.append('text')
            .attr('x', w / 2).attr('y', h + 32)
            .attr('text-anchor', 'middle')
            .style('fill', COLORS.textMuted).style('font-size', '10px')
            .text('Moneyness (K/S)');

        const yAxis = g.append('g').call(d3.axisLeft(y).ticks(6));
        yAxis.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
        yAxis.selectAll('line, path').attr('stroke', COLORS.border);

        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -h / 2).attr('y', -38)
            .attr('text-anchor', 'middle')
            .style('fill', COLORS.textMuted).style('font-size', '10px')
            .text('DTE');

        // Interactive overlay for hover and click
        const overlay = g.append('rect')
            .attr('width', w).attr('height', h)
            .attr('fill', 'transparent')
            .style('cursor', 'crosshair');

        overlay.on('mousemove', (event) => {
            const [mx, my] = d3.pointer(event);
            const hoverM = x.invert(mx);
            const hoverDte = y.invert(my);

            // Find nearest data point
            let best = null;
            let bestDist = Infinity;
            for (const p of filtered) {
                const dm = (p.moneyness - hoverM) * 100;
                const dd = (p.dte - hoverDte);
                const dist = dm * dm + dd * dd;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = p;
                }
            }

            if (best && tooltipRef.current) {
                tooltipRef.current.style.display = 'block';
                tooltipRef.current.style.left = `${mx + margin.left + 12}px`;
                tooltipRef.current.style.top = `${my + margin.top - 10}px`;
                tooltipRef.current.innerHTML =
                    `<div style="font-weight:700">$${best.strike.toFixed(0)} ${best.type || ''}</div>` +
                    `<div>DTE: ${best.dte}d</div>` +
                    `<div>IV: ${(best.iv * 100).toFixed(1)}%</div>` +
                    `<div>OI: ${(best.oi || 0).toLocaleString()}</div>`;
            }
        });

        overlay.on('mouseleave', () => {
            if (tooltipRef.current) tooltipRef.current.style.display = 'none';
        });

        overlay.on('click', (event) => {
            const [, my] = d3.pointer(event);
            const clickDte = Math.round(y.invert(my));
            // Find nearest expiry DTE
            const dtes = [...new Set(filtered.map(p => p.dte))];
            const nearest = dtes.reduce((a, b) =>
                Math.abs(b - clickDte) < Math.abs(a - clickDte) ? b : a
            );
            setSelectedDte(nearest);
            if (onSliceSelect) onSliceSelect(nearest);
        });

        // Color legend
        const legendW = 12;
        const legendH = h * 0.6;
        const legendY = (h - legendH) / 2;
        const legendG = g.append('g').attr('transform', `translate(${w + 4}, ${legendY})`);

        const legendScale = d3.scaleLinear().domain(ivExtent).range([legendH, 0]);
        const defs = svg.append('defs');
        const gradient = defs.append('linearGradient')
            .attr('id', 'vol-legend-grad')
            .attr('x1', '0%').attr('y1', '100%')
            .attr('x2', '0%').attr('y2', '0%');

        for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const iv = ivExtent[0] + t * (ivExtent[1] - ivExtent[0]);
            gradient.append('stop')
                .attr('offset', `${t * 100}%`)
                .attr('stop-color', color(iv));
        }

        legendG.append('rect')
            .attr('width', legendW).attr('height', legendH)
            .attr('fill', 'url(#vol-legend-grad)')
            .attr('rx', 2);

    }, [surface, spot, width, height, selectedDte]);

    if (surface.length === 0) {
        return (
            <div style={{
                width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: COLORS.textMuted, fontSize: 13, background: COLORS.bg, borderRadius: 8,
            }}>
                No vol surface data available
            </div>
        );
    }

    return (
        <div style={{ position: 'relative' }}>
            <svg ref={svgRef} width={width} height={height}
                style={{ background: COLORS.bg, borderRadius: 8 }} />
            <div
                ref={tooltipRef}
                style={{
                    display: 'none', position: 'absolute', pointerEvents: 'none',
                    background: 'rgba(13,21,32,0.95)', border: `1px solid ${COLORS.border}`,
                    borderRadius: 6, padding: '6px 10px', fontSize: 11,
                    color: COLORS.text, fontFamily: "'JetBrains Mono', monospace",
                    zIndex: 10, lineHeight: 1.5,
                }}
            />
            {snapDate && (
                <div style={{
                    position: 'absolute', top: 4, right: 8,
                    fontSize: 10, color: COLORS.textMuted,
                }}>
                    {snapDate}
                </div>
            )}
        </div>
    );
}

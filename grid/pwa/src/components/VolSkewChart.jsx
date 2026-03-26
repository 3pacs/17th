/**
 * VolSkewChart — Multi-line chart of IV vs strike per expiry.
 *
 * X = strike (or moneyness). Y = IV.
 * One line per expiry, color-coded by DTE (near=bright, far=dim).
 */

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const COLORS = {
    bg: '#0a0e14',
    border: '#1e2a38',
    text: '#c8d6e5',
    textMuted: '#5a7080',
    accent: '#4fc3f7',
};

export default function VolSkewChart({ data, width = 500, height = 320, highlightDte = null }) {
    const svgRef = useRef(null);

    const skewData = data?.skew || [];
    const snapDate = data?.snap_date || '';

    useEffect(() => {
        if (!svgRef.current || skewData.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const margin = { top: 20, right: 80, bottom: 36, left: 48 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // Flatten all strikes to get domains
        const allStrikes = [];
        const allIvs = [];
        for (const exp of skewData) {
            for (const s of (exp.strikes || [])) {
                allStrikes.push(s.strike);
                if (s.call_iv) allIvs.push(s.call_iv);
                if (s.put_iv) allIvs.push(s.put_iv);
            }
        }

        if (allStrikes.length === 0) return;

        const x = d3.scaleLinear().domain(d3.extent(allStrikes)).range([0, w]).nice();
        const y = d3.scaleLinear().domain([
            Math.max(0, (d3.min(allIvs) || 0) * 0.9),
            (d3.max(allIvs) || 1) * 1.05,
        ]).range([h, 0]).nice();

        // DTE color scale: near = bright cyan, far = dim blue
        const dteExtent = d3.extent(skewData, d => d.dte);
        const dteColor = d3.scaleSequential(d3.interpolateCool)
            .domain([dteExtent[0] || 0, dteExtent[1] || 365]);

        // Axes
        const xAxis = g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).ticks(6));
        xAxis.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
        xAxis.selectAll('line, path').attr('stroke', COLORS.border);

        g.append('text')
            .attr('x', w / 2).attr('y', h + 30)
            .attr('text-anchor', 'middle')
            .style('fill', COLORS.textMuted).style('font-size', '10px')
            .text('Strike');

        const yAxis = g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => `${(d * 100).toFixed(0)}%`));
        yAxis.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
        yAxis.selectAll('line, path').attr('stroke', COLORS.border);

        // Draw one line per expiry (call IV)
        const line = d3.line()
            .x(d => x(d.strike))
            .y(d => y(d.iv))
            .curve(d3.curveCatmullRom)
            .defined(d => d.iv != null && d.iv > 0);

        // Limit to ~8 expiries for readability
        const expiries = skewData.slice(0, 8);

        for (const exp of expiries) {
            const points = (exp.strikes || [])
                .filter(s => s.call_iv != null && s.call_iv > 0)
                .map(s => ({ strike: s.strike, iv: s.call_iv }));

            if (points.length < 2) continue;

            const isHighlighted = highlightDte !== null && exp.dte === highlightDte;
            const strokeWidth = isHighlighted ? 2.5 : 1.2;
            const opacity = isHighlighted ? 1 : 0.7;

            g.append('path')
                .datum(points)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', dteColor(exp.dte))
                .attr('stroke-width', strokeWidth)
                .attr('opacity', opacity);
        }

        // Legend
        const legendG = g.append('g').attr('transform', `translate(${w + 8}, 0)`);
        expiries.forEach((exp, i) => {
            legendG.append('line')
                .attr('x1', 0).attr('y1', i * 16 + 4)
                .attr('x2', 14).attr('y2', i * 16 + 4)
                .attr('stroke', dteColor(exp.dte))
                .attr('stroke-width', 2);

            legendG.append('text')
                .attr('x', 18).attr('y', i * 16 + 7)
                .text(`${exp.dte}d`)
                .style('fill', COLORS.textMuted)
                .style('font-size', '9px');
        });

    }, [skewData, width, height, highlightDte]);

    if (skewData.length === 0) {
        return (
            <div style={{
                width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: COLORS.textMuted, fontSize: 13, background: COLORS.bg, borderRadius: 8,
            }}>
                No skew data available
            </div>
        );
    }

    return (
        <svg ref={svgRef} width={width} height={height}
            style={{ background: COLORS.bg, borderRadius: 8 }} />
    );
}

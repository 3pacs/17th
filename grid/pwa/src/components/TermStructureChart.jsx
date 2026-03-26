/**
 * TermStructureChart — ATM IV term structure across expirations.
 *
 * X = DTE. Y = ATM IV.
 * Shows 25-delta put and call wings as additional lines.
 * Area fill under ATM IV line.
 */

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const COLORS = {
    bg: '#0a0e14',
    border: '#1e2a38',
    text: '#c8d6e5',
    textMuted: '#5a7080',
    accent: '#4fc3f7',
    put: '#EF4444',
    call: '#22C55E',
    atm: '#F59E0B',
};

export default function TermStructureChart({ data, width = 500, height = 320 }) {
    const svgRef = useRef(null);

    const ts = data?.term_structure || [];

    useEffect(() => {
        if (!svgRef.current || ts.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const margin = { top: 20, right: 20, bottom: 36, left: 48 };
        const w = width - margin.left - margin.right;
        const h = height - margin.top - margin.bottom;
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        const valid = ts.filter(d => d.iv_atm != null);
        if (valid.length === 0) return;

        const x = d3.scaleLinear()
            .domain([d3.min(valid, d => d.dte), d3.max(valid, d => d.dte)])
            .range([0, w]).nice();

        // Collect all IV values for y domain
        const allIvs = [];
        for (const d of valid) {
            if (d.iv_atm != null) allIvs.push(d.iv_atm);
            if (d.iv_25d_put != null) allIvs.push(d.iv_25d_put);
            if (d.iv_25d_call != null) allIvs.push(d.iv_25d_call);
        }

        const y = d3.scaleLinear()
            .domain([Math.max(0, (d3.min(allIvs) || 0) * 0.9), (d3.max(allIvs) || 1) * 1.05])
            .range([h, 0]).nice();

        // Grid lines
        g.append('g')
            .attr('class', 'grid')
            .selectAll('line')
            .data(y.ticks(5))
            .join('line')
            .attr('x1', 0).attr('x2', w)
            .attr('y1', d => y(d)).attr('y2', d => y(d))
            .attr('stroke', COLORS.border)
            .attr('stroke-dasharray', '2,4')
            .attr('opacity', 0.5);

        // Area fill under ATM
        const area = d3.area()
            .x(d => x(d.dte))
            .y0(h)
            .y1(d => y(d.iv_atm))
            .curve(d3.curveMonotoneX)
            .defined(d => d.iv_atm != null);

        g.append('path')
            .datum(valid)
            .attr('d', area)
            .attr('fill', COLORS.atm)
            .attr('opacity', 0.08);

        // ATM IV line
        const line = d3.line()
            .x(d => x(d.dte))
            .y(d => y(d.iv_atm))
            .curve(d3.curveMonotoneX)
            .defined(d => d.iv_atm != null);

        g.append('path')
            .datum(valid)
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', COLORS.atm)
            .attr('stroke-width', 2);

        // 25-delta put wing
        const putLine = d3.line()
            .x(d => x(d.dte))
            .y(d => y(d.iv_25d_put))
            .curve(d3.curveMonotoneX)
            .defined(d => d.iv_25d_put != null);

        const putValid = valid.filter(d => d.iv_25d_put != null);
        if (putValid.length > 1) {
            g.append('path')
                .datum(putValid)
                .attr('d', putLine)
                .attr('fill', 'none')
                .attr('stroke', COLORS.put)
                .attr('stroke-width', 1.2)
                .attr('stroke-dasharray', '4,3')
                .attr('opacity', 0.7);
        }

        // 25-delta call wing
        const callLine = d3.line()
            .x(d => x(d.dte))
            .y(d => y(d.iv_25d_call))
            .curve(d3.curveMonotoneX)
            .defined(d => d.iv_25d_call != null);

        const callValid = valid.filter(d => d.iv_25d_call != null);
        if (callValid.length > 1) {
            g.append('path')
                .datum(callValid)
                .attr('d', callLine)
                .attr('fill', 'none')
                .attr('stroke', COLORS.call)
                .attr('stroke-width', 1.2)
                .attr('stroke-dasharray', '4,3')
                .attr('opacity', 0.7);
        }

        // Dots on ATM line
        g.selectAll('circle.atm')
            .data(valid)
            .join('circle')
            .attr('class', 'atm')
            .attr('cx', d => x(d.dte))
            .attr('cy', d => y(d.iv_atm))
            .attr('r', 3)
            .attr('fill', COLORS.atm)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);

        // Axes
        const xAxis = g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).ticks(6));
        xAxis.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
        xAxis.selectAll('line, path').attr('stroke', COLORS.border);

        g.append('text')
            .attr('x', w / 2).attr('y', h + 30)
            .attr('text-anchor', 'middle')
            .style('fill', COLORS.textMuted).style('font-size', '10px')
            .text('DTE (days)');

        const yAxisG = g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => `${(d * 100).toFixed(0)}%`));
        yAxisG.selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
        yAxisG.selectAll('line, path').attr('stroke', COLORS.border);

        // Legend
        const legendData = [
            { label: 'ATM IV', color: COLORS.atm, dash: null },
            { label: '25d Put', color: COLORS.put, dash: '4,3' },
            { label: '25d Call', color: COLORS.call, dash: '4,3' },
        ];
        const legendG = g.append('g').attr('transform', `translate(${w - 90}, 0)`);
        legendData.forEach((item, i) => {
            legendG.append('line')
                .attr('x1', 0).attr('y1', i * 14 + 4)
                .attr('x2', 16).attr('y2', i * 14 + 4)
                .attr('stroke', item.color)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', item.dash);

            legendG.append('text')
                .attr('x', 20).attr('y', i * 14 + 7)
                .text(item.label)
                .style('fill', COLORS.textMuted)
                .style('font-size', '9px');
        });

    }, [ts, width, height]);

    if (ts.length === 0) {
        return (
            <div style={{
                width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: COLORS.textMuted, fontSize: 13, background: COLORS.bg, borderRadius: 8,
            }}>
                No term structure data available
            </div>
        );
    }

    return (
        <svg ref={svgRef} width={width} height={height}
            style={{ background: COLORS.bg, borderRadius: 8 }} />
    );
}

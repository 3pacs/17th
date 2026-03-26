/**
 * LivingGraph — Universal renderer for VizSpec objects.
 *
 * Takes a visualization specification from the backend and renders the
 * optimal chart type with proper animations, weight schedules, and
 * real-time updates.
 *
 * The key insight: the SYSTEM chooses the chart type, not the developer.
 * Capital flows → Sankey + time scrubber. Regime → phase space.
 * Correlations → force network. The VizSpec encodes this knowledge.
 *
 * Weight schedules make data sources "breathe" at their natural cadence:
 * real-time equity data pulses fast, monthly macro is a slow heartbeat.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Camera } from 'lucide-react';

// ── Shared Styles ──────────────────────────────────────────────────────────

const COLORS = {
  bg: '#0a0e14',
  surface: '#111820',
  border: '#1e2a38',
  text: '#c8d6e5',
  textMuted: '#5a7080',
  accent: '#4fc3f7',
  positive: '#22c55e',
  negative: '#ef4444',
  warning: '#f59e0b',
  regime: {
    GROWTH: '#22c55e',
    NEUTRAL: '#f59e0b',
    FRAGILE: '#f97316',
    CRISIS: '#ef4444',
  },
};

// ── Time Scrubber ──────────────────────────────────────────────────────────

function TimeScrubber({ dates, currentIndex, onChange, autoPlay, playSpeed, onTogglePlay, isPlaying }) {
  const pct = dates.length > 1 ? (currentIndex / (dates.length - 1)) * 100 : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
      borderTop: `1px solid ${COLORS.border}`, marginTop: 8,
    }}>
      <button
        onClick={onTogglePlay}
        style={{
          background: 'none', border: `1px solid ${COLORS.border}`,
          color: COLORS.text, borderRadius: 4, padding: '4px 12px',
          cursor: 'pointer', fontSize: 12, minWidth: 48,
        }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, dates.length - 1)}
        value={currentIndex}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{ flex: 1, accentColor: COLORS.accent }}
      />
      <span style={{ fontSize: 11, color: COLORS.textMuted, minWidth: 80, textAlign: 'right' }}>
        {dates[currentIndex] || '—'}
      </span>
    </div>
  );
}

// ── Weight Pulse Indicator ─────────────────────────────────────────────────

function WeightIndicator({ schedules, weights }) {
  if (!schedules || schedules.length === 0) return null;

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0',
      borderBottom: `1px solid ${COLORS.border}`, marginBottom: 8,
    }}>
      {schedules.map((s, i) => {
        const w = weights?.[s.source] ?? s.peak_weight;
        const opacity = 0.3 + w * 0.7;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
            color: COLORS.textMuted, opacity,
            transition: 'opacity 0.5s ease',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: s.pulse_on_update ? COLORS.accent : COLORS.textMuted,
              animation: s.pulse_on_update && w > 0.7 ? 'pulse 2s infinite' : 'none',
            }} />
            <span>{s.source}</span>
            <span style={{ color: COLORS.text }}>{s.cadence}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}

// ── Phase Space Renderer ───────────────────────────────────────────────────

function PhaseSpace({ spec, data, width, height }) {
  const svgRef = useRef(null);
  const [timeIdx, setTimeIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(spec.animation?.auto_play ?? false);

  const points = data?.trajectory || [];
  const dates = points.map(p => p.date);

  useEffect(() => {
    if (!isPlaying || points.length === 0) return;
    const iv = setInterval(() => {
      setTimeIdx(prev => {
        if (prev >= points.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, spec.animation?.play_speed_ms || 200);
    return () => clearInterval(iv);
  }, [isPlaying, points.length]);

  useEffect(() => {
    if (!svgRef.current || points.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xExtent = d3.extent(points, p => p.pc1);
    const yExtent = d3.extent(points, p => p.pc2);
    const x = d3.scaleLinear().domain(xExtent).range([0, w]).nice();
    const y = d3.scaleLinear().domain(yExtent).range([h, 0]).nice();

    // Axes
    g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).ticks(5))
      .selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');
    g.append('g').call(d3.axisLeft(y).ticks(5))
      .selectAll('text').style('fill', COLORS.textMuted).style('font-size', '10px');

    // Trail
    const trailLen = spec.animation?.trail_length || 20;
    const trailStart = Math.max(0, timeIdx - trailLen);
    const trailPoints = points.slice(trailStart, timeIdx + 1);

    if (trailPoints.length > 1) {
      const line = d3.line().x(p => x(p.pc1)).y(p => y(p.pc2)).curve(d3.curveCatmullRom);
      g.append('path')
        .datum(trailPoints)
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', COLORS.accent)
        .attr('stroke-width', 2)
        .attr('stroke-opacity', spec.animation?.trail_opacity || 0.2);
    }

    // Trail dots (fading)
    trailPoints.forEach((p, i) => {
      const opacity = (i / trailPoints.length) * 0.6;
      const color = COLORS.regime[p.regime_state] || COLORS.accent;
      g.append('circle')
        .attr('cx', x(p.pc1)).attr('cy', y(p.pc2))
        .attr('r', 3).attr('fill', color).attr('opacity', opacity);
    });

    // Current position (large, bright)
    const current = points[timeIdx];
    if (current) {
      const color = COLORS.regime[current.regime_state] || COLORS.accent;
      g.append('circle')
        .attr('cx', x(current.pc1)).attr('cy', y(current.pc2))
        .attr('r', 8).attr('fill', color).attr('opacity', 0.9)
        .attr('stroke', '#fff').attr('stroke-width', 2);

      // Label
      g.append('text')
        .attr('x', x(current.pc1) + 12).attr('y', y(current.pc2) + 4)
        .text(current.regime_state)
        .style('fill', color).style('font-size', '11px').style('font-weight', 'bold');
    }
  }, [timeIdx, points, width, height]);

  return (
    <div>
      <svg ref={svgRef} width={width} height={height}
        style={{ background: COLORS.bg, borderRadius: 8 }} />
      {spec.time_scrubber && dates.length > 0 && (
        <TimeScrubber
          dates={dates} currentIndex={timeIdx} onChange={setTimeIdx}
          isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)}
          playSpeed={spec.animation?.play_speed_ms}
        />
      )}
    </div>
  );
}

// ── Force Network Renderer ─────────────────────────────────────────────────

function ForceNetwork({ spec, data, width, height }) {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !data?.nodes) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const nodes = data.nodes.map(n => ({ ...n }));
    const links = data.links.map(l => ({ ...l }));

    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

    // Force simulation — weights become spring constants
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id)
        .distance(d => 80 / (Math.abs(d.weight || 0.1) + 0.1))
        .strength(d => Math.abs(d.weight || 0.1)))
      .force('charge', d3.forceManyBody()
        .strength(d => -(d.importance || 1) * 100))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => (d.importance || 1) * 15 + 5));

    simulationRef.current = sim;

    // Links
    const link = svg.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', COLORS.border)
      .attr('stroke-opacity', d => Math.abs(d.weight || 0.3) * 0.8)
      .attr('stroke-width', d => Math.abs(d.weight || 0.5) * 3);

    // Nodes
    const node = svg.append('g')
      .selectAll('circle').data(nodes).join('circle')
      .attr('r', d => Math.max(4, (d.importance || 1) * 12))
      .attr('fill', d => colorScale(d.family || d.group || 0))
      .attr('stroke', '#fff').attr('stroke-width', 1)
      .attr('opacity', 0.85)
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    // Labels
    const label = svg.append('g')
      .selectAll('text').data(nodes).join('text')
      .text(d => d.name || d.id)
      .style('fill', COLORS.textMuted).style('font-size', '9px')
      .attr('dx', 12).attr('dy', 4);

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
      label.attr('x', d => d.x).attr('y', d => d.y);
    });

    return () => sim.stop();
  }, [data, width, height]);

  return (
    <svg ref={svgRef} width={width} height={height}
      style={{ background: COLORS.bg, borderRadius: 8 }} />
  );
}

// ── Orbital Renderer (Sector Rotation) ─────────────────────────────────────

function Orbital({ spec, data, width, height }) {
  const canvasRef = useRef(null);
  const [timeIdx, setTimeIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(spec.animation?.auto_play ?? false);

  const snapshots = data?.snapshots || [];
  const dates = snapshots.map(s => s.date);

  useEffect(() => {
    if (!isPlaying || snapshots.length === 0) return;
    const iv = setInterval(() => {
      setTimeIdx(prev => prev >= snapshots.length - 1 ? 0 : prev + 1);
    }, spec.animation?.play_speed_ms || 200);
    return () => clearInterval(iv);
  }, [isPlaying, snapshots.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || snapshots.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(cx, cy) - 40;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Center (SPY)
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '10px monospace';
    ctx.fillText('SPY', cx + 10, cy + 4);

    // Orbit rings
    for (let ring of [0.25, 0.5, 0.75, 1.0]) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * ring, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Current snapshot sectors
    const snap = snapshots[timeIdx];
    if (!snap?.sectors) return;

    const sectors = Object.entries(snap.sectors);
    const angleStep = (Math.PI * 2) / sectors.length;

    sectors.forEach(([name, sector], i) => {
      const angle = angleStep * i - Math.PI / 2;
      const perf = sector.relative_strength || 0;
      const dist = Math.min(1, Math.max(0.05, Math.abs(perf) / 10)) * maxR;

      const sx = cx + Math.cos(angle) * dist;
      const sy = cy + Math.sin(angle) * dist;
      const color = perf > 0 ? COLORS.positive : perf < 0 ? COLORS.negative : COLORS.textMuted;
      const r = Math.max(8, Math.min(20, (sector.volume || 1) / 1e8));

      // Trail (previous positions)
      const trailLen = Math.min(timeIdx, spec.animation?.trail_length || 30);
      for (let t = Math.max(0, timeIdx - trailLen); t < timeIdx; t++) {
        const prevSnap = snapshots[t];
        if (!prevSnap?.sectors?.[name]) continue;
        const prevPerf = prevSnap.sectors[name].relative_strength || 0;
        const prevDist = Math.min(1, Math.max(0.05, Math.abs(prevPerf) / 10)) * maxR;
        const px = cx + Math.cos(angle) * prevDist;
        const py = cy + Math.sin(angle) * prevDist;
        const alpha = ((t - (timeIdx - trailLen)) / trailLen) * (spec.animation?.trail_opacity || 0.2);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
      }

      // Current position
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.text;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(sector.etf || name.slice(0, 4), sx + r + 4, sy + 4);
    });

    ctx.globalAlpha = 1;
  }, [timeIdx, snapshots, width, height]);

  return (
    <div>
      <canvas ref={canvasRef} style={{ width, height, borderRadius: 8 }} />
      {spec.time_scrubber && dates.length > 0 && (
        <TimeScrubber
          dates={dates} currentIndex={timeIdx} onChange={setTimeIdx}
          isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)}
        />
      )}
    </div>
  );
}

// ── ParticleSystem Renderer (Canvas — Market Energy Dynamics) ─────────────

function ParticleSystem({ spec, data, width, height }) {
  const canvasRef = useRef(null);
  const [timeIdx, setTimeIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(spec.animation?.auto_play ?? false);
  const [hovered, setHovered] = useState(null);

  const points = data?.trajectory || [];
  const dates = points.map(p => p.date);

  useEffect(() => {
    if (!isPlaying || points.length === 0) return;
    const iv = setInterval(() => {
      setTimeIdx(prev => {
        if (prev >= points.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, spec.animation?.play_speed_ms || 200);
    return () => clearInterval(iv);
  }, [isPlaying, points.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const margin = { top: 30, right: 30, bottom: 40, left: 50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    // Scales
    const keExtent = d3.extent(points, p => p.kinetic_energy);
    const peExtent = d3.extent(points, p => p.potential_energy);
    const xScale = d3.scaleLinear().domain([keExtent[0] - 0.05, keExtent[1] + 0.05]).range([margin.left, margin.left + w]);
    const yScale = d3.scaleLinear().domain([peExtent[0] - 0.05, peExtent[1] + 0.05]).range([margin.top + h, margin.top]);

    const regimeColor = (regime) => COLORS.regime[regime] || COLORS.accent;

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const gx = margin.left + (w / 4) * i;
      ctx.beginPath(); ctx.moveTo(gx, margin.top); ctx.lineTo(gx, margin.top + h); ctx.stroke();
      const gy = margin.top + (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(margin.left, gy); ctx.lineTo(margin.left + w, gy); ctx.stroke();
    }

    // Equilibrium line at PE=0
    const eqY = yScale(0);
    if (eqY >= margin.top && eqY <= margin.top + h) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = COLORS.textMuted;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(margin.left, eqY); ctx.lineTo(margin.left + w, eqY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '9px monospace';
      ctx.fillText('PE = 0', margin.left + 4, eqY - 4);
    }

    // Axis labels
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '10px monospace';
    ctx.fillText('Kinetic Energy (momentum)', margin.left + w / 2 - 80, margin.top + h + 30);
    ctx.save();
    ctx.translate(12, margin.top + h / 2 + 60);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Potential Energy (mean reversion)', 0, 0);
    ctx.restore();

    // Tick labels
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = '9px monospace';
    for (let i = 0; i <= 4; i++) {
      const xVal = keExtent[0] + ((keExtent[1] - keExtent[0]) / 4) * i;
      ctx.fillText(xVal.toFixed(2), margin.left + (w / 4) * i - 10, margin.top + h + 14);
      const yVal = peExtent[0] + ((peExtent[1] - peExtent[0]) / 4) * i;
      ctx.fillText(yVal.toFixed(2), margin.left - 40, margin.top + h - (h / 4) * i + 4);
    }

    // Trail
    const trailLen = spec.animation?.trail_length || 30;
    const trailStart = Math.max(0, timeIdx - trailLen);
    const trailPoints = points.slice(trailStart, timeIdx + 1);

    // Draw trail line
    if (trailPoints.length > 1) {
      ctx.beginPath();
      ctx.moveTo(xScale(trailPoints[0].kinetic_energy), yScale(trailPoints[0].potential_energy));
      for (let i = 1; i < trailPoints.length; i++) {
        ctx.lineTo(xScale(trailPoints[i].kinetic_energy), yScale(trailPoints[i].potential_energy));
      }
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Trail dots with fading opacity
    trailPoints.forEach((p, i) => {
      if (i === trailPoints.length - 1) return; // skip current — drawn separately
      const alpha = ((i + 1) / trailPoints.length) * 0.5;
      const color = regimeColor(p.regime);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(xScale(p.kinetic_energy), yScale(p.potential_energy), 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Current position — large bright circle with glow
    const current = points[timeIdx];
    if (current) {
      const cx = xScale(current.kinetic_energy);
      const cy = yScale(current.potential_energy);
      const color = regimeColor(current.regime);

      // Glow
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 24);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();

      // Main dot
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = color;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(current.regime || '', cx + 14, cy - 4);
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = '9px monospace';
      ctx.fillText(`E=${current.total_energy?.toFixed(2) || ''}`, cx + 14, cy + 10);
    }
  }, [timeIdx, points, width, height]);

  // Hover handler
  const handleMouseMove = useCallback((e) => {
    if (points.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const margin = { top: 30, right: 30, bottom: 40, left: 50 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const keExtent = d3.extent(points, p => p.kinetic_energy);
    const peExtent = d3.extent(points, p => p.potential_energy);
    const xScale = d3.scaleLinear().domain([keExtent[0] - 0.05, keExtent[1] + 0.05]).range([margin.left, margin.left + w]);
    const yScale = d3.scaleLinear().domain([peExtent[0] - 0.05, peExtent[1] + 0.05]).range([margin.top + h, margin.top]);

    let closest = null, minDist = 20;
    points.forEach((p, i) => {
      const dx = xScale(p.kinetic_energy) - mx;
      const dy = yScale(p.potential_energy) - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; closest = p; }
    });
    setHovered(closest);
  }, [points, width, height]);

  if (!data?.trajectory || data.trajectory.length === 0) {
    return <div style={{ color: COLORS.textMuted, padding: 40, textAlign: 'center', fontSize: 12 }}>No data available</div>;
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width, height, borderRadius: 8 }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)} />
        {hovered && (
          <div style={{
            position: 'absolute', top: 8, right: 8, background: 'rgba(10,14,20,0.9)',
            borderRadius: 6, padding: '6px 10px', fontSize: 10, color: COLORS.text,
            fontFamily: "'JetBrains Mono', monospace", pointerEvents: 'none',
          }}>
            <div>{hovered.date}</div>
            <div>KE: {hovered.kinetic_energy?.toFixed(3)} PE: {hovered.potential_energy?.toFixed(3)}</div>
            <div>Total: {hovered.total_energy?.toFixed(3)} Mom: {hovered.momentum?.toFixed(3)}</div>
            <div style={{ color: COLORS.regime[hovered.regime] || COLORS.accent }}>{hovered.regime}</div>
          </div>
        )}
      </div>
      {spec.time_scrubber !== false && dates.length > 0 && (
        <TimeScrubber
          dates={dates} currentIndex={timeIdx} onChange={setTimeIdx}
          isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)}
          playSpeed={spec.animation?.play_speed_ms}
        />
      )}
    </div>
  );
}

// ── RiverFlow Renderer (SVG — Lead-Lag Causation) ────────────────────────

function RiverFlow({ spec, data, width, height }) {
  const svgRef = useRef(null);
  const [hoveredStream, setHoveredStream] = useState(null);

  const streams = data?.streams || [];

  useEffect(() => {
    if (!svgRef.current || streams.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 120, bottom: 20, left: 120 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Extract unique leaders and followers
    const leaders = [...new Set(streams.map(s => s.leader))];
    const followers = [...new Set(streams.map(s => s.follower))];

    // Y positions
    const leaderY = d3.scalePoint().domain(leaders).range([20, h - 20]).padding(0.5);
    const followerY = d3.scalePoint().domain(followers).range([20, h - 20]).padding(0.5);

    // Family color scale
    const families = [...new Set([...streams.map(s => s.leader_family), ...streams.map(s => s.follower_family)])];
    const familyColor = d3.scaleOrdinal(d3.schemeTableau10).domain(families);

    // Max width for paths
    const maxPathWidth = 12;
    const maxCorr = d3.max(streams, s => Math.abs(s.correlation)) || 1;

    // Add animated flow CSS
    const styleId = 'river-flow-anim';
    if (!svg.select(`#${styleId}`).node()) {
      svg.append('defs').append('style').attr('id', styleId).text(`
        @keyframes riverDash { to { stroke-dashoffset: -40; } }
      `);
    }

    // Draw streams as cubic bezier paths
    const streamGroup = g.selectAll('.stream').data(streams).join('g').attr('class', 'stream');

    streamGroup.each(function(s, i) {
      const group = d3.select(this);
      const x0 = 0;
      const y0 = leaderY(s.leader);
      const x1 = w;
      const y1 = followerY(s.follower);
      const cpx = w * 0.4;

      const pathData = `M ${x0},${y0} C ${cpx},${y0} ${w - cpx},${y1} ${x1},${y1}`;
      const pathWidth = Math.max(2, (Math.abs(s.correlation) / maxCorr) * maxPathWidth);
      const isPositive = s.direction === 'positive' || s.correlation > 0;
      const baseColor = isPositive ? '#3B82F6' : '#EF4444';
      const dashSpeed = Math.max(1, 8 - (s.lag_days || 3));

      // Background path (wider, muted)
      group.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', baseColor)
        .attr('stroke-width', pathWidth)
        .attr('stroke-opacity', 0.15);

      // Animated dashed overlay
      group.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', baseColor)
        .attr('stroke-width', Math.max(1.5, pathWidth * 0.5))
        .attr('stroke-opacity', 0.6)
        .attr('stroke-dasharray', '6 8')
        .style('animation', `riverDash ${dashSpeed}s linear infinite`);

      // Hover invisible wide path
      group.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', Math.max(12, pathWidth + 6))
        .style('cursor', 'pointer')
        .on('mouseenter', () => setHoveredStream(s))
        .on('mouseleave', () => setHoveredStream(null));
    });

    // Leader labels (left side)
    leaders.forEach(leader => {
      const stream = streams.find(s => s.leader === leader);
      const color = familyColor(stream?.leader_family || '');
      g.append('circle').attr('cx', -8).attr('cy', leaderY(leader)).attr('r', 5).attr('fill', color).attr('opacity', 0.8);
      g.append('text').attr('x', -16).attr('y', leaderY(leader)).attr('dy', '0.35em')
        .attr('text-anchor', 'end').attr('fill', COLORS.text).attr('font-size', '10px')
        .attr('font-family', "'JetBrains Mono', monospace")
        .text(leader);
      g.append('text').attr('x', -16).attr('y', leaderY(leader) + 12).attr('dy', '0.35em')
        .attr('text-anchor', 'end').attr('fill', color).attr('font-size', '8px')
        .attr('font-family', "'JetBrains Mono', monospace").attr('opacity', 0.7)
        .text(stream?.leader_family || '');
    });

    // Follower labels (right side)
    followers.forEach(follower => {
      const stream = streams.find(s => s.follower === follower);
      const color = familyColor(stream?.follower_family || '');
      g.append('circle').attr('cx', w + 8).attr('cy', followerY(follower)).attr('r', 5).attr('fill', color).attr('opacity', 0.8);
      g.append('text').attr('x', w + 16).attr('y', followerY(follower)).attr('dy', '0.35em')
        .attr('text-anchor', 'start').attr('fill', COLORS.text).attr('font-size', '10px')
        .attr('font-family', "'JetBrains Mono', monospace")
        .text(follower);
      g.append('text').attr('x', w + 16).attr('y', followerY(follower) + 12).attr('dy', '0.35em')
        .attr('text-anchor', 'start').attr('fill', color).attr('font-size', '8px')
        .attr('font-family', "'JetBrains Mono', monospace").attr('opacity', 0.7)
        .text(stream?.follower_family || '');
    });

    // Column headers
    g.append('text').attr('x', 0).attr('y', -6).attr('text-anchor', 'start')
      .attr('fill', COLORS.textMuted).attr('font-size', '10px').attr('font-weight', 'bold')
      .attr('font-family', "'JetBrains Mono', monospace").text('LEADERS');
    g.append('text').attr('x', w).attr('y', -6).attr('text-anchor', 'end')
      .attr('fill', COLORS.textMuted).attr('font-size', '10px').attr('font-weight', 'bold')
      .attr('font-family', "'JetBrains Mono', monospace").text('FOLLOWERS');

  }, [streams, width, height]);

  if (!data?.streams || data.streams.length === 0) {
    return <div style={{ color: COLORS.textMuted, padding: 40, textAlign: 'center', fontSize: 12 }}>No data available</div>;
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width={width} height={height}
        style={{ background: COLORS.bg, borderRadius: 8 }} />
      {hoveredStream && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(10,14,20,0.92)', borderRadius: 6, padding: '6px 12px',
          fontSize: 10, color: COLORS.text, pointerEvents: 'none',
          fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap',
          border: `1px solid ${COLORS.border}`,
        }}>
          <span style={{ fontWeight: 700 }}>{hoveredStream.leader}</span>
          <span style={{ color: COLORS.textMuted }}> leads </span>
          <span style={{ fontWeight: 700 }}>{hoveredStream.follower}</span>
          <span style={{ color: COLORS.textMuted }}> by </span>
          <span style={{ color: COLORS.accent }}>{hoveredStream.lag_days}d</span>
          <span style={{ color: COLORS.textMuted }}> · r = </span>
          <span style={{ color: hoveredStream.correlation > 0 ? COLORS.positive : COLORS.negative }}>
            {hoveredStream.correlation?.toFixed(3)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Ridgeline Renderer (SVG — Distribution Evolution) ────────────────────

function Ridgeline({ spec, data, width, height }) {
  const svgRef = useRef(null);
  const [timeIdx, setTimeIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredRidge, setHoveredRidge] = useState(null);

  const ridges = data?.ridges || [];
  const dates = ridges.map(r => r.date);
  const featureName = data?.feature_name || '';
  const stats = data?.overall_stats || {};

  useEffect(() => {
    if (!isPlaying || ridges.length === 0) return;
    const iv = setInterval(() => {
      setTimeIdx(prev => {
        if (prev >= ridges.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, spec.animation?.play_speed_ms || 500);
    return () => clearInterval(iv);
  }, [isPlaying, ridges.length]);

  useEffect(() => {
    if (!svgRef.current || ridges.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 70 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // X scale: value domain across all distributions
    const allValues = ridges.flatMap(r => (r.distribution || []).map(d => d.value));
    const xExtent = d3.extent(allValues);
    const x = d3.scaleLinear().domain([xExtent[0], xExtent[1]]).range([0, w]).nice();

    // Ridge height & overlap
    const ridgeCount = ridges.length;
    const ridgeStep = h / (ridgeCount + 1);
    const ridgeHeight = ridgeStep * 1.8; // overlap factor

    // Max density for scaling
    const maxDensity = d3.max(ridges.flatMap(r => (r.distribution || []).map(d => d.density))) || 1;
    const yDensity = d3.scaleLinear().domain([0, maxDensity]).range([0, ridgeHeight]);

    // Draw ridges — latest (last) at bottom, oldest (first) at top
    const reversedRidges = [...ridges].reverse();

    reversedRidges.forEach((ridge, i) => {
      const dist = ridge.distribution || [];
      if (dist.length === 0) return;

      const baseY = ridgeStep * (i + 1);
      const opacity = 0.3 + (i / ridgeCount) * 0.6; // latest = bottom = most opaque
      const isHighlighted = hoveredRidge === ridge.date;
      const isCurrent = (ridges.length - 1 - i) <= timeIdx;

      // Area generator
      const area = d3.area()
        .x(d => x(d.value))
        .y0(baseY)
        .y1(d => baseY - yDensity(d.density))
        .curve(d3.curveBasis);

      // Fill
      g.append('path')
        .datum(dist)
        .attr('d', area)
        .attr('fill', isCurrent ? COLORS.accent : COLORS.border)
        .attr('fill-opacity', isHighlighted ? 0.6 : opacity * 0.4)
        .attr('stroke', isCurrent ? COLORS.accent : COLORS.textMuted)
        .attr('stroke-width', isHighlighted ? 1.5 : 0.5)
        .attr('stroke-opacity', isHighlighted ? 0.8 : 0.3);

      // Hover zone
      g.append('path')
        .datum(dist)
        .attr('d', area)
        .attr('fill', 'transparent')
        .attr('stroke', 'none')
        .style('cursor', 'pointer')
        .on('mouseenter', () => setHoveredRidge(ridge.date))
        .on('mouseleave', () => setHoveredRidge(null));

      // Date label on Y-axis
      g.append('text')
        .attr('x', -8).attr('y', baseY).attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .attr('fill', isCurrent ? COLORS.text : COLORS.textMuted)
        .attr('font-size', '9px')
        .attr('font-family', "'JetBrains Mono', monospace")
        .text(ridge.date);
    });

    // X axis
    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(6))
      .selectAll('text').style('fill', COLORS.textMuted).style('font-size', '9px');

    // Current value vertical line (if stats.mean exists)
    if (stats.mean != null) {
      const mx = x(stats.mean);
      if (mx >= 0 && mx <= w) {
        g.append('line')
          .attr('x1', mx).attr('y1', 0).attr('x2', mx).attr('y2', h)
          .attr('stroke', COLORS.accent).attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4 3').attr('stroke-opacity', 0.6);
        g.append('text').attr('x', mx + 4).attr('y', 10)
          .attr('fill', COLORS.accent).attr('font-size', '9px')
          .attr('font-family', "'JetBrains Mono', monospace")
          .text(`mean: ${stats.mean.toFixed(2)}`);
      }
    }

    // Feature name label
    if (featureName) {
      g.append('text').attr('x', w / 2).attr('y', h + 24).attr('text-anchor', 'middle')
        .attr('fill', COLORS.textMuted).attr('font-size', '10px')
        .attr('font-family', "'JetBrains Mono', monospace")
        .text(featureName);
    }

  }, [ridges, timeIdx, hoveredRidge, width, height, stats, featureName]);

  if (!data?.ridges || data.ridges.length === 0) {
    return <div style={{ color: COLORS.textMuted, padding: 40, textAlign: 'center', fontSize: 12 }}>No data available</div>;
  }

  return (
    <div>
      <svg ref={svgRef} width={width} height={height}
        style={{ background: COLORS.bg, borderRadius: 8 }} />
      {spec.time_scrubber !== false && dates.length > 0 && (
        <TimeScrubber
          dates={dates} currentIndex={timeIdx} onChange={setTimeIdx}
          isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)}
          playSpeed={spec.animation?.play_speed_ms}
        />
      )}
    </div>
  );
}

// ── Chord Renderer (SVG — Correlation Flow Between Families) ─────────────

function Chord({ spec, data, width, height }) {
  const svgRef = useRef(null);
  const [hoveredGroup, setHoveredGroup] = useState(null);

  const groups = data?.groups || [];
  const matrix = data?.matrix || [];
  const regime = data?.regime || '';

  useEffect(() => {
    if (!svgRef.current || groups.length === 0 || matrix.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const size = Math.min(width, height);
    const outerRadius = size / 2 - 40;
    const innerRadius = outerRadius - 20;
    const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);

    // Filter matrix: zero out values below min_correlation
    const minCorr = spec.min_correlation || 0.3;
    const filtered = matrix.map(row =>
      row.map(val => Math.abs(val) >= minCorr ? Math.abs(val) : 0)
    );

    // D3 chord layout
    const chordLayout = d3.chord()
      .padAngle(0.05)
      .sortSubgroups(d3.descending);

    let chords;
    try {
      chords = chordLayout(filtered);
    } catch (e) {
      console.warn('Chord layout failed:', e);
      return;
    }

    // Color scale for groups
    const groupColor = (i) => {
      if (groups[i]?.color) return groups[i].color;
      const familyColors = d3.scaleOrdinal(d3.schemeTableau10);
      return familyColors(groups[i]?.family || i);
    };

    // Arc generator for outer ring
    const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);

    // Ribbon generator for chords
    const ribbon = d3.ribbon().radius(innerRadius);

    // Draw outer arcs
    const arcGroup = g.selectAll('.arc')
      .data(chords.groups)
      .join('g')
      .attr('class', 'arc');

    arcGroup.append('path')
      .attr('d', arc)
      .attr('fill', d => groupColor(d.index))
      .attr('fill-opacity', d => hoveredGroup === null || hoveredGroup === d.index ? 0.85 : 0.2)
      .attr('stroke', COLORS.bg)
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', (e, d) => setHoveredGroup(d.index))
      .on('mouseleave', () => setHoveredGroup(null));

    // Arc labels
    arcGroup.append('text')
      .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
      .attr('dy', '0.35em')
      .attr('transform', d => {
        const angle = d.angle * 180 / Math.PI - 90;
        const flip = d.angle > Math.PI;
        return `rotate(${angle}) translate(${outerRadius + 8}) ${flip ? 'rotate(180)' : ''}`;
      })
      .attr('text-anchor', d => d.angle > Math.PI ? 'end' : 'start')
      .attr('fill', COLORS.text)
      .attr('font-size', '9px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => groups[d.index]?.name || groups[d.index]?.id || '');

    // Draw chords (ribbons)
    g.selectAll('.chord')
      .data(chords)
      .join('path')
      .attr('class', 'chord')
      .attr('d', ribbon)
      .attr('fill', d => {
        // Blend source and target colors
        const c1 = d3.color(groupColor(d.source.index));
        const c2 = d3.color(groupColor(d.target.index));
        if (!c1 || !c2) return COLORS.accent;
        return d3.interpolateRgb(c1.formatHex(), c2.formatHex())(0.5);
      })
      .attr('fill-opacity', d => {
        if (hoveredGroup === null) return 0.4;
        return (d.source.index === hoveredGroup || d.target.index === hoveredGroup) ? 0.65 : 0.05;
      })
      .attr('stroke', 'none')
      .style('transition', 'fill-opacity 0.2s ease');

    // Regime label in center
    if (regime) {
      g.append('text')
        .attr('text-anchor', 'middle').attr('dy', '-0.2em')
        .attr('fill', COLORS.regime[regime] || COLORS.text)
        .attr('font-size', '14px').attr('font-weight', 'bold')
        .attr('font-family', "'JetBrains Mono', monospace")
        .text(regime);
      g.append('text')
        .attr('text-anchor', 'middle').attr('dy', '1.2em')
        .attr('fill', COLORS.textMuted)
        .attr('font-size', '9px')
        .attr('font-family', "'JetBrains Mono', monospace")
        .text('correlation regime');
    }

  }, [groups, matrix, regime, hoveredGroup, width, height, spec]);

  if (!data?.groups || data.groups.length === 0 || !data?.matrix || data.matrix.length === 0) {
    return <div style={{ color: COLORS.textMuted, padding: 40, textAlign: 'center', fontSize: 12 }}>No data available</div>;
  }

  return (
    <svg ref={svgRef} width={width} height={height}
      style={{ background: COLORS.bg, borderRadius: 8 }} />
  );
}

// ── Data Freshness / Stale Badge ──────────────────────────────────────────

const REGIME_BAND_COLORS = {
  GROWTH: 'rgba(34,197,94,0.05)',
  NEUTRAL: 'rgba(26,110,191,0.05)',
  FRAGILE: 'rgba(245,158,11,0.05)',
  CRISIS: 'rgba(239,68,68,0.08)',
};

function computeStaleness(data) {
  if (!data) return null;

  // Walk known data shapes to find the most recent date
  let dates = [];
  const extract = (obj) => {
    if (!obj) return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item?.date) dates.push(item.date);
        if (item?.signal_date) dates.push(item.signal_date);
      }
    }
  };

  extract(data.trajectory);
  extract(data.snapshots);
  extract(data.streams);
  extract(data.ridges);
  extract(data.history);

  // Also check top-level snap_date
  if (data.snap_date) dates.push(data.snap_date);
  if (data.briefing_date) dates.push(data.briefing_date);

  if (dates.length === 0) return null;

  // Parse and find max
  const parsed = dates.map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
  if (parsed.length === 0) return null;

  const latest = Math.max(...parsed.map(d => d.getTime()));
  const ageHours = (Date.now() - latest) / (1000 * 60 * 60);

  return { ageHours, latestDate: new Date(latest) };
}

function StaleBadge({ data, expectedCadenceHours = 24 }) {
  const info = computeStaleness(data);
  if (!info) return null;

  const ratio = info.ageHours / expectedCadenceHours;

  if (ratio <= 2) return null; // Fresh enough

  const isRed = ratio > 5;
  const bgColor = isRed ? '#EF4444' : '#F59E0B';
  const label = isRed ? 'STALE' : 'AGING';
  const ageText = info.ageHours < 48
    ? `${Math.round(info.ageHours)}h ago`
    : `${Math.round(info.ageHours / 24)}d ago`;

  return (
    <div style={{
      position: 'absolute', top: 8, right: 8, zIndex: 5,
      display: 'flex', alignItems: 'center', gap: 4,
      background: `${bgColor}20`, border: `1px solid ${bgColor}40`,
      borderRadius: 4, padding: '2px 6px',
      fontSize: 9, fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
      color: bgColor, letterSpacing: '0.5px',
      animation: isRed ? 'stalePulse 2s ease-in-out infinite' : 'none',
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: '50%', background: bgColor,
      }} />
      {label} {ageText}
      {isRed && (
        <style>{`
          @keyframes stalePulse {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
          }
        `}</style>
      )}
    </div>
  );
}

// ── Export / Screenshot Button ─────────────────────────────────────────────

function ExportButton({ chartType, containerRef }) {
  const handleExport = useCallback(() => {
    if (!containerRef.current) return;

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `grid_${chartType || 'chart'}_${dateStr}`;

    // Try SVG export first
    const svgEl = containerRef.current.querySelector('svg');
    if (svgEl) {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svgEl);
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Try canvas export
    const canvasEl = containerRef.current.querySelector('canvas');
    if (canvasEl) {
      const url = canvasEl.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.png`;
      a.click();
      return;
    }
  }, [chartType, containerRef]);

  return (
    <button
      onClick={handleExport}
      title="Export chart"
      style={{
        position: 'absolute', top: 8, right: 40, zIndex: 5,
        background: 'none', border: `1px solid ${COLORS.border}`,
        borderRadius: 4, padding: '3px 5px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.5, transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
      onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
    >
      <Camera size={12} color={COLORS.textMuted} />
    </button>
  );
}

// ── Regime Bands (Background strips for time-series charts) ───────────────

function RegimeBands({ data, svgGroup, xScale, yRange, width }) {
  // This is called as a render helper, not a React component.
  // It draws colored background rectangles for regime periods.
  if (!svgGroup || !data) return;

  // Extract regime data from trajectory-style arrays
  let regimePoints = [];
  if (data.trajectory) {
    regimePoints = data.trajectory.filter(p => p.regime_state || p.regime);
  }
  if (regimePoints.length === 0) return;

  // Group consecutive same-regime points into bands
  let bands = [];
  let currentBand = null;

  for (const p of regimePoints) {
    const regime = p.regime_state || p.regime;
    const date = p.date;
    if (!currentBand || currentBand.regime !== regime) {
      if (currentBand) bands.push(currentBand);
      currentBand = { regime, startDate: date, endDate: date };
    } else {
      currentBand.endDate = date;
    }
  }
  if (currentBand) bands.push(currentBand);

  // Draw bands
  for (const band of bands) {
    const color = REGIME_BAND_COLORS[band.regime];
    if (!color) continue;

    const x1 = typeof xScale === 'function' ? xScale(new Date(band.startDate)) : 0;
    const x2 = typeof xScale === 'function' ? xScale(new Date(band.endDate)) : width;

    if (isNaN(x1) || isNaN(x2)) continue;

    svgGroup.append('rect')
      .attr('x', Math.min(x1, x2))
      .attr('y', yRange[0])
      .attr('width', Math.abs(x2 - x1) || 2)
      .attr('height', yRange[1] - yRange[0])
      .attr('fill', color)
      .attr('pointer-events', 'none');
  }
}

// ── Main LivingGraph Component ─────────────────────────────────────────────

export default function LivingGraph({ spec, data, width = 600, height = 400 }) {
  const [sourceWeights, setSourceWeights] = useState({});
  const chartContainerRef = useRef(null);

  // Compute expected cadence from weight schedules
  const expectedCadenceHours = spec?.weight_schedules?.[0]?.freshness_half_life_hours || 24;

  // Fetch source weights on mount
  useEffect(() => {
    if (!spec?.weight_schedules?.length) return;
    const families = spec.weight_schedules.map(s => s.source).join(',');
    fetch(`/api/v1/viz/weights?families=${families}`)
      .then(r => r.json())
      .then(d => setSourceWeights(d.weights || {}))
      .catch(() => {});
  }, [spec]);

  if (!spec) return null;

  const chartType = spec.chart_type;

  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: 16,
      position: 'relative',
    }}>
      {/* Title + Export */}
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{spec.title}</div>
          {spec.subtitle && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{spec.subtitle}</div>
          )}
        </div>
      </div>

      {/* Weight indicators */}
      <WeightIndicator schedules={spec.weight_schedules} weights={sourceWeights} />

      {/* Stale data badge */}
      <StaleBadge data={data} expectedCadenceHours={expectedCadenceHours} />

      {/* Export button */}
      <ExportButton chartType={chartType} containerRef={chartContainerRef} />

      {/* Chart renderer by type */}
      <div ref={chartContainerRef}>
        {chartType === 'phase_space' && (
          <PhaseSpace spec={spec} data={data} width={width} height={height} />
        )}
        {chartType === 'force_network' && (
          <ForceNetwork spec={spec} data={data} width={width} height={height} />
        )}
        {chartType === 'orbital' && (
          <Orbital spec={spec} data={data} width={width} height={height} />
        )}
        {chartType === 'particle_system' && (
          <ParticleSystem spec={spec} data={data} width={width} height={height} />
        )}
        {chartType === 'river_flow' && (
          <RiverFlow spec={spec} data={data} width={width} height={height} />
        )}
        {chartType === 'ridgeline' && (
          <Ridgeline spec={spec} data={data} width={width} height={height} />
        )}
        {chartType === 'chord' && (
          <Chord spec={spec} data={data} width={width} height={height} />
        )}
        {(chartType === 'sankey_temporal') && (
          <div style={{ color: COLORS.textMuted, padding: 40, textAlign: 'center' }}>
            Use CapitalFlowSankey component with time scrubber
          </div>
        )}
        {!['phase_space', 'force_network', 'orbital', 'particle_system', 'river_flow', 'ridgeline', 'chord', 'sankey_temporal'].includes(chartType) && (
          <div style={{ color: COLORS.textMuted, padding: 40, textAlign: 'center', fontSize: 12 }}>
            Renderer: <strong>{chartType}</strong> — spec ready, renderer loading
          </div>
        )}
      </div>

      {/* Narrative overlay */}
      {spec.narrative_overlay && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16, right: 16,
          background: 'rgba(10, 14, 20, 0.85)', borderRadius: 8,
          padding: '8px 12px', fontSize: 11, color: COLORS.text,
          backdropFilter: 'blur(8px)',
        }}>
          {spec.narrative_overlay}
        </div>
      )}
    </div>
  );
}

// Export sub-components for direct use
export { PhaseSpace, ForceNetwork, Orbital, ParticleSystem, RiverFlow, Ridgeline, Chord, TimeScrubber, WeightIndicator, StaleBadge, ExportButton, RegimeBands, REGIME_BAND_COLORS, computeStaleness };

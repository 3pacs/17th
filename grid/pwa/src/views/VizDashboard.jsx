/**
 * VizDashboard — Living Intelligence composite view.
 *
 * A grid of LivingGraph instances showing different market aspects in real-time:
 *   - Phase Space (regime trajectory)
 *   - Orbital (sector rotation)
 *   - Force Network (feature correlations)
 *   - Particle System (energy dynamics)
 *   - River Flow (lead/lag causation)
 *
 * Each chart fetches its own data independently. One failing chart does not
 * break the others. A master time control syncs time-based charts.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api.js';
import LivingGraph from '../components/LivingGraph.jsx';

// ── Colors (mirrors LivingGraph COLORS) ───────────────────────────────────

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

// ── Chart definitions ─────────────────────────────────────────────────────

const CHART_DEFS = [
  {
    id: 'phase-space',
    title: 'Regime Phase Space',
    subtitle: 'Market trajectory through state space',
    chartType: 'phase_space',
    gridArea: 'phase',
    fetch: () => api.getRegimeTrajectory(365).catch(() => null),
    spec: {
      chart_type: 'phase_space',
      title: 'Regime Phase Space',
      subtitle: 'Market trajectory through state space — attractors are regime centers',
      x_field: 'pc1',
      y_fields: ['pc2'],
      color_field: 'regime_state',
      size_field: 'confidence',
      time_scrubber: true,
      time_range: '1Y',
      animation: {
        transition_ms: 300,
        trail_opacity: 0.2,
        trail_length: 30,
        auto_play: false,
        play_speed_ms: 150,
      },
      weight_schedules: [{ source: 'regime', cadence: 'hourly', freshness_half_life_hours: 6, peak_weight: 1.0, min_weight: 0.6, pulse_on_update: true }],
    },
  },
  {
    id: 'orbital',
    title: 'Sector Rotation',
    subtitle: 'Sectors orbit SPY by relative strength',
    chartType: 'orbital',
    gridArea: 'orbital',
    fetch: () => api.getOrbitalData('6M', 'weekly').catch(() => null),
    spec: {
      chart_type: 'orbital',
      title: 'Sector Rotation Orbit',
      subtitle: 'Distance = relative performance. Trail shows rotation history.',
      color_field: 'signal',
      size_field: 'volume',
      label_field: 'etf',
      time_scrubber: true,
      time_range: '6M',
      animation: {
        trail_opacity: 0.25,
        trail_length: 60,
        auto_play: false,
        play_speed_ms: 200,
      },
      weight_schedules: [
        { source: 'equity', cadence: 'realtime', freshness_half_life_hours: 1, peak_weight: 1.0, min_weight: 0.5, pulse_on_update: true },
        { source: 'flows', cadence: '4h', freshness_half_life_hours: 8, peak_weight: 0.9, min_weight: 0.4, pulse_on_update: true },
      ],
    },
  },
  {
    id: 'force-network',
    title: 'Feature Network',
    subtitle: 'Correlation and importance graph',
    chartType: 'force_network',
    gridArea: 'network',
    fetch: () => api.getFeatureNetwork(0.3, 50).catch(() => null),
    spec: {
      chart_type: 'force_network',
      title: 'Feature Intelligence Network',
      subtitle: 'Node size = importance. Edge thickness = correlation.',
      size_field: 'importance',
      weight_field: 'correlation',
      color_field: 'family',
      group_field: 'family',
      time_scrubber: false,
      animation: {
        transition_ms: 800,
        stagger_ms: 20,
      },
      weight_schedules: [
        { source: 'rates', cadence: 'daily', freshness_half_life_hours: 24, peak_weight: 0.9, min_weight: 0.3, pulse_on_update: false },
        { source: 'vol', cadence: 'realtime', freshness_half_life_hours: 2, peak_weight: 1.0, min_weight: 0.4, pulse_on_update: true },
      ],
    },
  },
  {
    id: 'particle-system',
    title: 'Market Energy',
    subtitle: 'Kinetic vs potential energy dynamics',
    chartType: 'particle_system',
    gridArea: 'particle',
    fetch: () => api.getEnergyTrajectory(90).catch(() => null),
    spec: {
      chart_type: 'particle_system',
      title: 'Market Energy Field',
      subtitle: 'KE (momentum) vs PE (mean reversion tension). Conservation violations glow red.',
      x_field: 'kinetic_energy',
      y_fields: ['potential_energy'],
      color_field: 'energy_level',
      size_field: 'total_energy',
      time_scrubber: true,
      animation: {
        transition_ms: 200,
        trail_opacity: 0.1,
        trail_length: 15,
        auto_play: false,
        play_speed_ms: 150,
        pulse_duration_ms: 500,
      },
      weight_schedules: [
        { source: 'physics', cadence: 'hourly', freshness_half_life_hours: 4, peak_weight: 0.7, min_weight: 0.3, pulse_on_update: true },
      ],
    },
  },
  {
    id: 'river-flow',
    title: 'Causal River',
    subtitle: 'Lead-lag causation between features',
    chartType: 'river_flow',
    gridArea: 'river',
    fetch: () => api.getLeadLagRiver(0.3, 20).catch(() => null),
    spec: {
      chart_type: 'river_flow',
      title: 'Causal River',
      subtitle: 'Upstream features signal before downstream reacts. Width = correlation strength.',
      size_field: 'correlation',
      color_field: 'lag_days',
      time_scrubber: false,
      animation: {
        transition_ms: 600,
        auto_play: false,
      },
    },
  },
];

// ── Pulsing skeleton placeholder ──────────────────────────────────────────

function SkeletonCard({ title }) {
  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      minHeight: 280,
    }}>
      <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600, letterSpacing: '0.5px' }}>
        {title}
      </div>
      <div style={{
        flex: 1,
        background: COLORS.bg,
        borderRadius: 8,
        animation: 'vizPulse 2s ease-in-out infinite',
      }} />
    </div>
  );
}

// ── Error cell ────────────────────────────────────────────────────────────

function ErrorCell({ title }) {
  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 280,
      gap: 8,
    }}>
      <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>
        Unable to load {title}
      </div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, opacity: 0.6 }}>
        Data endpoint may be unavailable
      </div>
    </div>
  );
}

// ── Chart cell wrapper ────────────────────────────────────────────────────

function ChartCell({ def, data, loading, error, width, height }) {
  if (loading) return <SkeletonCard title={def.title} />;
  if (error || data === null) return <ErrorCell title={def.title} />;

  return (
    <div style={{ minHeight: 280 }}>
      <LivingGraph
        spec={def.spec}
        data={data}
        width={width}
        height={height}
      />
    </div>
  );
}

// ── Regime banner ─────────────────────────────────────────────────────────

function RegimeBanner({ regimeData }) {
  if (!regimeData) return null;

  // Try to extract current regime from trajectory data
  const trajectory = regimeData?.trajectory;
  if (!trajectory || trajectory.length === 0) return null;

  const latest = trajectory[trajectory.length - 1];
  const regime = latest?.regime_state || latest?.regime || 'UNKNOWN';
  const confidence = latest?.confidence;
  const color = COLORS.regime[regime] || COLORS.accent;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 16px',
      background: `${color}10`,
      border: `1px solid ${color}25`,
      borderRadius: 8,
      marginBottom: 16,
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 8px ${color}60`,
        animation: 'vizPulse 2s ease-in-out infinite',
      }} />
      <div style={{ flex: 1 }}>
        <span style={{
          fontSize: 13, fontWeight: 700, color,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '1px',
        }}>
          {regime}
        </span>
        {confidence != null && (
          <span style={{
            fontSize: 10, color: COLORS.textMuted, marginLeft: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            conf: {(confidence * 100).toFixed(0)}%
          </span>
        )}
        {latest?.date && (
          <span style={{
            fontSize: 10, color: COLORS.textMuted, marginLeft: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {latest.date}
          </span>
        )}
      </div>
      <span style={{
        fontSize: 10, color: COLORS.textMuted,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}>
        Current Regime State
      </span>
    </div>
  );
}

// ── Master time control ───────────────────────────────────────────────────
// Syncs a shared date across time-based charts. Broadcasts via onDateChange.

function MasterTimeControl({ dates, onDateChange }) {
  const [index, setIndex] = useState(dates.length > 0 ? dates.length - 1 : 0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (dates.length > 0 && index >= dates.length) {
      setIndex(dates.length - 1);
    }
  }, [dates]);

  useEffect(() => {
    if (!playing || dates.length === 0) return;
    intervalRef.current = setInterval(() => {
      setIndex(prev => {
        if (prev >= dates.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 150);
    return () => clearInterval(intervalRef.current);
  }, [playing, dates.length]);

  useEffect(() => {
    if (dates.length > 0 && onDateChange) {
      onDateChange(dates[index]);
    }
  }, [index, dates]);

  if (!dates || dates.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      marginBottom: 16,
    }}>
      <span style={{
        fontSize: 10, color: COLORS.textMuted, fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '1px',
        whiteSpace: 'nowrap',
      }}>
        TIME
      </span>
      <button
        onClick={() => setPlaying(!playing)}
        style={{
          background: 'none',
          border: `1px solid ${COLORS.border}`,
          color: COLORS.text,
          borderRadius: 4,
          padding: '3px 10px',
          cursor: 'pointer',
          fontSize: 11,
          minWidth: 40,
        }}
      >
        {playing ? '\u23F8' : '\u25B6'}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0, dates.length - 1)}
        value={index}
        onChange={e => { setIndex(parseInt(e.target.value)); setPlaying(false); }}
        style={{ flex: 1, accentColor: COLORS.accent }}
      />
      <span style={{
        fontSize: 11, color: COLORS.text, minWidth: 82, textAlign: 'right',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {dates[index] || '\u2014'}
      </span>
    </div>
  );
}

// ── Responsive hook ───────────────────────────────────────────────────────

function useContainerWidth(ref) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(ref.current);
    setWidth(ref.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  return width;
}

// ── Main VizDashboard ─────────────────────────────────────────────────────

export default function VizDashboard() {
  const containerRef = useRef(null);
  const containerWidth = useContainerWidth(containerRef);

  // Per-chart state: { data, loading, error }
  const [chartStates, setChartStates] = useState(() => {
    const init = {};
    CHART_DEFS.forEach(def => {
      init[def.id] = { data: null, loading: true, error: false };
    });
    return init;
  });

  // Master time dates (derived from phase-space trajectory)
  const [masterDates, setMasterDates] = useState([]);
  const [masterDate, setMasterDate] = useState(null);

  // Fetch all chart data on mount
  useEffect(() => {
    CHART_DEFS.forEach(def => {
      def.fetch().then(data => {
        setChartStates(prev => ({
          ...prev,
          [def.id]: { data, loading: false, error: !data },
        }));

        // Extract dates for master time control from phase-space
        if (def.id === 'phase-space' && data?.trajectory) {
          setMasterDates(data.trajectory.map(p => p.date));
        }
      }).catch(() => {
        setChartStates(prev => ({
          ...prev,
          [def.id]: { data: null, loading: false, error: true },
        }));
      });
    });
  }, []);

  // Layout breakpoints
  const isMobile = containerWidth > 0 && containerWidth < 640;
  const isTablet = containerWidth >= 640 && containerWidth < 1024;
  const isDesktop = containerWidth >= 1024;

  // Compute chart dimensions based on layout
  const gap = 16;
  const padding = 16;
  const availableWidth = Math.max(300, containerWidth - padding * 2);

  let cellWidth, chartHeight;
  if (isMobile) {
    cellWidth = availableWidth;
    chartHeight = 280;
  } else if (isTablet) {
    cellWidth = (availableWidth - gap) / 2;
    chartHeight = 300;
  } else {
    cellWidth = (availableWidth - gap) / 2;
    chartHeight = 320;
  }

  // Full-width for river flow
  const riverWidth = availableWidth;
  const riverHeight = isMobile ? 300 : 280;

  // Actual chart drawing area (subtract LivingGraph padding + title overhead)
  const chartInnerWidth = Math.max(200, cellWidth - 32);
  const chartInnerHeight = Math.max(180, chartHeight - 80);
  const riverInnerWidth = Math.max(300, riverWidth - 32);
  const riverInnerHeight = Math.max(180, riverHeight - 80);

  const gridStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', gap }
    : {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateAreas: `
          "phase orbital"
          "network particle"
          "river river"
        `,
        gap,
      };

  return (
    <div ref={containerRef} style={{
      padding,
      maxWidth: 1200,
      margin: '0 auto',
      fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
    }}>
      {/* Pulsing animation keyframe */}
      <style>{`
        @keyframes vizPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{
          fontSize: 20, fontWeight: 700, color: COLORS.text, margin: 0,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '1px',
        }}>
          Living Intelligence
        </h1>
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
          Multi-chart real-time market state
        </div>
      </div>

      {/* Regime banner */}
      <RegimeBanner regimeData={chartStates['phase-space']?.data} />

      {/* Master time control */}
      <MasterTimeControl dates={masterDates} onDateChange={setMasterDate} />

      {/* Chart grid */}
      <div style={gridStyle}>
        {/* Phase Space */}
        <div style={!isMobile ? { gridArea: 'phase' } : {}}>
          <ChartCell
            def={CHART_DEFS[0]}
            data={chartStates['phase-space']?.data}
            loading={chartStates['phase-space']?.loading}
            error={chartStates['phase-space']?.error}
            width={chartInnerWidth}
            height={chartInnerHeight}
          />
        </div>

        {/* Orbital */}
        <div style={!isMobile ? { gridArea: 'orbital' } : {}}>
          <ChartCell
            def={CHART_DEFS[1]}
            data={chartStates['orbital']?.data}
            loading={chartStates['orbital']?.loading}
            error={chartStates['orbital']?.error}
            width={chartInnerWidth}
            height={chartInnerHeight}
          />
        </div>

        {/* Force Network */}
        <div style={!isMobile ? { gridArea: 'network' } : {}}>
          <ChartCell
            def={CHART_DEFS[2]}
            data={chartStates['force-network']?.data}
            loading={chartStates['force-network']?.loading}
            error={chartStates['force-network']?.error}
            width={chartInnerWidth}
            height={chartInnerHeight}
          />
        </div>

        {/* Particle System */}
        <div style={!isMobile ? { gridArea: 'particle' } : {}}>
          <ChartCell
            def={CHART_DEFS[3]}
            data={chartStates['particle-system']?.data}
            loading={chartStates['particle-system']?.loading}
            error={chartStates['particle-system']?.error}
            width={chartInnerWidth}
            height={chartInnerHeight}
          />
        </div>

        {/* River Flow (full width) */}
        <div style={!isMobile ? { gridArea: 'river' } : {}}>
          <ChartCell
            def={CHART_DEFS[4]}
            data={chartStates['river-flow']?.data}
            loading={chartStates['river-flow']?.loading}
            error={chartStates['river-flow']?.error}
            width={riverInnerWidth}
            height={riverInnerHeight}
          />
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { tokens, styles } from '../styles/tokens.js';
import useStore from '../store.js';

const settStyles = {
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: tokens.spacing.md,
        padding: '14px 0',
        borderBottom: `1px solid rgba(74, 158, 255, 0.08)`,
    },
    toggle: (active) => ({
        width: '48px',
        height: '28px',
        borderRadius: '999px',
        background: active ? tokens.accent : '#16243B',
        border: `1px solid ${active ? tokens.accent : tokens.cardBorder}`,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        flexShrink: 0,
    }),
    knob: (active) => ({
        position: 'absolute',
        top: '3px',
        left: active ? '23px' : '3px',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s ease',
    }),
    logoutBtn: {
        padding: '12px 24px',
        background: 'rgba(239, 68, 68, 0.15)',
        color: tokens.red,
        border: `1px solid rgba(239, 68, 68, 0.3)`,
        borderRadius: tokens.radius.md,
        fontFamily: tokens.fontSans,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: tokens.spacing.xl,
        width: '100%',
    },
    version: {
        textAlign: 'center',
        fontSize: '11px',
        color: tokens.textMuted,
        fontFamily: tokens.fontMono,
        marginTop: tokens.spacing.xxl,
    },
};

function Toggle({ active, onToggle }) {
    return (
        <button type="button" style={settStyles.toggle(active)} onClick={onToggle}>
            <span style={settStyles.knob(active)} />
        </button>
    );
}

export default function Settings() {
    const { clearAuth, preferences, setPreference, celestialData, celestialStatus, celestialNote } = useStore();
    const liveCount = Object.values(celestialData?.categories || {}).reduce(
        (total, items) => total + (Array.isArray(items) ? items.length : 0),
        0
    );
    const statusLabel = celestialStatus === 'live'
        ? 'LIVE'
        : celestialStatus === 'cached'
            ? 'CACHED'
            : celestialStatus === 'loading'
                ? 'LOADING'
                : celestialStatus === 'disabled'
                    ? 'DISABLED'
                    : celestialStatus === 'demo'
                        ? 'DEGRADED'
                        : 'IDLE';
    const statusColor = celestialStatus === 'live' || celestialStatus === 'cached'
        ? tokens.green
        : celestialStatus === 'loading'
            ? tokens.gold
            : tokens.textMuted;

    return (
        <div style={styles.container}>
            <div style={styles.header}>Settings</div>
            <div style={styles.subheader}>AstroGrid Configuration</div>

            <div style={styles.card}>
                <div style={settStyles.row}>
                    <div>
                        <div style={{ fontSize: '14px', color: tokens.text }}>Animate Orbits</div>
                        <div style={styles.label}>Controls camera feel in the hero orrery.</div>
                    </div>
                    <Toggle
                        active={preferences.animateOrbits}
                        onToggle={() => setPreference('animateOrbits', !preferences.animateOrbits)}
                    />
                </div>
                <div style={settStyles.row}>
                    <div>
                        <div style={{ fontSize: '14px', color: tokens.text }}>Show Aspect Lines</div>
                        <div style={styles.label}>Overlay major geometric relationships between bodies.</div>
                    </div>
                    <Toggle
                        active={preferences.showAspectLines}
                        onToggle={() => setPreference('showAspectLines', !preferences.showAspectLines)}
                    />
                </div>
                <div style={settStyles.row}>
                    <div>
                        <div style={{ fontSize: '14px', color: tokens.text }}>Use Live Telemetry</div>
                        <div style={styles.label}>Blend stable celestial signals into the SPA.</div>
                    </div>
                    <Toggle
                        active={preferences.useLiveTelemetry}
                        onToggle={() => setPreference('useLiveTelemetry', !preferences.useLiveTelemetry)}
                    />
                </div>
                <div style={settStyles.row}>
                    <div>
                        <div style={{ fontSize: '14px', color: tokens.text }}>Chinese Layer</div>
                        <div style={styles.label}>Show Chinese calendar overlays when available.</div>
                    </div>
                    <Toggle
                        active={preferences.showChineseLayer}
                        onToggle={() => setPreference('showChineseLayer', !preferences.showChineseLayer)}
                    />
                </div>
                <div style={settStyles.row}>
                    <div>
                        <div style={{ fontSize: '14px', color: tokens.text }}>Solar Layer</div>
                        <div style={styles.label}>Show solar activity gauges and flare context.</div>
                    </div>
                    <Toggle
                        active={preferences.showSolarLayer}
                        onToggle={() => setPreference('showSolarLayer', !preferences.showSolarLayer)}
                    />
                </div>
                <div style={{ ...settStyles.row, borderBottom: 'none' }}>
                    <div>
                        <div style={{ fontSize: '14px', color: tokens.text }}>Session Telemetry</div>
                        <div style={styles.label}>
                            {liveCount > 0 ? `${liveCount} celestial features cached in this session` : 'No cached celestial features yet'}
                        </div>
                        <div style={{ ...styles.label, marginTop: tokens.spacing.xs }}>
                            {celestialNote}
                        </div>
                    </div>
                    <div style={{ fontSize: '13px', color: statusColor, fontFamily: tokens.fontMono }}>
                        {statusLabel}
                    </div>
                </div>
            </div>

            <button
                style={settStyles.logoutBtn}
                onClick={() => {
                    clearAuth();
                    window.location.href = '/';
                }}
            >
                Log Out
            </button>

            <div style={settStyles.version}>AstroGrid v0.2.0</div>
        </div>
    );
}

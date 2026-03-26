import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { colors, shared, tokens } from '../styles/shared.js';

const SEVERITY_COLORS = {
    CRITICAL: colors.red,
    ERROR: '#F87171',
    WARNING: colors.yellow,
    INFO: colors.accent,
};

const FIX_COLORS = {
    SUCCESS: colors.green,
    FAILED: colors.red,
    PENDING: colors.yellow,
    SKIPPED: colors.textMuted,
};

const STATUS_COLORS = {
    healthy: colors.green,
    stale: colors.yellow,
    error: colors.red,
};

const STATUS_BG = {
    healthy: colors.greenBg,
    stale: colors.yellowBg,
    error: colors.redBg,
};

const SEVERITY_OPTIONS = ['ALL', 'CRITICAL', 'ERROR', 'WARNING', 'INFO'];
const CATEGORY_OPTIONS = ['ALL', 'ingestion', 'normalization', 'discovery', 'inference', 'system'];

const fmtDate = (d) => d ? d.substring(0, 19).replace('T', ' ') : '-';

const relativeTime = (isoStr) => {
    if (!isoStr) return 'never';
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

export default function Operator() {
    const [status, setStatus] = useState(null);
    const [health, setHealth] = useState(null);
    const [issues, setIssues] = useState([]);
    const [recentCycles, setRecentCycles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [severityFilter, setSeverityFilter] = useState('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [expandedIssue, setExpandedIssue] = useState(null);
    const [daysBack, setDaysBack] = useState(30);
    const refreshRef = useRef(null);

    useEffect(() => {
        loadAll();
        // Auto-refresh every 60 seconds
        refreshRef.current = setInterval(() => {
            loadHealth();
        }, 60000);
        return () => clearInterval(refreshRef.current);
    }, []);

    useEffect(() => {
        loadIssues();
    }, [severityFilter, categoryFilter, daysBack]);

    const loadAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const [statusRes, healthRes, issuesRes, cyclesRes] = await Promise.all([
                api._fetch('/api/v1/system/status').catch(() => null),
                api.getSubsystemHealth().catch(() => null),
                api._fetch('/api/v1/snapshots/issues?days_back=30').catch(() => null),
                api._fetch('/api/v1/snapshots/latest/pipeline_summary?n=10').catch(() => null),
            ]);
            setStatus(statusRes);
            setHealth(healthRes);
            setIssues(issuesRes?.issues || issuesRes || []);
            setRecentCycles(cyclesRes?.snapshots || cyclesRes || []);
        } catch (e) {
            setError(e.message || 'Failed to load operator data');
        }
        setLoading(false);
    };

    const loadHealth = async () => {
        try {
            const res = await api.getSubsystemHealth();
            setHealth(res);
        } catch (e) {
            console.warn('[GRID] Subsystem health refresh failed:', e.message);
        }
    };

    const loadIssues = async () => {
        try {
            let url = '/api/v1/snapshots/issues?days_back=' + daysBack;
            if (categoryFilter !== 'ALL') url += '&category=' + categoryFilter;
            if (severityFilter !== 'ALL') url += '&severity=' + severityFilter;
            const res = await api._fetch(url);
            setIssues(res?.issues || res || []);
        } catch (e) {
            console.warn('[GRID] Operator:', e.message);
        }
    };

    const hermes = status?.hermes || status?.operator || {};
    const isOnline = hermes.online || hermes.status === 'running' || hermes.active || false;

    const stats = {
        pulls_retried: 0, fixes_applied: 0, hypotheses_tested: 0, errors_diagnosed: 0,
    };
    if (Array.isArray(issues)) {
        issues.forEach(iss => {
            if (iss.fix_result === 'SUCCESS') stats.fixes_applied++;
            if (iss.severity === 'ERROR' || iss.severity === 'CRITICAL') stats.errors_diagnosed++;
        });
    }
    if (hermes.stats) Object.assign(stats, hermes.stats);

    // Subsystem health summary
    const subsystems = health?.subsystems || [];
    const healthyCt = subsystems.filter(s => s.status === 'healthy').length;
    const staleCt = subsystems.filter(s => s.status === 'stale').length;
    const errorCt = subsystems.filter(s => s.status === 'error').length;
    const emailStats = health?.email_inbox || {};
    const syncFailures = health?.sync_failures || 0;
    const issuesRecent = health?.recent_issues || [];

    return (
        <div style={shared.container}>
            <div style={shared.header}>Operator</div>

            {error && <div style={shared.error}>{error}</div>}
            {loading && <div style={{ color: colors.textMuted, fontSize: '13px', padding: '12px' }}>Loading...</div>}

            {/* Subsystem Health Overview Banner */}
            {health && !loading && (
                <div style={{
                    ...shared.card,
                    borderLeft: `3px solid ${errorCt > 0 ? colors.red : staleCt > 0 ? colors.yellow : colors.green}`,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={shared.sectionTitle}>SUBSYSTEM HEALTH</div>
                        <span style={{ fontSize: '11px', color: colors.textMuted }}>
                            auto-refreshes every 60s
                        </span>
                    </div>
                    <div style={shared.metricGrid}>
                        <div style={shared.metric}>
                            <div style={{ ...shared.metricValue, color: colors.green }}>{healthyCt}</div>
                            <div style={shared.metricLabel}>healthy</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={{ ...shared.metricValue, color: colors.yellow }}>{staleCt}</div>
                            <div style={shared.metricLabel}>stale</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={{ ...shared.metricValue, color: colors.red }}>{errorCt}</div>
                            <div style={shared.metricLabel}>errors</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={{ ...shared.metricValue, color: syncFailures > 0 ? colors.red : colors.green }}>
                                {syncFailures}
                            </div>
                            <div style={shared.metricLabel}>sync failures</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Subsystem Cards Grid */}
            {health && !loading && subsystems.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '8px',
                    marginBottom: '12px',
                }}>
                    {subsystems.map((sub) => (
                        <div key={sub.name} style={{
                            ...shared.card,
                            marginBottom: 0,
                            borderLeft: `3px solid ${STATUS_COLORS[sub.status] || colors.textMuted}`,
                            background: STATUS_BG[sub.status] || colors.card,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>
                                    {sub.name}
                                </span>
                                <span style={{
                                    ...shared.badge(STATUS_COLORS[sub.status] || colors.textMuted),
                                    fontSize: '10px',
                                    padding: '2px 8px',
                                }}>
                                    {sub.status.toUpperCase()}
                                </span>
                            </div>
                            <div style={{ fontSize: '11px', color: colors.textMuted, marginBottom: '4px' }}>
                                Interval: {sub.interval}
                            </div>
                            <div style={{ fontSize: '11px', color: colors.textDim, marginBottom: '4px' }}>
                                Last run: {relativeTime(sub.last_run)}
                            </div>
                            {sub.last_result && (
                                <div style={{
                                    fontSize: '11px', color: colors.textDim,
                                    fontFamily: colors.mono,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {sub.last_result}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Email Inbox Stats */}
            {health && !loading && (
                <div style={shared.card}>
                    <div style={shared.sectionTitle}>EMAIL INBOX</div>
                    <div style={shared.metricGrid}>
                        <div style={shared.metric}>
                            <div style={shared.metricValue}>{emailStats.total || 0}</div>
                            <div style={shared.metricLabel}>total</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={{
                                ...shared.metricValue,
                                color: (emailStats.pending || 0) > 0 ? colors.yellow : colors.green,
                            }}>
                                {emailStats.pending || 0}
                            </div>
                            <div style={shared.metricLabel}>pending</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={shared.metricValue}>{emailStats.processed || 0}</div>
                            <div style={shared.metricLabel}>processed</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={shared.metricValue}>{emailStats.spam || 0}</div>
                            <div style={shared.metricLabel}>spam</div>
                        </div>
                    </div>
                    {emailStats.last_check && (
                        <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '6px' }}>
                            Last check: {relativeTime(emailStats.last_check)}
                        </div>
                    )}
                </div>
            )}

            {/* Recent Operator Issues (from subsystem-health, last 24h) */}
            {health && !loading && issuesRecent.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                    <div style={shared.sectionTitle}>RECENT ISSUES (24H) — {health.operator_issues_24h} total</div>
                    {issuesRecent.map((iss, i) => {
                        const sevColor = SEVERITY_COLORS[iss.severity] || colors.textMuted;
                        const fixColor = FIX_COLORS[iss.fix_result] || colors.textMuted;
                        return (
                            <div key={i} style={{ ...shared.card, marginBottom: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                        <span style={shared.badge(sevColor)}>{iss.severity}</span>
                                        <span style={{
                                            fontSize: '12px', color: colors.text,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {iss.title}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                        {iss.fix_result && (
                                            <span style={shared.badge(fixColor)}>{iss.fix_result}</span>
                                        )}
                                        <span style={{ fontSize: '11px', color: colors.textMuted }}>
                                            {relativeTime(iss.created_at)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Hermes Status */}
            {status && !loading && (
                <div style={shared.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={shared.sectionTitle}>HERMES STATUS</div>
                        <span style={shared.badge(isOnline ? colors.green : colors.red)}>
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </span>
                    </div>
                    <div style={shared.metricGrid}>
                        <div style={shared.metric}>
                            <div style={shared.metricValue}>
                                {hermes.last_cycle_time || hermes.last_run || '-'}
                            </div>
                            <div style={shared.metricLabel}>last cycle</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={{
                                ...shared.metricValue,
                                color: (hermes.consecutive_failures || 0) > 0 ? colors.red : colors.green,
                            }}>
                                {hermes.consecutive_failures ?? 0}
                            </div>
                            <div style={shared.metricLabel}>consec. failures</div>
                        </div>
                        <div style={shared.metric}>
                            <div style={shared.metricValue}>{hermes.total_cycles ?? '-'}</div>
                            <div style={shared.metricLabel}>total cycles</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Current Cycle */}
            {hermes.current_step && (
                <div style={{
                    ...shared.card,
                    borderLeft: `3px solid ${colors.accent}`,
                }}>
                    <div style={shared.sectionTitle}>CURRENT CYCLE</div>
                    <div style={{ fontSize: '14px', color: colors.text, fontFamily: colors.mono }}>
                        {hermes.current_step}
                    </div>
                    {hermes.cycle_started && (
                        <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>
                            Started: {fmtDate(hermes.cycle_started)}
                        </div>
                    )}
                </div>
            )}

            {/* Stats Summary */}
            {!loading && (
                <div style={shared.card}>
                    <div style={shared.sectionTitle}>STATS SUMMARY</div>
                    <div style={shared.metricGrid}>
                        {Object.entries(stats).map(([k, v]) => (
                            <div key={k} style={shared.metric}>
                                <div style={shared.metricValue}>{v}</div>
                                <div style={shared.metricLabel}>{k.replace(/_/g, ' ')}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Issue Tracker */}
            {!loading && (
                <div>
                    <div style={shared.sectionTitle}>ISSUE TRACKER</div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: colors.textMuted }}>Severity:</span>
                            {SEVERITY_OPTIONS.map(s => (
                                <button key={s} style={shared.tab(severityFilter === s)}
                                    onClick={() => setSeverityFilter(s)}>
                                    {s}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: colors.textMuted }}>Category:</span>
                            {CATEGORY_OPTIONS.map(c => (
                                <button key={c} style={shared.tab(categoryFilter === c)}
                                    onClick={() => setCategoryFilter(c)}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    {issues.length === 0 && (
                        <div style={{ color: colors.textMuted, fontSize: '13px', padding: '16px', textAlign: 'center' }}>
                            No issues found
                        </div>
                    )}

                    {issues.map((iss, i) => {
                        const id = iss.id || i;
                        const expanded = expandedIssue === id;
                        const sevColor = SEVERITY_COLORS[iss.severity] || colors.textMuted;
                        const fixColor = FIX_COLORS[iss.fix_result] || colors.textMuted;
                        return (
                            <div key={id} style={{
                                ...shared.card, marginBottom: '6px', cursor: 'pointer',
                            }} onClick={() => setExpandedIssue(expanded ? null : id)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                        <span style={shared.badge(sevColor)}>{iss.severity}</span>
                                        <span style={{
                                            fontSize: '13px', color: colors.text,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {iss.title || iss.message || 'Untitled issue'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                                        {iss.fix_result && (
                                            <span style={shared.badge(fixColor)}>{iss.fix_result}</span>
                                        )}
                                        <span style={{ fontSize: '11px', color: colors.textMuted }}>
                                            {fmtDate(iss.created_at || iss.timestamp)}
                                        </span>
                                    </div>
                                </div>
                                {iss.source && (
                                    <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>
                                        Source: {iss.source}
                                    </div>
                                )}

                                {expanded && (
                                    <div style={{ marginTop: '10px' }}>
                                        {iss.detail && (
                                            <div style={{ fontSize: '12px', color: colors.textDim, marginBottom: '8px' }}>
                                                {iss.detail}
                                            </div>
                                        )}
                                        {iss.stack_trace && (
                                            <div style={{
                                                ...shared.prose, fontSize: '11px', maxHeight: '200px', marginBottom: '8px',
                                            }}>
                                                {iss.stack_trace}
                                            </div>
                                        )}
                                        {iss.hermes_diagnosis && (
                                            <div style={{
                                                background: colors.bg, borderRadius: '8px', padding: '12px',
                                                borderLeft: `3px solid ${colors.accent}`,
                                                fontSize: '12px', color: colors.textDim, lineHeight: '1.6',
                                                fontStyle: 'italic',
                                            }}>
                                                {iss.hermes_diagnosis}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Recent Cycles */}
            {!loading && recentCycles.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                    <div style={shared.sectionTitle}>RECENT CYCLES</div>
                    {recentCycles.map((cycle, i) => {
                        const payload = cycle.payload || cycle;
                        const metrics = {};
                        if (payload && typeof payload === 'object') {
                            for (const [k, v] of Object.entries(payload)) {
                                if (typeof v === 'number') metrics[k] = v;
                            }
                        }
                        return (
                            <div key={cycle.id || i} style={{ ...shared.card, marginBottom: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: colors.textDim, fontFamily: colors.mono }}>
                                        {fmtDate(cycle.created_at || cycle.snapshot_date)}
                                    </span>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {Object.entries(metrics).slice(0, 4).map(([k, v]) => (
                                            <span key={k} style={{ fontSize: '11px', color: colors.textMuted }}>
                                                {k.replace(/_/g, ' ')}: <span style={{ color: colors.text }}>
                                                    {Number.isInteger(v) ? v : v.toFixed(2)}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

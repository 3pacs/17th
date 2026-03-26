import React, { useEffect, useState } from 'react';
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
    narrativeCard: {
        background: tokens.card, border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md, padding: tokens.spacing.xl,
        marginBottom: tokens.spacing.lg,
    },
    narrativeTitle: {
        fontSize: '14px', fontWeight: 700, color: tokens.accent,
        fontFamily: tokens.fontMono, marginBottom: tokens.spacing.md,
        letterSpacing: '1px',
    },
    narrativeText: {
        fontSize: '12px', lineHeight: '1.8', color: tokens.text,
        fontFamily: tokens.fontMono,
    },
    paragraph: {
        marginBottom: tokens.spacing.md,
    },
    regimeTag: {
        display: 'inline-block', padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
        borderRadius: tokens.radius.sm, fontSize: '10px', fontWeight: 700,
        fontFamily: tokens.fontMono, letterSpacing: '1px', marginBottom: tokens.spacing.lg,
    },
    timestamp: {
        fontSize: '10px', color: tokens.textMuted,
        fontFamily: tokens.fontMono, marginTop: tokens.spacing.md,
    },
    sectionTitle: {
        fontSize: '10px', fontWeight: 600, color: tokens.accent,
        letterSpacing: '2px', textTransform: 'uppercase',
        fontFamily: tokens.fontMono, marginBottom: tokens.spacing.sm,
        marginTop: tokens.spacing.lg,
    },
    fallback: {
        background: tokens.card, border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.md, padding: tokens.spacing.xl,
        textAlign: 'center',
    },
    fallbackText: {
        fontSize: '12px', color: tokens.textMuted,
        fontFamily: tokens.fontMono, lineHeight: '1.8',
    },
    fallbackTitle: {
        fontSize: '14px', fontWeight: 700, color: tokens.textMuted,
        fontFamily: tokens.fontMono, marginBottom: tokens.spacing.md,
    },
    loading: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '200px', color: tokens.textMuted, fontSize: '12px', fontFamily: tokens.fontMono,
    },
    error: { color: tokens.danger, fontSize: '12px', fontFamily: tokens.fontMono, padding: tokens.spacing.lg },
};

function regimeColor(regime) {
    if (regime === 'LONG_GAMMA') return tokens.safe;
    if (regime === 'SHORT_GAMMA') return tokens.danger;
    return tokens.caution;
}

/** Parse narrative text into sections if it has headers */
function parseNarrative(text) {
    if (!text) return [];

    // Split on markdown-style headers or double newlines
    const lines = text.split('\n');
    const sections = [];
    let currentSection = { title: null, content: [] };

    for (const line of lines) {
        const trimmed = line.trim();
        // Check for headers: ##, **, or all-caps lines
        const headerMatch = trimmed.match(/^#{1,3}\s+(.+)/) ||
            trimmed.match(/^\*\*(.+)\*\*$/) ||
            (trimmed.length > 3 && trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) ? [null, trimmed] : null);

        if (headerMatch) {
            if (currentSection.title || currentSection.content.length > 0) {
                sections.push({ ...currentSection });
            }
            currentSection = { title: headerMatch[1], content: [] };
        } else if (trimmed.length > 0) {
            currentSection.content.push(trimmed);
        }
    }

    if (currentSection.title || currentSection.content.length > 0) {
        sections.push(currentSection);
    }

    return sections;
}

function FlowNarrative() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        api.getFlowNarrative()
            .then((res) => { if (!cancelled) { setData(res); setLoading(false); } })
            .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load'); setLoading(false); } });
        return () => { cancelled = true; };
    }, []);

    const narrative = data?.narrative || data?.briefing || '';
    const regime = data?.regime;
    const rc = regime ? regimeColor(regime) : null;
    const timestamp = data?.generated_at || data?.timestamp;
    const sections = parseNarrative(narrative);

    return (
        <div>
            <TickerSelector />
            <div style={styles.container}>
                <div style={styles.header}>Flow Narrative</div>
                {loading && <div style={styles.loading}>Generating narrative...</div>}
                {error && <div style={styles.error}>{error}</div>}
                {!loading && !error && (
                    <>
                        {narrative ? (
                            <div style={styles.narrativeCard}>
                                {regime && (
                                    <div style={{
                                        ...styles.regimeTag,
                                        background: `${rc}22`,
                                        color: rc,
                                    }}>
                                        {regime.replace('_', ' ')}
                                    </div>
                                )}
                                <div style={styles.narrativeTitle}>Market Flow Briefing</div>

                                {sections.length > 0 ? (
                                    <div style={styles.narrativeText}>
                                        {sections.map((s, i) => (
                                            <div key={i}>
                                                {s.title && (
                                                    <div style={styles.sectionTitle}>{s.title}</div>
                                                )}
                                                {s.content.map((line, j) => (
                                                    <div key={j} style={styles.paragraph}>{line}</div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={styles.narrativeText}>
                                        {narrative}
                                    </div>
                                )}

                                {timestamp && (
                                    <div style={styles.timestamp}>
                                        Generated: {typeof timestamp === 'string' ? timestamp : new Date(timestamp).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={styles.fallback}>
                                <div style={styles.fallbackTitle}>No Briefing Available</div>
                                <div style={styles.fallbackText}>
                                    The LLM-generated flow narrative is not yet available.
                                    This briefing combines GEX regime analysis, vanna/charm projections,
                                    OpEx dynamics, and vol surface observations into a cohesive market narrative.
                                </div>
                                <div style={{ ...styles.fallbackText, marginTop: tokens.spacing.md, color: tokens.accent }}>
                                    Check back after the next data refresh cycle.
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default FlowNarrative;

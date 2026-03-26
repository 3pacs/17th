/**
 * Hermes Inbox — Email intelligence processed by the Hermes LLM pipeline.
 * Shows messages, LLM analysis, tickers, action items, and stats.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { shared, colors, tokens } from '../styles/shared.js';

const CATEGORIES = ['All', 'News', 'Instructions', 'Updates', 'Research', 'Questions'];

const CATEGORY_COLORS = {
    news: '#3B82F6',
    instruction: '#A855F7',
    instructions: '#A855F7',
    update: '#22C55E',
    updates: '#22C55E',
    research: '#F59E0B',
    question: '#06B6D4',
    questions: '#06B6D4',
};

const SENTIMENT_COLORS = {
    bullish: colors.green,
    bearish: colors.red,
    neutral: colors.textMuted,
    urgent: colors.red,
};

const PRIORITY_COLORS = {
    high: colors.red,
    HIGH: colors.red,
    medium: '#F59E0B',
    MEDIUM: '#F59E0B',
    med: '#F59E0B',
    MED: '#F59E0B',
    low: colors.textMuted,
    LOW: colors.textMuted,
};

const STATUS_COLORS = {
    pending: '#F59E0B',
    processed: colors.green,
    rejected: colors.red,
};

const styles = {
    container: {
        padding: '16px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        maxWidth: '900px',
        margin: '0 auto',
    },
    headerRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '12px',
        gap: '12px',
        flexWrap: 'wrap',
    },
    title: {
        fontSize: '22px',
        fontWeight: 600,
        color: '#E8F0F8',
        fontFamily: "'IBM Plex Sans', sans-serif",
    },
    statsRow: {
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    statChip: (color) => ({
        fontSize: '11px',
        fontWeight: 600,
        color: color,
        padding: '4px 10px',
        borderRadius: tokens.radius.sm,
        background: `${color}15`,
        fontFamily: "'JetBrains Mono', monospace",
        whiteSpace: 'nowrap',
    }),
    filterRow: {
        display: 'flex',
        gap: '6px',
        marginBottom: '16px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        paddingBottom: '2px',
    },
    messageCard: {
        ...shared.card,
        cursor: 'pointer',
        transition: `all ${tokens.transition.fast}`,
    },
    subjectRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '8px',
        marginBottom: '6px',
    },
    subject: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#E8F0F8',
        fontFamily: "'IBM Plex Sans', sans-serif",
        lineHeight: '1.4',
    },
    meta: {
        fontSize: '11px',
        color: colors.textMuted,
        fontFamily: "'JetBrains Mono', monospace",
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: '8px',
    },
    badge: (color) => ({
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 700,
        background: `${color}20`,
        color: color,
        fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    }),
    sentimentBadge: (sentiment) => {
        const color = SENTIMENT_COLORS[sentiment?.toLowerCase()] || colors.textMuted;
        const isUrgent = sentiment?.toLowerCase() === 'urgent';
        return {
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 700,
            background: `${color}20`,
            color: color,
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            animation: isUrgent ? 'pulse 1.5s ease-in-out infinite' : 'none',
        };
    },
    statusDot: (status) => ({
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: STATUS_COLORS[status?.toLowerCase()] || colors.textMuted,
        display: 'inline-block',
        flexShrink: 0,
    }),
    summary: {
        fontSize: '12px',
        color: colors.textDim,
        lineHeight: '1.6',
        marginBottom: '8px',
    },
    tickerRow: {
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap',
        marginBottom: '8px',
    },
    tickerChip: {
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: tokens.radius.pill,
        background: `${colors.accent}20`,
        color: colors.accent,
        fontFamily: "'JetBrains Mono', monospace",
    },
    actionItemsBox: {
        background: colors.bg,
        borderRadius: tokens.radius.sm,
        padding: '10px 12px',
        marginBottom: '8px',
    },
    actionItemsLabel: {
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '1.5px',
        color: colors.textMuted,
        marginBottom: '6px',
        fontFamily: "'JetBrains Mono', monospace",
    },
    actionItem: {
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        padding: '4px 0',
        fontSize: '12px',
        color: colors.text,
        lineHeight: '1.4',
    },
    checkbox: {
        width: '14px',
        height: '14px',
        borderRadius: '3px',
        border: `1.5px solid ${colors.border}`,
        flexShrink: 0,
        marginTop: '2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
    },
    expandedBody: {
        fontSize: '12px',
        color: colors.textDim,
        lineHeight: '1.7',
        whiteSpace: 'pre-wrap',
        padding: '12px',
        background: colors.bg,
        borderRadius: tokens.radius.sm,
        marginTop: '8px',
        maxHeight: '400px',
        overflowY: 'auto',
        fontFamily: "'JetBrains Mono', monospace",
    },
    archiveBtn: {
        background: 'transparent',
        border: `1px solid ${colors.border}`,
        borderRadius: tokens.radius.sm,
        padding: '6px 14px',
        fontSize: '11px',
        fontWeight: 600,
        color: colors.textMuted,
        cursor: 'pointer',
        fontFamily: "'JetBrains Mono', monospace",
        minHeight: '32px',
        transition: `all ${tokens.transition.fast}`,
    },
    bottomSection: {
        ...shared.card,
        borderLeft: `3px solid #F59E0B`,
        marginTop: '8px',
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px 20px',
        color: colors.textMuted,
    },
    loadingState: {
        textAlign: 'center',
        padding: '60px 20px',
        color: colors.textMuted,
        fontSize: '14px',
    },
};

function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function getCategoryColor(cat) {
    return CATEGORY_COLORS[cat?.toLowerCase()] || colors.accent;
}

export default function HermesInbox() {
    const [messages, setMessages] = useState([]);
    const [stats, setStats] = useState(null);
    const [actionItems, setActionItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeCategory, setActiveCategory] = useState('All');
    const [expandedId, setExpandedId] = useState(null);
    const [archiving, setArchiving] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const category = activeCategory === 'All' ? '' : activeCategory.toLowerCase();
            const [msgs, st, actions] = await Promise.all([
                api.getInboxMessages('', 50, category).catch(() => ({ messages: [] })),
                api.getInboxStats().catch(() => null),
                api.getInboxActionItems('pending').catch(() => ({ action_items: [] })),
            ]);
            setMessages(msgs?.messages || msgs?.items || (Array.isArray(msgs) ? msgs : []));
            setStats(st);
            setActionItems(actions?.action_items || actions?.items || (Array.isArray(actions) ? actions : []));
        } catch (e) {
            setError('Failed to load inbox');
        }
        setLoading(false);
    }, [activeCategory]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleArchive = async (e, id) => {
        e.stopPropagation();
        setArchiving(id);
        try {
            await api.archiveInboxMessage(id);
            setMessages(prev => prev.filter(m => m.id !== id));
            if (stats) {
                setStats(prev => prev ? { ...prev, archived: (prev.archived || 0) + 1 } : prev);
            }
        } catch (err) {
            // silently fail
        }
        setArchiving(null);
    };

    const handleExpand = (id) => {
        setExpandedId(prev => prev === id ? null : id);
    };

    const totalProcessed = stats?.processed || stats?.total_processed || 0;
    const totalPending = stats?.pending || stats?.total_pending || 0;
    const totalActions = stats?.action_items || stats?.total_action_items || actionItems.length;

    return (
        <div style={styles.container}>
            {/* Pulse animation for urgent badges */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>

            {/* Header with stats */}
            <div style={styles.headerRow}>
                <span style={styles.title}>Hermes Inbox</span>
                <div style={styles.statsRow}>
                    <span style={styles.statChip(colors.green)}>
                        {totalProcessed} processed
                    </span>
                    <span style={styles.statChip('#F59E0B')}>
                        {totalPending} pending
                    </span>
                    <span style={styles.statChip(colors.red)}>
                        {totalActions} actions
                    </span>
                </div>
            </div>

            {/* Category filter tabs */}
            <div style={styles.filterRow}>
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        style={shared.tab(activeCategory === cat)}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Loading / Error / Empty */}
            {loading && (
                <div style={styles.loadingState}>Loading inbox...</div>
            )}

            {error && !loading && (
                <div style={styles.emptyState}>
                    <div style={{ color: colors.red, marginBottom: '12px' }}>{error}</div>
                    <button style={shared.buttonSmall} onClick={loadData}>Retry</button>
                </div>
            )}

            {!loading && !error && messages.length === 0 && (
                <div style={styles.emptyState}>
                    <div style={{
                        fontSize: '32px', marginBottom: '16px',
                    }}>&#x1F4EC;</div>
                    <div style={{
                        fontSize: '14px', color: colors.text, marginBottom: '8px',
                        fontWeight: 600,
                    }}>
                        No messages yet
                    </div>
                    <div style={{ fontSize: '12px', color: colors.textMuted, lineHeight: '1.6' }}>
                        Email hermes@stepdad.finance to get started.
                    </div>
                </div>
            )}

            {/* Message cards */}
            {!loading && !error && messages.map(msg => {
                const isExpanded = expandedId === msg.id;
                const catColor = getCategoryColor(msg.category);
                const msgActions = msg.action_items || [];
                const tickers = msg.tickers || [];
                const notes = msg.notes || msg.hermes_notes || '';

                return (
                    <div
                        key={msg.id}
                        onClick={() => handleExpand(msg.id)}
                        style={{
                            ...styles.messageCard,
                            borderLeft: `3px solid ${catColor}`,
                        }}
                    >
                        {/* Subject row */}
                        <div style={styles.subjectRow}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                <div style={styles.statusDot(msg.status)} />
                                <span style={styles.subject}>
                                    {msg.subject || '(no subject)'}
                                </span>
                            </div>
                            <span style={{
                                fontSize: '10px', color: colors.textMuted,
                                whiteSpace: 'nowrap', flexShrink: 0,
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>
                                {timeAgo(msg.received_at || msg.created_at || msg.timestamp)}
                            </span>
                        </div>

                        {/* Meta line: from, category, sentiment */}
                        <div style={styles.meta}>
                            {msg.from_address && (
                                <span>From: {msg.from_address}</span>
                            )}
                            {msg.category && (
                                <span style={styles.badge(catColor)}>
                                    {msg.category}
                                </span>
                            )}
                            {msg.sentiment && (
                                <span style={styles.sentimentBadge(msg.sentiment)}>
                                    {msg.sentiment}
                                </span>
                            )}
                        </div>

                        {/* LLM Summary */}
                        {(msg.summary || msg.llm_summary) && (
                            <div style={styles.summary}>
                                {msg.summary || msg.llm_summary}
                            </div>
                        )}

                        {/* Tickers */}
                        {tickers.length > 0 && (
                            <div style={styles.tickerRow}>
                                {tickers.map(t => (
                                    <span key={t} style={styles.tickerChip}>{t}</span>
                                ))}
                            </div>
                        )}

                        {/* Action items */}
                        {msgActions.length > 0 && (
                            <div style={styles.actionItemsBox}>
                                <div style={styles.actionItemsLabel}>ACTION ITEMS</div>
                                {msgActions.map((ai, idx) => {
                                    const priColor = PRIORITY_COLORS[ai.priority] || colors.textMuted;
                                    return (
                                        <div key={idx} style={styles.actionItem}>
                                            <div style={styles.checkbox}>
                                                {ai.status === 'done' && (
                                                    <span style={{ color: colors.green, fontSize: '10px', lineHeight: 1 }}>&#10003;</span>
                                                )}
                                            </div>
                                            <span style={{ flex: 1 }}>
                                                {ai.description || ai.text || ai.action}
                                            </span>
                                            {ai.priority && (
                                                <span style={{
                                                    fontSize: '9px', fontWeight: 700,
                                                    color: priColor,
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    flexShrink: 0,
                                                }}>
                                                    {String(ai.priority).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Notes preview (collapsed) */}
                        {notes && !isExpanded && (
                            <div style={{
                                fontSize: '11px', color: colors.textMuted,
                                fontStyle: 'italic', marginBottom: '6px',
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {notes}
                            </div>
                        )}

                        {/* Expanded details */}
                        {isExpanded && (
                            <>
                                {(msg.body || msg.full_body) && (
                                    <div style={styles.expandedBody}>
                                        {msg.body || msg.full_body}
                                    </div>
                                )}

                                {(msg.plans || msg.hermes_plan) && (
                                    <div style={{ marginTop: '8px' }}>
                                        <div style={styles.actionItemsLabel}>HERMES PLAN</div>
                                        <div style={{
                                            ...styles.expandedBody,
                                            marginTop: '4px',
                                            maxHeight: '200px',
                                        }}>
                                            {typeof (msg.plans || msg.hermes_plan) === 'string'
                                                ? (msg.plans || msg.hermes_plan)
                                                : JSON.stringify(msg.plans || msg.hermes_plan, null, 2)
                                            }
                                        </div>
                                    </div>
                                )}

                                {(msg.hermes_response || msg.llm_response) && (
                                    <div style={{ marginTop: '8px' }}>
                                        <div style={styles.actionItemsLabel}>HERMES RESPONSE</div>
                                        <div style={{
                                            ...styles.expandedBody,
                                            marginTop: '4px',
                                            maxHeight: '200px',
                                        }}>
                                            {msg.hermes_response || msg.llm_response}
                                        </div>
                                    </div>
                                )}

                                {notes && (
                                    <div style={{ marginTop: '8px' }}>
                                        <div style={styles.actionItemsLabel}>NOTES</div>
                                        <div style={{
                                            fontSize: '12px', color: colors.textDim,
                                            lineHeight: '1.6', marginTop: '4px',
                                        }}>
                                            {notes}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Archive button */}
                        <div style={{
                            display: 'flex', justifyContent: 'flex-end',
                            marginTop: '8px', gap: '8px',
                        }}>
                            {isExpanded && (
                                <span style={{
                                    fontSize: '10px', color: colors.textMuted,
                                    alignSelf: 'center',
                                }}>
                                    Click card to collapse
                                </span>
                            )}
                            <button
                                onClick={(e) => handleArchive(e, msg.id)}
                                disabled={archiving === msg.id}
                                style={{
                                    ...styles.archiveBtn,
                                    ...(archiving === msg.id ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                                }}
                            >
                                {archiving === msg.id ? 'Archiving...' : 'Archive'}
                            </button>
                        </div>
                    </div>
                );
            })}

            {/* Pending action items (aggregated) */}
            {!loading && !error && actionItems.length > 0 && (
                <div style={styles.bottomSection}>
                    <div style={{
                        ...shared.sectionTitle,
                        color: '#F59E0B',
                        marginBottom: '10px',
                    }}>
                        PENDING ACTION ITEMS
                    </div>
                    {actionItems.map((ai, idx) => {
                        const priColor = PRIORITY_COLORS[ai.priority] || colors.textMuted;
                        return (
                            <div key={idx} style={{
                                ...styles.actionItem,
                                padding: '6px 0',
                                borderBottom: idx < actionItems.length - 1
                                    ? `1px solid ${colors.borderSubtle}`
                                    : 'none',
                            }}>
                                <div style={styles.checkbox} />
                                <div style={{ flex: 1 }}>
                                    <span>{ai.description || ai.text || ai.action}</span>
                                    {(ai.from_subject || ai.email_subject) && (
                                        <span style={{
                                            fontSize: '10px', color: colors.textMuted,
                                            marginLeft: '8px',
                                            fontStyle: 'italic',
                                        }}>
                                            from: {ai.from_subject || ai.email_subject}
                                        </span>
                                    )}
                                </div>
                                {ai.priority && (
                                    <span style={{
                                        fontSize: '9px', fontWeight: 700,
                                        color: priColor,
                                        padding: '2px 6px',
                                        borderRadius: '3px',
                                        background: `${priColor}15`,
                                        fontFamily: "'JetBrains Mono', monospace",
                                        flexShrink: 0,
                                    }}>
                                        {String(ai.priority).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ height: '80px' }} />
        </div>
    );
}

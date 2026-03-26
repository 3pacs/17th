import React, { useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import ChineseCalendar from '../components/ChineseCalendar.jsx';
import SolarActivityGauge from '../components/SolarActivityGauge.jsx';
import { buildNarrativeFallback } from '../lib/mockData.js';
import { extractChineseMetrics, extractSolarMetrics } from '../lib/mockData.js';
import { normalizeCelestialCategories } from '../lib/interpret.js';
import useStore from '../store.js';
import { tokens, styles } from '../styles/tokens.js';

const narrStyles = {
    briefingCard: {
        ...styles.card,
        padding: tokens.spacing.xl,
        lineHeight: '1.8',
        fontSize: '14px',
        color: tokens.text,
        whiteSpace: 'pre-wrap',
        fontFamily: tokens.fontSans,
    },
    timestamp: {
        fontSize: '11px',
        color: tokens.textMuted,
        fontFamily: tokens.fontMono,
        marginBottom: tokens.spacing.md,
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: tokens.spacing.md,
    },
};

export default function Narrative() {
    const { briefing, setBriefing, celestialData, narrativeData, setNarrativeData } = useStore();
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const categories = normalizeCelestialCategories(celestialData);
    const solar = extractSolarMetrics(celestialData);
    const chinese = extractChineseMetrics(celestialData);
    const fallbackBriefing = useMemo(() => buildNarrativeFallback(new Date(), celestialData), [celestialData]);

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        api.getBriefing()
            .then((data) => {
                if (cancelled) return;
                setNarrativeData(data);
                setBriefing(data.briefing || data.text || data.content || fallbackBriefing);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e.message);
                setBriefing(fallbackBriefing);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [fallbackBriefing, setBriefing, setNarrativeData]);

    return (
        <div style={styles.container}>
            <div style={styles.header}>Celestial Narrative</div>
            <div style={styles.subheader}>Intelligence Briefing</div>

            {error && <div style={styles.error}>{error}</div>}
            {loading && <div style={styles.loading}>Generating celestial briefing...</div>}

            <div style={narrStyles.briefingCard}>
                {narrativeData?.created_at || narrativeData?.generated_at || narrativeData?.briefing_date ? (
                    <div style={narrStyles.timestamp}>
                        {narrativeData.created_at || narrativeData.generated_at || narrativeData.briefing_date}
                        {narrativeData.stale ? ' | stale briefing' : ''}
                    </div>
                ) : (
                    <div style={narrStyles.timestamp}>Frontend fallback narrative</div>
                )}
                {briefing || fallbackBriefing}
            </div>

            <div style={{ ...styles.subheader, marginTop: tokens.spacing.xl }}>Telemetry Coverage</div>
            <div style={narrStyles.grid}>
                {Object.entries(categories).map(([key, items]) => (
                    <div key={key} style={styles.metric}>
                        <div style={styles.metricValue}>{items.length}</div>
                        <div style={styles.metricLabel}>{key}</div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: tokens.spacing.lg }}>
                <SolarActivityGauge
                    kpIndex={solar.kpIndex}
                    sunspotNumber={solar.sunspotNumber}
                    solarWindSpeed={solar.solarWindSpeed}
                    flareClass={solar.flareClass}
                />
            </div>

            <div style={{ marginTop: tokens.spacing.lg }}>
                <ChineseCalendar {...chinese} />
            </div>
        </div>
    );
}

import React, { useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import { getFullEphemeris } from '../lib/ephemeris.js';
import useStore from '../store.js';
import { tokens, styles } from '../styles/tokens.js';

const ephStyles = {
    dateInput: {
        background: 'rgba(10, 18, 35, 0.6)',
        border: `1px solid ${tokens.cardBorder}`,
        borderRadius: tokens.radius.sm,
        color: tokens.text,
        padding: '10px 14px',
        fontSize: '14px',
        fontFamily: tokens.fontMono,
        width: '100%',
        boxSizing: 'border-box',
        colorScheme: 'dark',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: tokens.spacing.md,
    },
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: `1px solid rgba(74, 158, 255, 0.08)`,
    },
    planetName: {
        fontSize: '14px',
        fontWeight: 600,
        color: tokens.textBright,
    },
    planetMeta: {
        fontSize: '12px',
        color: tokens.textMuted,
        fontFamily: tokens.fontMono,
        marginTop: '4px',
    },
    planetSign: {
        fontSize: '13px',
        color: tokens.purple,
        fontFamily: tokens.fontMono,
        textAlign: 'right',
    },
};

function normalizeApiEphemeris(data) {
    if (!data) return null;
    if (Array.isArray(data.planets)) return data;

    if (data.ephemeris) {
        return {
            date: data.date,
            ephemeris: data.ephemeris,
        };
    }

    return null;
}

export default function Ephemeris() {
    const { selectedDate, setSelectedDate } = useStore();
    const [apiData, setApiData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const localData = useMemo(() => getFullEphemeris(new Date(`${selectedDate}T12:00:00Z`)), [selectedDate]);

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        setError(null);
        api.getEphemeris(selectedDate)
            .then((data) => {
                if (!cancelled) setApiData(normalizeApiEphemeris(data));
            })
            .catch((e) => {
                if (!cancelled) {
                    setApiData(null);
                    setError(e.message);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedDate]);

    const positions = Object.values(localData.positions);
    const aspects = localData.aspects.slice(0, 8);

    return (
        <div style={styles.container}>
            <div style={styles.header}>Ephemeris</div>
            <div style={styles.subheader}>Planetary Positions</div>

            <div style={{ marginBottom: tokens.spacing.lg }}>
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    style={ephStyles.dateInput}
                />
            </div>

            {loading && <div style={styles.loading}>Calculating positions...</div>}

            <div style={ephStyles.grid}>
                <div style={styles.card}>
                    <div style={styles.subheader}>Computed Snapshot</div>
                    <div style={styles.metricGrid}>
                        <div style={styles.metric}>
                            <div style={styles.metricValue}>{localData.retrograde_planets.length}</div>
                            <div style={styles.metricLabel}>Retrogrades</div>
                        </div>
                        <div style={styles.metric}>
                            <div style={styles.metricValue}>{localData.aspects.length}</div>
                            <div style={styles.metricLabel}>Aspects</div>
                        </div>
                        <div style={styles.metric}>
                            <div style={styles.metricValue}>{localData.lunar_phase.phase_name}</div>
                            <div style={styles.metricLabel}>Moon Phase</div>
                        </div>
                        <div style={styles.metric}>
                            <div style={styles.metricValue}>{localData.nakshatra.nakshatra_name}</div>
                            <div style={styles.metricLabel}>Nakshatra</div>
                        </div>
                    </div>
                </div>

                <div style={styles.card}>
                    <div style={styles.subheader}>API Status</div>
                    <div style={styles.value}>
                        {apiData ? 'AstroGrid ephemeris endpoint responded.' : 'Using deterministic local ephemeris fallback.'}
                    </div>
                    {error && (
                        <div style={{ ...styles.label, marginTop: tokens.spacing.sm }}>
                            {error}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ ...styles.subheader, marginTop: tokens.spacing.xl }}>Bodies</div>
            <div style={styles.card}>
                {positions.map((planet) => (
                    <div key={planet.planet} style={ephStyles.row}>
                        <div>
                            <div style={ephStyles.planetName}>{planet.planet}</div>
                            <div style={ephStyles.planetMeta}>
                                {planet.geocentric_longitude.toFixed(2)}° | {planet.right_ascension.toFixed(2)} RA
                            </div>
                        </div>
                        <div style={ephStyles.planetSign}>
                            {planet.zodiac_sign} {planet.zodiac_degree.toFixed(2)}°
                            <div style={ephStyles.planetMeta}>{planet.is_retrograde ? 'Retrograde' : 'Direct'}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ ...styles.subheader, marginTop: tokens.spacing.xl }}>Major Aspects</div>
            <div style={styles.card}>
                {aspects.map((aspect) => (
                    <div key={`${aspect.planet1}-${aspect.planet2}-${aspect.aspect_type}`} style={ephStyles.row}>
                        <div>
                            <div style={ephStyles.planetName}>{aspect.planet1} {aspect.aspect_type} {aspect.planet2}</div>
                            <div style={ephStyles.planetMeta}>{aspect.nature} | {aspect.applying ? 'Applying' : 'Separating'}</div>
                        </div>
                        <div style={ephStyles.planetSign}>{aspect.orb_used.toFixed(2)}° orb</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

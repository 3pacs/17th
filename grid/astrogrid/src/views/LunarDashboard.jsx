import React, { useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import ChineseCalendar from '../components/ChineseCalendar.jsx';
import EclipseCountdown from '../components/EclipseCountdown.jsx';
import MoonPhaseWheel from '../components/MoonPhaseWheel.jsx';
import NakshatraWheel from '../components/NakshatraWheel.jsx';
import SolarActivityGauge from '../components/SolarActivityGauge.jsx';
import { computeLunarPhase, computeNakshatra } from '../lib/ephemeris.js';
import { buildEclipseFallback, extractChineseMetrics, extractSolarMetrics } from '../lib/mockData.js';
import useStore from '../store.js';
import { tokens, styles } from '../styles/tokens.js';

export default function LunarDashboard() {
    const { celestialData, preferences, selectedDate, setCelestialData } = useStore();
    const [error, setError] = useState(null);
    const [eclipses, setEclipses] = useState(null);

    const date = useMemo(() => new Date(`${selectedDate}T12:00:00Z`), [selectedDate]);
    const lunar = useMemo(() => computeLunarPhase(date), [date]);
    const nakshatra = useMemo(() => computeNakshatra(date), [date]);
    const solar = extractSolarMetrics(celestialData);
    const chinese = extractChineseMetrics(celestialData);

    useEffect(() => {
        let cancelled = false;

        if (!celestialData?.count && preferences.useLiveTelemetry) {
            api.getCelestialSignals()
                .then((payload) => {
                    if (!cancelled) setCelestialData(payload);
                })
                .catch((e) => {
                    if (!cancelled) setError(e.message);
                });
        }

        api.getEclipses()
            .then((payload) => {
                if (!cancelled) setEclipses(payload);
            })
            .catch(() => {
                if (!cancelled) setEclipses(buildEclipseFallback(date));
            });

        return () => {
            cancelled = true;
        };
    }, [celestialData?.count, date, preferences.useLiveTelemetry, setCelestialData]);

    return (
        <div style={styles.container}>
            <div style={styles.header}>Lunar Dashboard</div>
            <div style={styles.subheader}>Moon Phase and Regime Overlay</div>

            {error && <div style={styles.error}>{error}</div>}

            <MoonPhaseWheel
                phase={lunar.phase}
                illumination={Math.round(lunar.illumination)}
                label={lunar.phase_name}
                regime={lunar.phase < 0.5 ? 'Expansion' : 'Distribution'}
                subtitle={`${lunar.days_to_full.toFixed(1)} days to full moon, ${lunar.days_to_new.toFixed(1)} days to new moon.`}
            />

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: tokens.spacing.md,
                marginTop: tokens.spacing.lg,
            }}>
                <NakshatraWheel
                    index={nakshatra.nakshatra_index}
                    name={nakshatra.nakshatra_name}
                    quality={nakshatra.quality}
                    rulingPlanet={nakshatra.ruling_planet}
                    deity={nakshatra.deity}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.md }}>
                    <EclipseCountdown eclipse={eclipses?.next_lunar || buildEclipseFallback(date).next_lunar} title="Next Lunar Eclipse" />
                    <SolarActivityGauge
                        kpIndex={solar.kpIndex}
                        sunspotNumber={solar.sunspotNumber}
                        solarWindSpeed={solar.solarWindSpeed}
                        flareClass={solar.flareClass}
                    />
                </div>
            </div>

            {preferences.showChineseLayer && (
                <div style={{ marginTop: tokens.spacing.lg }}>
                    <ChineseCalendar {...chinese} />
                </div>
            )}
        </div>
    );
}

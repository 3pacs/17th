import React, { useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import CelestialTimeline from '../components/CelestialTimeline.jsx';
import EclipseCountdown from '../components/EclipseCountdown.jsx';
import { buildEclipseFallback, buildTimelineFallback } from '../lib/mockData.js';
import useStore from '../store.js';
import { tokens, styles } from '../styles/tokens.js';

export default function Timeline() {
    const { selectedDate } = useStore();
    const [events, setEvents] = useState([]);
    const [eclipses, setEclipses] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const date = useMemo(() => new Date(`${selectedDate}T12:00:00Z`), [selectedDate]);
    const fallbackEvents = useMemo(() => buildTimelineFallback(date), [date]);
    const fallbackEclipses = useMemo(() => buildEclipseFallback(date), [date]);

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        Promise.all([
            api.getTimeline({
                start: selectedDate,
                end: new Date(date.getTime() + 1000 * 60 * 60 * 24 * 60).toISOString().slice(0, 10),
            }).catch(() => ({ events: fallbackEvents })),
            api.getEclipses().catch(() => fallbackEclipses),
        ])
            .then(([timelinePayload, eclipsePayload]) => {
                if (cancelled) return;
                setEvents(Array.isArray(timelinePayload) ? timelinePayload : timelinePayload.events || fallbackEvents);
                setEclipses(eclipsePayload || fallbackEclipses);
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(e.message);
                    setEvents(fallbackEvents);
                    setEclipses(fallbackEclipses);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [date, fallbackEclipses, fallbackEvents, selectedDate]);

    return (
        <div style={styles.container}>
            <div style={styles.header}>Celestial Timeline</div>
            <div style={styles.subheader}>Upcoming Events</div>

            {error && <div style={styles.error}>{error}</div>}
            {loading && <div style={styles.loading}>Loading timeline...</div>}

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: tokens.spacing.md,
                marginBottom: tokens.spacing.lg,
            }}>
                <EclipseCountdown eclipse={eclipses?.next_lunar || fallbackEclipses.next_lunar} title="Next Lunar Eclipse" />
                <EclipseCountdown eclipse={eclipses?.next_solar || fallbackEclipses.next_solar} title="Next Solar Eclipse" accent={tokens.gold} />
            </div>

            <CelestialTimeline
                events={events.length ? events : fallbackEvents}
                title="Event Ribbon"
                subtitle="Forecast windows, aspects, and eclipse checkpoints"
            />
        </div>
    );
}

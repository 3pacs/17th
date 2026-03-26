import React, { useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import CorrelationHeatmap from '../components/CorrelationHeatmap.jsx';
import { buildCorrelationMatrix } from '../lib/mockData.js';
import useStore from '../store.js';
import { tokens, styles } from '../styles/tokens.js';

function normalizeApiCorrelations(payload) {
    const rows = Array.isArray(payload?.correlations) ? payload.correlations : [];
    if (!rows.length) return null;

    const rowLabels = [...new Set(rows.map((item) => item.celestial_feature || item.feature || item.name).filter(Boolean))];
    const columnLabels = [...new Set(rows.map((item) => item.market_feature || item.market || item.ticker).filter(Boolean))];
    if (!rowLabels.length || !columnLabels.length) return null;

    const matrix = rowLabels.map((row) => columnLabels.map((column) => {
        const match = rows.find((item) =>
            (item.celestial_feature || item.feature || item.name) === row
            && (item.market_feature || item.market || item.ticker) === column
        );
        return Number(match?.correlation ?? match?.value ?? 0);
    }));

    return { rows: rowLabels, columns: columnLabels, matrix };
}

export default function Correlations() {
    const { celestialData, correlationData, setCorrelationData } = useStore();
    const [hovered, setHovered] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const fallback = useMemo(() => buildCorrelationMatrix(celestialData), [celestialData]);
    const heatmapData = useMemo(() => {
        if (Array.isArray(correlationData) && correlationData.length) {
            return normalizeApiCorrelations({ correlations: correlationData }) || fallback;
        }
        return fallback;
    }, [correlationData, fallback]);

    useEffect(() => {
        let cancelled = false;

        setLoading(true);
        api.getCorrelations({ market: 'spy', feature: 'lunar_phase', period: '1Y' })
            .then((data) => {
                if (!cancelled && Array.isArray(data?.correlations)) {
                    setCorrelationData(data.correlations);
                }
            })
            .catch((e) => {
                if (!cancelled) setError(e.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [setCorrelationData]);

    return (
        <div style={styles.container}>
            <div style={styles.header}>Celestial Correlations</div>
            <div style={styles.subheader}>Market-Astro Patterns</div>

            {error && <div style={styles.error}>{error}</div>}
            {loading && <div style={styles.loading}>Analyzing correlations...</div>}

            <CorrelationHeatmap
                rows={heatmapData.rows.map((row) => row.label || row)}
                columns={heatmapData.columns.map((column) => column.label || column)}
                matrix={
                    heatmapData.matrix
                    || heatmapData.rows.map((row) =>
                        heatmapData.columns.map((column) => {
                            const cell = heatmapData.cells.find((item) =>
                                item.rowKey === row.key && item.columnKey === column.key
                            );
                            return cell?.value ?? 0;
                        })
                    )
                }
                title="Celestial x Market Correlations"
                subtitle="Stable signal feed plus deterministic fallback matrix"
                onCellHover={setHovered}
            />

            <div style={{ marginTop: tokens.spacing.lg }} />
            <div style={styles.card}>
                <div style={styles.subheader}>Hovered Cell</div>
                <div style={styles.value}>
                    {hovered
                        ? `${hovered.row} vs ${hovered.column}: ${hovered.value.toFixed(2)}`
                        : 'Hover a heatmap cell to inspect a relationship.'}
                </div>
            </div>
        </div>
    );
}

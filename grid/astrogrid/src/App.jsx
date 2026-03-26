import React, { Suspense, lazy, useEffect } from 'react';
import api from './api.js';
import useStore from './store.js';
import NavBar from './components/NavBar.jsx';
import { tokens } from './styles/tokens.js';

const Orrery = lazy(() => import('./views/Orrery.jsx'));
const LunarDashboard = lazy(() => import('./views/LunarDashboard.jsx'));
const Ephemeris = lazy(() => import('./views/Ephemeris.jsx'));
const Correlations = lazy(() => import('./views/Correlations.jsx'));
const Timeline = lazy(() => import('./views/Timeline.jsx'));
const Narrative = lazy(() => import('./views/Narrative.jsx'));
const Settings = lazy(() => import('./views/Settings.jsx'));

const VIEW_IDS = new Set([
    'orrery',
    'lunar',
    'ephemeris',
    'correlations',
    'timeline',
    'narrative',
    'settings',
]);

function getViewFromHash() {
    if (typeof window === 'undefined') {
        return 'orrery';
    }

    const hash = window.location.hash.startsWith('#/')
        ? window.location.hash.slice(2)
        : '';

    return VIEW_IDS.has(hash) ? hash : 'orrery';
}

const appStyles = {
    app: {
        background: tokens.bgGradient,
        minHeight: '100vh',
        color: tokens.text,
        fontFamily: tokens.fontSans,
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
    },
    loadingShell: {
        minHeight: 'calc(100vh - 76px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: tokens.textMuted,
        fontFamily: tokens.fontMono,
        fontSize: '13px',
        letterSpacing: '1px',
    },
    loginScreen: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: tokens.bgGradient,
        gap: '16px',
    },
    loginTitle: {
        fontFamily: tokens.fontMono,
        fontSize: '28px',
        fontWeight: 700,
        color: tokens.accent,
        letterSpacing: '6px',
    },
    loginSubtitle: {
        fontSize: '13px',
        color: tokens.textMuted,
    },
    loginLink: {
        marginTop: '12px',
        padding: '12px 32px',
        background: tokens.accent,
        color: '#fff',
        border: 'none',
        borderRadius: tokens.radius.md,
        fontFamily: tokens.fontSans,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        textDecoration: 'none',
    },
};

function App() {
    const {
        isAuthenticated,
        activeView,
        celestialData,
        preferences,
        setActiveView,
        setCelestialData,
        setCelestialTelemetryState,
    } = useStore();

    useEffect(() => {
        const syncFromHash = () => {
            setActiveView(getViewFromHash());
        };

        if (!window.location.hash) {
            window.location.hash = '#/orrery';
        }
        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);

        return () => {
            window.removeEventListener('hashchange', syncFromHash);
        };
    }, [setActiveView]);

    useEffect(() => {
        let cancelled = false;

        if (!isAuthenticated) {
            return () => {
                cancelled = true;
            };
        }

        if (!preferences.useLiveTelemetry) {
            setCelestialTelemetryState('disabled', 'Live telemetry is disabled for this session.');
            return () => {
                cancelled = true;
            };
        }

        if (celestialData?.categories) {
            setCelestialTelemetryState('cached', 'Live celestial telemetry is already cached for this session.');
            return () => {
                cancelled = true;
            };
        }

        setCelestialTelemetryState('loading', 'Loading live celestial telemetry for this session.');
        api.getCelestialSignals()
            .then((payload) => {
                if (cancelled) return;
                setCelestialData(payload);
                setCelestialTelemetryState('live', 'Live celestial telemetry loaded for this session.');
            })
            .catch((error) => {
                if (cancelled) return;
                setCelestialTelemetryState(
                    'demo',
                    `Live celestial telemetry is unavailable right now: ${error.message}`
                );
            });

        return () => {
            cancelled = true;
        };
    }, [
        celestialData?.categories,
        isAuthenticated,
        preferences.useLiveTelemetry,
        setCelestialData,
        setCelestialTelemetryState,
    ]);

    const navigate = (view) => {
        setActiveView(view);
        window.location.hash = `#/${view}`;
    };

    if (!isAuthenticated) {
        return (
            <div style={appStyles.loginScreen}>
                <div style={appStyles.loginTitle}>ASTROGRID</div>
                <div style={appStyles.loginSubtitle}>Celestial Intelligence</div>
                <div style={{ ...appStyles.loginSubtitle, marginTop: '24px' }}>
                    Please log in to GRID first.
                </div>
                <a href="/" style={appStyles.loginLink}>Go to GRID Login</a>
            </div>
        );
    }

    const renderView = () => {
        switch (activeView) {
            case 'orrery': return <Orrery />;
            case 'lunar': return <LunarDashboard />;
            case 'ephemeris': return <Ephemeris />;
            case 'correlations': return <Correlations />;
            case 'timeline': return <Timeline />;
            case 'narrative': return <Narrative />;
            case 'settings': return <Settings />;
            default: return <Orrery />;
        }
    };

    return (
        <div style={appStyles.app}>
            <div style={appStyles.content}>
                <Suspense fallback={<div style={appStyles.loadingShell}>Loading AstroGrid...</div>}>
                    {renderView()}
                </Suspense>
            </div>
            <NavBar activeView={activeView} onNavigate={navigate} />
        </div>
    );
}

export default App;

import React, { useState, useEffect, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import useStore from './store.js';
import { api } from './api.js';
import NavBar from './components/NavBar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ROUTE_MAP, DEFAULT_ROUTE, Login } from './config/routes.js';

const styles = {
    app: {
        background: '#080C10',
        minHeight: '100vh',
        color: '#C8D8E8',
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
    },
    notifContainer: {
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: '16px',
        right: '16px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        pointerEvents: 'none',
    },
    notification: {
        padding: '12px 16px',
        borderRadius: '8px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '14px',
        animation: 'slideDown 0.3s ease',
        pointerEvents: 'auto',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    },
    suspenseFallback: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        color: '#5A7080',
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: '14px',
    },
};

function App() {
    const {
        isAuthenticated, activeView, notifications, setActiveView,
        clearAuth, handleWsMessage, removeNotification,
    } = useStore();

    const [entryId, setEntryId] = useState(null);

    useEffect(() => {
        const hash = window.location.hash.slice(2) || 'dashboard';
        if (hash.startsWith('journal/')) {
            setEntryId(parseInt(hash.split('/')[1]));
            setActiveView('journal-entry');
        } else {
            setActiveView(hash);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            api.connectWebSocket((msg) => {
                handleWsMessage(msg);
            });
            return () => api.disconnectWebSocket();
        }
    }, [isAuthenticated]);

    const navigate = (view, id) => {
        if (view === 'journal-entry' && id) {
            setEntryId(id);
            window.location.hash = `#/journal/${id}`;
        } else {
            window.location.hash = `#/${view}`;
        }
        setActiveView(view);
    };

    if (!isAuthenticated) {
        return (
            <Suspense fallback={<div style={styles.suspenseFallback}>Loading...</div>}>
                <Login />
            </Suspense>
        );
    }

    const renderView = () => {
        const route = ROUTE_MAP[activeView];
        const View = route ? route.component : DEFAULT_ROUTE.component;

        // Views that need special props
        switch (activeView) {
            case 'dashboard':
                return <View onNavigate={navigate} />;
            case 'journal':
                return <View onNavigate={navigate} />;
            case 'journal-entry':
                return <View entryId={entryId} onBack={() => navigate('journal')} />;
            case 'associations':
                return <View onNavigate={(v) => window.location.hash = `#/${v}`} />;
            case 'settings':
                return <View onLogout={() => { clearAuth(); }} />;
            default:
                return <View />;
        }
    };

    const notifColors = {
        info: '#1A6EBF',
        success: '#1A7A4A',
        error: '#8B1F1F',
        warning: '#8A6000',
    };

    return (
        <div style={styles.app}>
            <div style={styles.notifContainer}>
                {notifications.map((n, i) => (
                    <div
                        key={n.id}
                        onClick={() => removeNotification?.(n.id)}
                        style={{
                            ...styles.notification,
                            background: notifColors[n.type] || notifColors.info,
                            cursor: 'pointer',
                        }}
                    >
                        {n.message}
                    </div>
                ))}
            </div>
            <div style={styles.content}>
                <ErrorBoundary key={activeView}>
                    <Suspense fallback={<div style={styles.suspenseFallback}>Loading...</div>}>
                        {renderView()}
                    </Suspense>
                </ErrorBoundary>
            </div>
            <NavBar activeView={activeView} onNavigate={navigate} />
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);

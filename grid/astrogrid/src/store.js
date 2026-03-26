/**
 * AstroGrid Zustand global state store.
 */

import { create } from 'zustand';

const PREF_KEY = 'astrogrid_prefs';

function loadPreferences() {
    try {
        return JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    } catch {
        return {};
    }
}

const defaultPreferences = {
    animateOrbits: true,
    showAspectLines: true,
    useLiveTelemetry: true,
    showChineseLayer: true,
    showSolarLayer: true,
    coordinateSystem: 'tropical',
};

const useStore = create((set) => ({
    activeView: 'orrery',
    selectedDate: new Date().toISOString().slice(0, 10),

    celestialData: {},
    correlationData: [],
    narrativeData: null,

    briefing: '',
    loading: false,

    token: localStorage.getItem('grid_token') || null,
    isAuthenticated: !!localStorage.getItem('grid_token'),

    preferences: {
        ...defaultPreferences,
        ...loadPreferences(),
    },

    setActiveView: (view) => {
        window.location.hash = `#/${view}`;
        set({ activeView: view });
    },

    setSelectedDate: (selectedDate) => set({ selectedDate }),
    setCelestialData: (data) => set({ celestialData: data }),
    setCorrelations: (correlationData) => set({ correlationData, correlations: correlationData }),
    setCorrelationData: (correlationData) => set({ correlationData, correlations: correlationData }),
    setNarrativeData: (narrativeData) => set({ narrativeData }),
    setBriefing: (briefing) => set({ briefing }),
    setLoading: (loading) => set({ loading }),

    setPreference: (key, value) =>
        set((state) => {
            const preferences = { ...state.preferences, [key]: value };
            localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
            return { preferences };
        }),

    setAuth: (token) => {
        localStorage.setItem('grid_token', token);
        set({ token, isAuthenticated: true });
    },

    clearAuth: () => {
        localStorage.removeItem('grid_token');
        set({ token: null, isAuthenticated: false });
    },
}));

export default useStore;

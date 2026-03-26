/**
 * AstroGrid Zustand global state store.
 */

import { create } from 'zustand';

const PREF_KEY = 'astrogrid_prefs';
const TOKEN_KEY = 'grid_token';
const DEFAULT_VIEW = 'orrery';
const VALID_VIEWS = new Set([
    'orrery',
    'lunar',
    'ephemeris',
    'correlations',
    'timeline',
    'narrative',
    'settings',
]);

function getBrowserStorage() {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readStorageItem(key) {
    const storage = getBrowserStorage();
    if (!storage) return null;

    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorageItem(key, value) {
    const storage = getBrowserStorage();
    if (!storage) return false;

    try {
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function removeStorageItem(key) {
    const storage = getBrowserStorage();
    if (!storage) return false;

    try {
        storage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function getInitialView() {
    if (typeof window === 'undefined') {
        return DEFAULT_VIEW;
    }

    const hash = window.location.hash.startsWith('#/')
        ? window.location.hash.slice(2)
        : '';

    return VALID_VIEWS.has(hash) ? hash : DEFAULT_VIEW;
}

function loadPreferences() {
    try {
        return JSON.parse(readStorageItem(PREF_KEY) || '{}');
    } catch {
        return {};
    }
}

function hasCelestialCategories(data) {
    return Boolean(data?.categories && typeof data.categories === 'object');
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
    activeView: getInitialView(),
    selectedDate: new Date().toISOString().slice(0, 10),

    celestialData: {},
    celestialStatus: 'idle',
    celestialNote: 'Session telemetry has not been loaded yet.',
    correlationData: [],
    narrativeData: null,

    briefing: '',
    loading: false,

    token: readStorageItem(TOKEN_KEY) || null,
    isAuthenticated: !!readStorageItem(TOKEN_KEY),

    preferences: {
        ...defaultPreferences,
        ...loadPreferences(),
    },

    setActiveView: (view) => {
        const nextView = VALID_VIEWS.has(view) ? view : DEFAULT_VIEW;
        set({ activeView: nextView });
    },

    setSelectedDate: (selectedDate) => set({ selectedDate }),
    setCelestialData: (data) =>
        set((state) => ({
            celestialData: data,
            celestialStatus: hasCelestialCategories(data)
                ? (state.celestialStatus === 'cached' ? 'cached' : 'live')
                : state.celestialStatus,
        })),
    setCelestialTelemetryState: (celestialStatus, celestialNote = '') =>
        set({
            celestialStatus,
            celestialNote,
        }),
    setCorrelations: (correlationData) => set({ correlationData, correlations: correlationData }),
    setCorrelationData: (correlationData) => set({ correlationData, correlations: correlationData }),
    setNarrativeData: (narrativeData) => set({ narrativeData }),
    setBriefing: (briefing) => set({ briefing }),
    setLoading: (loading) => set({ loading }),

    setPreference: (key, value) =>
        set((state) => {
            const preferences = { ...state.preferences, [key]: value };
            writeStorageItem(PREF_KEY, JSON.stringify(preferences));
            return {
                preferences,
                ...(key === 'useLiveTelemetry' && value === false
                    ? {
                        celestialStatus: 'disabled',
                        celestialNote: 'Live telemetry is disabled for this session.',
                    }
                    : {}),
            };
        }),

    setAuth: (token) => {
        writeStorageItem(TOKEN_KEY, token);
        set({ token, isAuthenticated: true });
    },

    clearAuth: () => {
        removeStorageItem(TOKEN_KEY);
        set({
            token: null,
            isAuthenticated: false,
            celestialData: {},
            celestialStatus: 'idle',
            celestialNote: 'Session telemetry has not been loaded yet.',
        });
    },
}));

export default useStore;

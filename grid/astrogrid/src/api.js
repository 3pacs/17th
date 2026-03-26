/**
 * AstroGrid API client.
 *
 * Uses the contract-safe celestial signal feed as the primary data source and
 * wraps AstroGrid-specific endpoints behind tolerant adapters so the frontend
 * can evolve safely while backend contracts catch up.
 */

class AstroGridApiError extends Error {
    constructor(status, message, detail) {
        super(message);
        this.status = status;
        this.detail = detail;
    }
}

class AstroGridApi {
    constructor() {
        this.baseUrl = window.location.origin;
    }

    get token() {
        return localStorage.getItem('grid_token');
    }

    async _fetch(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const message = body.detail || response.statusText;

            if (response.status === 401) {
                localStorage.removeItem('grid_token');
                window.location.href = '/';
            }

            throw new AstroGridApiError(response.status, message, body);
        }

        return response.json();
    }

    async _fetchFirst(candidates, options = {}) {
        let lastError = null;

        for (const candidate of candidates) {
            try {
                return await this._fetch(candidate.path, {
                    ...options,
                    ...(candidate.options || {}),
                    headers: { ...(options.headers || {}), ...((candidate.options && candidate.options.headers) || {}) },
                });
            } catch (error) {
                lastError = error;
                if (error?.status && ![404, 405].includes(error.status)) {
                    break;
                }
            }
        }

        throw lastError || new AstroGridApiError(500, 'No AstroGrid endpoint candidates succeeded', {});
    }

    async getCelestialOverview() {
        return this._fetch('/api/v1/astrogrid/overview');
    }

    async getCelestialSignals() {
        return this._fetch('/api/v1/signals/celestial');
    }

    async getCelestialBriefing() {
        return this._fetch('/api/v1/signals/celestial/briefing');
    }

    async getEphemeris(date) {
        const params = date ? `?date=${date}` : '';
        return this._fetch(`/api/v1/astrogrid/ephemeris${params}`);
    }

    async getCorrelations(params = {}) {
        const contractParams = new URLSearchParams(params).toString();
        const altParams = new URLSearchParams({
            market_feature: params.market || params.market_feature || 'spy',
            celestial_category: params.feature || params.celestial_category || 'lunar',
            lookback_days: params.lookback_days || 252,
        }).toString();

        return this._fetchFirst([
            { path: `/api/v1/astrogrid/correlations${contractParams ? `?${contractParams}` : ''}` },
            { path: `/api/v1/astrogrid/correlations?${altParams}` },
        ]);
    }

    async getTimeline(params = {}) {
        const qs = new URLSearchParams(params).toString();
        return this._fetchFirst([
            { path: `/api/v1/astrogrid/timeline${qs ? `?${qs}` : ''}` },
        ]);
    }

    async getBriefing() {
        return this._fetchFirst([
            { path: '/api/v1/signals/celestial/briefing' },
            { path: '/api/v1/astrogrid/narrative' },
            { path: '/api/v1/astrogrid/briefing' },
        ]);
    }

    async getRetrogrades() {
        return this._fetchFirst([
            { path: '/api/v1/astrogrid/retrograde' },
            { path: '/api/v1/astrogrid/retrogrades' },
        ]);
    }

    async getEclipses() {
        return this._fetch('/api/v1/astrogrid/eclipses');
    }

    async getNakshatra() {
        return this._fetch('/api/v1/astrogrid/nakshatra');
    }

    async getLunarCalendar(year, month) {
        const params = new URLSearchParams();
        if (year) params.set('year', year);
        if (month) params.set('month', month);
        const suffix = params.toString() ? `?${params.toString()}` : '';

        return this._fetchFirst([
            { path: `/api/v1/astrogrid/lunar/calendar${suffix}` },
            { path: `/api/v1/astrogrid/lunar${suffix}` },
        ]);
    }

    async getSolarActivity() {
        return this._fetchFirst([
            { path: '/api/v1/astrogrid/solar/activity' },
            { path: '/api/v1/astrogrid/solar' },
        ]);
    }

    async compareDates(date1, date2) {
        return this._fetchFirst([
            {
                path: '/api/v1/astrogrid/compare',
                options: {
                    method: 'POST',
                    body: JSON.stringify({ date1, date2 }),
                },
            },
            { path: `/api/v1/astrogrid/compare?date1=${date1}&date2=${date2}` },
        ]);
    }
}

export const api = new AstroGridApi();
export default api;

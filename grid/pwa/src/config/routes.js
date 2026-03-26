/**
 * GRID PWA — Single Route Registry
 *
 * This is the ONE source of truth for all views in the app.
 * app.jsx reads it for rendering, NavBar.jsx reads it for navigation.
 * Adding a new view = adding one entry here. Nothing else.
 */
import React from 'react';
import {
    Home, Radar, BookOpen, FlaskConical, Bot, Settings as SettingsIcon,
    FileText, Workflow, Atom, Terminal, TrendingUp, BarChart3, Globe,
    Layers, Activity, Network, Crosshair, GitBranch, Database, Eye,
    Camera, ListChecks, Mail, Map, SlidersHorizontal, Link2,
} from 'lucide-react';

// ── Eager imports (core views loaded on first visit) ─────────────────
import Dashboard from '../views/Dashboard.jsx';
import Regime from '../views/Regime.jsx';
import Signals from '../views/Signals.jsx';
import Flows from '../views/Flows.jsx';

// ── Lazy imports (everything else, code-split) ───────────────────────
const Journal          = React.lazy(() => import('../views/Journal.jsx'));
const JournalEntry     = React.lazy(() => import('../views/JournalEntry.jsx'));
const Models           = React.lazy(() => import('../views/Models.jsx'));
const Discovery        = React.lazy(() => import('../views/Discovery.jsx'));
const Hyperspace       = React.lazy(() => import('../views/Hyperspace.jsx'));
const Agents           = React.lazy(() => import('../views/Agents.jsx'));
const Briefings        = React.lazy(() => import('../views/Briefings.jsx'));
const Workflows        = React.lazy(() => import('../views/Workflows.jsx'));
const Physics          = React.lazy(() => import('../views/Physics.jsx'));
const SystemLogs       = React.lazy(() => import('../views/SystemLogs.jsx'));
const Backtest         = React.lazy(() => import('../views/Backtest.jsx'));
const Associations     = React.lazy(() => import('../views/Associations.jsx'));
const AssociationsLegacy = React.lazy(() => import('../views/AssociationsLegacy.jsx'));
const SettingsView     = React.lazy(() => import('../views/Settings.jsx'));
const Strategy         = React.lazy(() => import('../views/Strategy.jsx'));
const Options          = React.lazy(() => import('../views/Options.jsx'));
const Derivatives      = React.lazy(() => import('../views/Derivatives.jsx'));
const Heatmap          = React.lazy(() => import('../views/Heatmap.jsx'));
const WeightSliders    = React.lazy(() => import('../views/WeightSliders.jsx'));
const Knowledge        = React.lazy(() => import('../views/Knowledge.jsx'));
const WatchlistAnalysis = React.lazy(() => import('../views/WatchlistAnalysis.jsx'));
const Operator         = React.lazy(() => import('../views/Operator.jsx'));
const Snapshots        = React.lazy(() => import('../views/Snapshots.jsx'));
const VizDashboard     = React.lazy(() => import('../views/VizDashboard.jsx'));
const HermesInbox      = React.lazy(() => import('../views/HermesInbox.jsx'));
const Login            = React.lazy(() => import('../views/Login.jsx'));

// ── Route definitions ────────────────────────────────────────────────
// section: null means the view is reachable but hidden from the nav drawer.
// primary: true means it appears in the bottom tab bar (max 6 + "More").
// props: function returning extra props for views that need them (navigate, etc.)

export const ROUTES = [
    // ── OVERVIEW ──
    { id: 'dashboard',    component: Dashboard,    label: 'Dashboard',  icon: Home,         section: 'OVERVIEW',      desc: 'System overview & status',          primary: true, primaryLabel: 'Home' },
    { id: 'regime',       component: Regime,        label: 'Regime',     icon: Radar,        section: 'OVERVIEW',      desc: 'Current market regime state',       primary: true },
    { id: 'strategy',     component: Strategy,      label: 'Strategy',   icon: Crosshair,    section: 'OVERVIEW',      desc: 'Regime-linked action plans' },
    { id: 'signals',      component: Signals,       label: 'Signals',    icon: Activity,     section: 'OVERVIEW',      desc: 'Live feature values' },

    // ── INTELLIGENCE ──
    { id: 'viz-dashboard', component: VizDashboard, label: 'Living Intel', icon: Activity,   section: 'INTELLIGENCE',  desc: 'Real-time multi-chart intelligence', primary: true, primaryLabel: 'Intel' },
    { id: 'briefings',    component: Briefings,     label: 'Briefings',  icon: FileText,     section: 'INTELLIGENCE',  desc: 'AI market analysis reports',        primary: true, primaryLabel: 'Brief' },
    { id: 'agents',       component: Agents,        label: 'Agents',     icon: Bot,          section: 'INTELLIGENCE',  desc: 'Multi-agent deliberation' },
    { id: 'discovery',    component: Discovery,     label: 'Discovery',  icon: FlaskConical, section: 'INTELLIGENCE',  desc: 'Hypotheses & clustering',           primary: true, primaryLabel: 'Discover' },
    { id: 'flows',        component: Flows,         label: 'Flows',      icon: GitBranch,    section: 'INTELLIGENCE',  desc: 'Sector flows, actors & influence',  primary: true, primaryLabel: 'Flows' },
    { id: 'derivatives',  component: Derivatives,   label: 'Derivatives', icon: BarChart3,   section: 'INTELLIGENCE',  desc: 'Vol surface, skew & GEX' },
    { id: 'associations', component: Associations,  label: 'Associations', icon: Network,    section: 'INTELLIGENCE',  desc: 'Feature correlations & anomalies' },
    { id: 'models',       component: Models,        label: 'Models',     icon: Layers,       section: 'INTELLIGENCE',  desc: 'Model registry & governance' },
    { id: 'knowledge',    component: Knowledge,     label: 'Knowledge',  icon: Database,     section: 'INTELLIGENCE',  desc: 'Knowledge base & rules' },
    { id: 'watchlist',    component: WatchlistAnalysis, label: 'Watchlist', icon: ListChecks, section: 'INTELLIGENCE',  desc: 'Deep watchlist analysis' },

    // ── PERFORMANCE ──
    { id: 'backtest',     component: Backtest,      label: 'Backtest',   icon: TrendingUp,   section: 'PERFORMANCE',   desc: 'Track record & paper trades' },
    { id: 'journal',      component: Journal,       label: 'Journal',    icon: BookOpen,     section: 'PERFORMANCE',   desc: 'Decision log & outcomes' },
    { id: 'physics',      component: Physics,       label: 'Physics',    icon: Atom,         section: 'PERFORMANCE',   desc: 'Market dynamics verification' },

    // ── OPERATIONS ──
    { id: 'operator',     component: Operator,      label: 'Operator',   icon: Eye,          section: 'OPERATIONS',    desc: 'Hermes operator dashboard' },
    { id: 'hermes-inbox', component: HermesInbox,   label: 'Inbox',      icon: Mail,         section: 'OPERATIONS',    desc: 'Hermes email intelligence' },
    { id: 'snapshots',    component: Snapshots,     label: 'Snapshots',  icon: Camera,       section: 'OPERATIONS',    desc: 'PIT analytical snapshots' },
    { id: 'workflows',    component: Workflows,     label: 'Workflows',  icon: Workflow,     section: 'OPERATIONS',    desc: 'Data & compute pipelines' },
    { id: 'weights',      component: WeightSliders, label: 'Weights',    icon: SlidersHorizontal, section: 'OPERATIONS', desc: 'Tune regime feature influence' },
    { id: 'hyperspace',   component: Hyperspace,    label: 'Hyperspace', icon: Globe,        section: 'OPERATIONS',    desc: 'Distributed compute node' },
    { id: 'system',       component: SystemLogs,    label: 'System',     icon: Terminal,     section: 'OPERATIONS',    desc: 'Logs, config & sources' },
    { id: 'settings',     component: SettingsView,  label: 'Settings',   icon: SettingsIcon, section: 'OPERATIONS',    desc: 'Connection & logout' },

    // ── HIDDEN (reachable but not in nav drawer) ──
    { id: 'journal-entry',       component: JournalEntry,       label: 'Journal Entry',       icon: BookOpen, section: null, desc: 'Single journal entry' },
    { id: 'associations-legacy', component: AssociationsLegacy, label: 'Associations (Legacy)', icon: Network, section: null, desc: 'Legacy correlations view' },
    { id: 'heatmap',             component: Heatmap,            label: 'Heatmap',             icon: Map,      section: null, desc: 'Market heatmap' },
    { id: 'options',             component: Options,            label: 'Options',             icon: BarChart3, section: null, desc: 'Options analytics' },
];

// ── Derived lookups (used by app.jsx and NavBar.jsx) ─────────────────

/** Map from route ID to route object for O(1) lookup */
export const ROUTE_MAP = Object.fromEntries(ROUTES.map(r => [r.id, r]));

/** Menu sections for NavBar drawer (only routes with a section) */
export const NAV_SECTIONS = (() => {
    const sectionOrder = ['OVERVIEW', 'INTELLIGENCE', 'PERFORMANCE', 'OPERATIONS'];
    const map = {};
    for (const r of ROUTES) {
        if (!r.section) continue;
        if (!map[r.section]) map[r.section] = [];
        map[r.section].push(r);
    }
    return sectionOrder.filter(s => map[s]).map(s => ({ label: s, items: map[s] }));
})();

/** Primary bottom-bar tabs (routes with primary: true, plus "More") */
export const PRIMARY_TABS = ROUTES
    .filter(r => r.primary)
    .map(r => ({ id: r.id, icon: r.icon, label: r.primaryLabel || r.label }));

/** IDs of primary views (for "More" button active state) */
export const PRIMARY_IDS = new Set(PRIMARY_TABS.map(t => t.id));

/** Default/fallback component */
export const DEFAULT_ROUTE = ROUTE_MAP['dashboard'];

/** Login component (not part of the route switch) */
export { Login };

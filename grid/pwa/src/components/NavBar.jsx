import React, { useState } from 'react';
import { Menu, X, ChevronRight } from 'lucide-react';
import { NAV_SECTIONS, PRIMARY_TABS, PRIMARY_IDS } from '../config/routes.js';

const styles = {
    nav: {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0D1520', borderTop: '1px solid #1A2840',
        zIndex: 100,
    },
    primaryRow: {
        display: 'flex', justifyContent: 'space-around',
        paddingTop: '8px',
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
    },
    tab: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '2px', border: 'none', background: 'none', cursor: 'pointer',
        padding: '4px 6px', minWidth: '40px', minHeight: '44px', flex: 1,
    },
    label: { fontSize: '9px', fontFamily: "'IBM Plex Sans', sans-serif" },
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', zIndex: 98,
    },
    drawer: {
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '300px', maxWidth: '85vw',
        background: '#0A1018',
        borderLeft: '1px solid #1A2840',
        zIndex: 99, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        paddingBottom: 'calc(70px + env(safe-area-inset-bottom, 0px))',
    },
    drawerHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 20px 12px 20px',
        borderBottom: '1px solid #1A2840',
    },
    drawerTitle: {
        fontFamily: "'JetBrains Mono', monospace", fontSize: '16px',
        fontWeight: 700, color: '#1A6EBF', letterSpacing: '3px',
    },
    closeBtn: {
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '8px', borderRadius: '8px',
    },
    sectionLabel: {
        fontSize: '10px', fontWeight: 700, letterSpacing: '2px',
        color: '#5A7080', padding: '16px 20px 6px 20px',
        fontFamily: "'JetBrains Mono', monospace",
    },
    menuItem: {
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 20px', cursor: 'pointer',
        borderLeft: '3px solid transparent',
        transition: 'background 0.15s',
    },
    menuItemActive: {
        background: '#1A6EBF15',
        borderLeftColor: '#1A6EBF',
    },
    menuIcon: {
        width: '32px', height: '32px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0D1520', flexShrink: 0,
    },
    menuLabel: {
        fontSize: '14px', fontWeight: 600,
        fontFamily: "'IBM Plex Sans', sans-serif",
    },
    menuDesc: {
        fontSize: '11px', marginTop: '1px',
        fontFamily: "'IBM Plex Sans', sans-serif",
    },
    chevron: {
        marginLeft: 'auto', flexShrink: 0,
    },
};

export default function NavBar({ activeView, onNavigate }) {
    const [showMenu, setShowMenu] = useState(false);

    const handleNav = (id) => {
        if (id === 'menu') {
            setShowMenu(!showMenu);
            return;
        }
        setShowMenu(false);
        onNavigate(id);
    };

    const isSecondaryView = !PRIMARY_IDS.has(activeView) && activeView !== 'journal-entry';

    return (
        <>
            {showMenu && (
                <>
                    <div style={styles.overlay} onClick={() => setShowMenu(false)} />
                    <div style={styles.drawer}>
                        <div style={styles.drawerHeader}>
                            <span style={styles.drawerTitle}>GRID</span>
                            <button
                                style={styles.closeBtn}
                                onClick={() => setShowMenu(false)}
                                aria-label="Close menu"
                            >
                                <X size={20} color="#5A7080" />
                            </button>
                        </div>
                        {NAV_SECTIONS.map(section => (
                            <div key={section.label}>
                                <div style={styles.sectionLabel}>{section.label}</div>
                                {section.items.map(item => {
                                    const Icon = item.icon;
                                    const isActive = activeView === item.id;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => handleNav(item.id)}
                                            style={{
                                                ...styles.menuItem,
                                                ...(isActive ? styles.menuItemActive : {}),
                                            }}
                                        >
                                            <div style={{
                                                ...styles.menuIcon,
                                                background: isActive ? '#1A6EBF20' : '#0D1520',
                                            }}>
                                                <Icon size={16} color={isActive ? '#1A6EBF' : '#5A7080'} />
                                            </div>
                                            <div>
                                                <div style={{
                                                    ...styles.menuLabel,
                                                    color: isActive ? '#E8F0F8' : '#C8D8E8',
                                                }}>{item.label}</div>
                                                <div style={{
                                                    ...styles.menuDesc,
                                                    color: isActive ? '#8AA0B8' : '#4A6070',
                                                }}>{item.desc}</div>
                                            </div>
                                            <ChevronRight
                                                size={14}
                                                color={isActive ? '#1A6EBF' : '#2A3A4A'}
                                                style={styles.chevron}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </>
            )}
            <nav style={styles.nav}>
                <div style={styles.primaryRow}>
                    {PRIMARY_TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeView === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleNav(tab.id)}
                                style={styles.tab}
                                aria-label={tab.label}
                            >
                                <Icon
                                    size={22}
                                    color={isActive ? '#1A6EBF' : '#5A7080'}
                                />
                                <span style={{
                                    ...styles.label,
                                    color: isActive ? '#1A6EBF' : '#5A7080',
                                }}>{tab.label}</span>
                            </button>
                        );
                    })}
                    <button
                        onClick={() => handleNav('menu')}
                        style={styles.tab}
                        aria-label="More"
                    >
                        <Menu
                            size={22}
                            color={(showMenu || isSecondaryView) ? '#1A6EBF' : '#5A7080'}
                        />
                        <span style={{
                            ...styles.label,
                            color: (showMenu || isSecondaryView) ? '#1A6EBF' : '#5A7080',
                        }}>More</span>
                    </button>
                </div>
            </nav>
        </>
    );
}

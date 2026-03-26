import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import { eclipticTo3D } from '../lib/aspects.js';
import { tokens } from '../styles/tokens.js';

const PLANET_ORDER = ['Mercury', 'Venus', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const ORBIT_RADII = {
    Mercury: 1.35,
    Venus: 1.8,
    Moon: 2.2,
    Mars: 2.8,
    Jupiter: 3.6,
    Saturn: 4.25,
    Uranus: 4.9,
    Neptune: 5.45,
    Pluto: 5.95,
};
const PLANET_COLORS = {
    Mercury: '#C4B5FD',
    Venus: '#F9A8D4',
    Moon: '#E2E8F0',
    Mars: '#FB7185',
    Jupiter: '#F59E0B',
    Saturn: '#FDE68A',
    Uranus: '#67E8F9',
    Neptune: '#60A5FA',
    Pluto: '#94A3B8',
};

function OrbitRing({ radius }) {
    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius - 0.01, radius + 0.01, 128]} />
            <meshBasicMaterial color="#1E365A" transparent opacity={0.42} side={2} />
        </mesh>
    );
}

function PlanetMarker({ body, radius }) {
    const point = eclipticTo3D(body.geocentric_longitude, radius);
    const size = body.planet === 'Moon' ? 0.12 : 0.15;

    return (
        <group position={[point.x, 0, point.z]}>
            <mesh>
                <sphereGeometry args={[size, 24, 24]} />
                <meshStandardMaterial
                    color={PLANET_COLORS[body.planet] || tokens.accent}
                    emissive={body.is_retrograde ? '#7C3AED' : '#0A1628'}
                    emissiveIntensity={body.is_retrograde ? 0.8 : 0.35}
                />
            </mesh>
            <Html distanceFactor={12}>
                <div style={{
                    padding: '4px 8px',
                    borderRadius: '999px',
                    background: 'rgba(5, 8, 16, 0.82)',
                    border: `1px solid ${body.is_retrograde ? '#7C3AED' : '#1E365A'}`,
                    color: '#E8F0F8',
                    fontSize: '10px',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    fontFamily: "'IBM Plex Mono', monospace",
                    transform: 'translate3d(-50%, -150%, 0)',
                }}>
                    {body.planet} {body.is_retrograde ? 'Rx' : ''}
                </div>
            </Html>
        </group>
    );
}

function AspectLayer({ positions, aspects }) {
    const lookup = useMemo(() => {
        const map = {};
        for (const body of positions) {
            map[body.planet] = eclipticTo3D(body.geocentric_longitude, ORBIT_RADII[body.planet] || 2.5);
        }
        return map;
    }, [positions]);

    const visibleAspects = (aspects || []).filter((aspect) => aspect.orb_used <= 4).slice(0, 16);

    return visibleAspects.map((aspect) => {
        const from = lookup[aspect.planet1];
        const to = lookup[aspect.planet2];
        if (!from || !to) return null;

        const color = aspect.aspect_type === 'trine' || aspect.aspect_type === 'sextile'
            ? '#22C55E'
            : aspect.aspect_type === 'conjunction'
                ? '#F59E0B'
                : '#EF4444';

        return (
            <Line
                key={`${aspect.planet1}-${aspect.planet2}-${aspect.aspect_type}`}
                points={[
                    [from.x, 0.02, from.z],
                    [(from.x + to.x) / 2, 0.35, (from.z + to.z) / 2],
                    [to.x, 0.02, to.z],
                ]}
                color={color}
                lineWidth={aspect.applying ? 1.5 : 1}
                transparent
                opacity={aspect.applying ? 0.75 : 0.45}
            />
        );
    });
}

function OrreryScene({ positions, aspects, showAspectLines, autoRotate }) {
    return (
        <>
            <color attach="background" args={['#050810']} />
            <ambientLight intensity={0.65} />
            <pointLight position={[0, 0, 0]} intensity={2.8} color="#4A9EFF" />
            <pointLight position={[0, 6, 0]} intensity={0.5} color="#7C3AED" />
            <Stars radius={60} depth={32} count={2500} factor={3.2} saturation={0} fade speed={0.45} />

            <mesh>
                <sphereGeometry args={[0.42, 32, 32]} />
                <meshStandardMaterial color="#F8C15C" emissive="#C77612" emissiveIntensity={1.35} />
            </mesh>

            {PLANET_ORDER.map((planet) => (
                <OrbitRing key={`orbit-${planet}`} radius={ORBIT_RADII[planet]} />
            ))}

            {showAspectLines ? <AspectLayer positions={positions} aspects={aspects} /> : null}

            {positions.map((body) => (
                <PlanetMarker
                    key={body.planet}
                    body={body}
                    radius={ORBIT_RADII[body.planet] || 2.5}
                />
            ))}

            <OrbitControls
                enablePan={false}
                autoRotate={autoRotate}
                autoRotateSpeed={0.35}
                minDistance={6}
                maxDistance={14}
                maxPolarAngle={Math.PI / 2.05}
                minPolarAngle={Math.PI / 3.2}
            />
        </>
    );
}

export default function PlanetaryOrrery({
    positions = [],
    aspects = [],
    showAspectLines = true,
    autoRotate = true,
}) {
    return (
        <div style={{
            height: 'min(62vw, 480px)',
            minHeight: '360px',
            width: '100%',
            borderRadius: tokens.radius.xl,
            overflow: 'hidden',
            border: `1px solid ${tokens.cardBorder}`,
            background: 'radial-gradient(circle at 50% 50%, rgba(74, 158, 255, 0.18) 0%, rgba(5, 8, 16, 1) 68%)',
        }}>
            <Canvas camera={{ position: [0, 6.25, 7.8], fov: 42 }}>
                <OrreryScene
                    positions={positions}
                    aspects={aspects}
                    showAspectLines={showAspectLines}
                    autoRotate={autoRotate}
                />
            </Canvas>
        </div>
    );
}

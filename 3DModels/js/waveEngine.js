/**
 * Wave Motion Engine
 * Creates continuous, organic motion propagation through the body
 * Motion ripples like a wave rather than discrete joint snaps
 */

export class WaveMotionEngine {
    constructor(config = {}) {
        this.config = {
            // Spring physics
            stiffness: config.stiffness || 0.3,
            damping: config.damping || 0.85,

            // Wave propagation
            propagationSpeed: config.propagationSpeed || 0.15,
            waveDecay: config.waveDecay || 0.92,

            // Physics timestep
            physicsSteps: config.physicsSteps || 2
        };

        // Previous frame data for velocity calculation
        this.previousData = null;
        this.velocities = new Map();

        // Spring network topology
        this.bodyConnections = this.defineBodyNetwork();
        this.faceConnections = this.defineFaceNetwork();

        // Wave state
        this.activeWaves = [];
    }

    /**
     * Define body spring network - which landmarks influence which
     */
    defineBodyNetwork() {
        return {
            // Torso core - influences everything
            core: [11, 12, 23, 24],

            // Spine chain
            spine: {
                11: [12, 23],  // Left shoulder -> right shoulder, left hip
                12: [11, 24],  // Right shoulder -> left shoulder, right hip
                23: [11, 24, 25],  // Left hip -> shoulder, right hip, knee
                24: [12, 23, 26],  // Right hip -> shoulder, left hip, knee
            },

            // Left arm chain
            leftArm: {
                11: [13],      // Shoulder -> elbow
                13: [11, 15],  // Elbow -> shoulder, wrist
                15: [13],      // Wrist -> elbow
            },

            // Right arm chain
            rightArm: {
                12: [14],      // Shoulder -> elbow
                14: [12, 16],  // Elbow -> shoulder, wrist
                16: [14],      // Wrist -> elbow
            },

            // Left leg chain
            leftLeg: {
                23: [25],      // Hip -> knee
                25: [23, 27],  // Knee -> hip, ankle
                27: [25],      // Ankle -> knee
            },

            // Right leg chain
            rightLeg: {
                24: [26],      // Hip -> knee
                26: [24, 28],  // Knee -> hip, ankle
                28: [26],      // Ankle -> knee
            }
        };
    }

    /**
     * Define face spring network for connected facial regions
     */
    defineFaceNetwork() {
        return {
            // Eyes influence eyebrows and cheeks
            eyeConnections: {
                // Left eye -> left eyebrow, nose
                leftEye: ['leftEyebrow', 'nose'],
                rightEye: ['rightEyebrow', 'nose'],
            },

            // Mouth influences cheeks and jaw
            mouthConnections: {
                lips: ['leftCheek', 'rightCheek', 'jawline']
            },

            // Jaw influences entire lower face
            jawConnections: {
                jawline: ['leftCheek', 'rightCheek', 'lips']
            }
        };
    }

    /**
     * Calculate velocity for a point
     */
    calculateVelocity(current, previous, dt) {
        if (!previous) return { vx: 0, vy: 0, vz: 0 };

        return {
            vx: (current.x - previous.x) / dt,
            vy: (current.y - previous.y) / dt,
            vz: ((current.z || 0) - (previous.z || 0)) / dt
        };
    }

    /**
     * Get velocity magnitude
     */
    getVelocityMagnitude(v) {
        return Math.sqrt(v.vx * v.vx + v.vy * v.vy + v.vz * v.vz);
    }

    /**
     * Apply spring physics between connected points
     */
    applySpringForce(point, neighbors, allPoints, stiffness) {
        if (!neighbors || neighbors.length === 0) return { fx: 0, fy: 0, fz: 0 };

        let fx = 0, fy = 0, fz = 0;

        for (const neighborIdx of neighbors) {
            const neighbor = allPoints[neighborIdx];
            if (!neighbor) continue;

            // Vector from point to neighbor
            const dx = neighbor.x - point.x;
            const dy = neighbor.y - point.y;
            const dz = (neighbor.z || 0) - (point.z || 0);

            // Spring force proportional to displacement
            fx += dx * stiffness;
            fy += dy * stiffness;
            fz += dz * stiffness;
        }

        return { fx, fy, fz };
    }

    /**
     * Propagate motion through connected landmarks
     */
    propagateMotion(points, velocities, connections, propagationFactor) {
        const propagatedVelocities = new Map(velocities);

        // For each point with velocity, propagate to neighbors
        velocities.forEach((velocity, idx) => {
            const neighbors = connections[idx];
            if (!neighbors || this.getVelocityMagnitude(velocity) < 0.001) return;

            for (const neighborIdx of neighbors) {
                const currentNeighborV = propagatedVelocities.get(neighborIdx) || { vx: 0, vy: 0, vz: 0 };

                // Add attenuated velocity from source
                propagatedVelocities.set(neighborIdx, {
                    vx: currentNeighborV.vx + velocity.vx * propagationFactor,
                    vy: currentNeighborV.vy + velocity.vy * propagationFactor,
                    vz: currentNeighborV.vz + velocity.vz * propagationFactor
                });
            }
        });

        return propagatedVelocities;
    }

    /**
     * Apply wave dynamics to body points
     */
    processBody(bodyPoints, dt) {
        if (!bodyPoints || bodyPoints.length === 0) return bodyPoints;

        const processed = [...bodyPoints];
        const { stiffness, damping, propagationSpeed } = this.config;

        // Build connection map from all body connections
        const connectionMap = {};
        Object.values(this.bodyConnections).forEach(segment => {
            if (typeof segment === 'object' && !Array.isArray(segment)) {
                Object.entries(segment).forEach(([idx, neighbors]) => {
                    connectionMap[idx] = neighbors;
                });
            }
        });

        // Calculate current velocities
        const currentVelocities = new Map();
        processed.forEach((point, idx) => {
            if (point.originalIndex !== undefined) {
                const prevPoint = this.previousData?.body?.points?.[idx];
                const velocity = this.calculateVelocity(point, prevPoint, dt);
                currentVelocities.set(point.originalIndex, velocity);
            }
        });

        // Propagate velocities through network
        const propagatedVelocities = this.propagateMotion(
            processed,
            currentVelocities,
            connectionMap,
            propagationSpeed
        );

        // Apply propagated velocities with damping
        processed.forEach((point, idx) => {
            if (point.originalIndex === undefined) {
                // Interpolated point - inherit velocity from nearest original
                return;
            }

            const velocity = propagatedVelocities.get(point.originalIndex);
            if (velocity && !point.interpolated) {
                // Store velocity for next frame
                this.velocities.set(`body_${point.originalIndex}`, {
                    vx: velocity.vx * damping,
                    vy: velocity.vy * damping,
                    vz: velocity.vz * damping
                });
            }
        });

        // Apply micro-motion to interpolated points
        processed.forEach((point, idx) => {
            if (point.interpolated) {
                // Add subtle organic motion based on nearby velocities
                const nearbyVelocity = this.velocities.get(`body_${Math.floor(idx / 5) * 5}`);
                if (nearbyVelocity) {
                    const microScale = 0.02;
                    point.x += nearbyVelocity.vx * dt * microScale;
                    point.y += nearbyVelocity.vy * dt * microScale;
                    point.z = (point.z || 0) + nearbyVelocity.vz * dt * microScale;
                }
            }
        });

        return processed;
    }

    /**
     * Apply wave dynamics to face points using blendshapes
     */
    processFace(facePoints, blendshapes, dt) {
        if (!facePoints || facePoints.length === 0) return facePoints;

        const processed = [...facePoints];
        const { damping } = this.config;

        // Use blendshapes for micro-expression propagation
        if (blendshapes && blendshapes.length > 0) {
            const blendshapeMap = {};
            blendshapes.forEach(bs => {
                blendshapeMap[bs.categoryName] = bs.score;
            });

            // Apply eyebrow motion influence
            const browUpLeft = blendshapeMap['browOuterUpLeft'] || 0;
            const browUpRight = blendshapeMap['browOuterUpRight'] || 0;
            const browDownLeft = blendshapeMap['browDownLeft'] || 0;
            const browDownRight = blendshapeMap['browDownRight'] || 0;

            // Apply jaw motion influence
            const jawOpen = blendshapeMap['jawOpen'] || 0;
            const jawLeft = blendshapeMap['jawLeft'] || 0;
            const jawRight = blendshapeMap['jawRight'] || 0;

            // Apply smile influence
            const smileLeft = blendshapeMap['mouthSmileLeft'] || 0;
            const smileRight = blendshapeMap['mouthSmileRight'] || 0;

            // Propagate expressions to nearby points
            processed.forEach((point, idx) => {
                if (!point.region) return;

                // Eyebrow regions influenced by brow blendshapes
                if (point.region === 'leftEyebrow') {
                    const browInfluence = (browUpLeft - browDownLeft) * 0.02;
                    point.y -= browInfluence;
                }
                if (point.region === 'rightEyebrow') {
                    const browInfluence = (browUpRight - browDownRight) * 0.02;
                    point.y -= browInfluence;
                }

                // Cheek regions influenced by smile
                if (point.region === 'leftCheek') {
                    point.y -= smileLeft * 0.01;
                    point.x -= smileLeft * 0.005;
                }
                if (point.region === 'rightCheek') {
                    point.y -= smileRight * 0.01;
                    point.x += smileRight * 0.005;
                }

                // Jaw region influenced by jaw blendshapes
                if (point.region === 'jawline') {
                    point.y += jawOpen * 0.02;
                    point.x += (jawRight - jawLeft) * 0.01;
                }
            });
        }

        return processed;
    }

    /**
     * Apply wave dynamics to hand points
     */
    processHands(handPoints, dt) {
        if (!handPoints || handPoints.length === 0) return handPoints;

        // Hands are fast-moving, apply lighter wave dynamics
        const processed = [...handPoints];
        const { damping } = this.config;

        // Calculate finger velocities and propagate subtle motion
        processed.forEach((point, idx) => {
            if (point.interpolated) {
                const baseIdx = Math.floor(idx / 4) * 4;
                const prevPoint = this.previousData?.hands?.points?.[baseIdx];

                if (prevPoint) {
                    const velocity = this.calculateVelocity(point, prevPoint, dt);
                    // Add micro-motion for organic feel
                    point.x += velocity.vx * dt * 0.01;
                    point.y += velocity.vy * dt * 0.01;
                }
            }
        });

        return processed;
    }

    /**
     * Main processing function
     */
    process(stabilizedData) {
        if (!stabilizedData) return null;

        const dt = 1 / 60; // Assume 60 FPS

        const processedData = {
            face: {
                points: this.processFace(
                    stabilizedData.face?.points,
                    stabilizedData.blendshapes,
                    dt
                ),
                count: stabilizedData.face?.count || 0
            },
            body: {
                points: this.processBody(stabilizedData.body?.points, dt),
                count: stabilizedData.body?.count || 0
            },
            hands: {
                points: this.processHands(stabilizedData.hands?.points, dt),
                count: stabilizedData.hands?.count || 0
            },
            blendshapes: stabilizedData.blendshapes,
            timestamp: stabilizedData.timestamp,
            fps: stabilizedData.fps,
            totalPoints: stabilizedData.totalPoints
        };

        // Store for next frame
        this.previousData = stabilizedData;

        return processedData;
    }

    /**
     * Reset wave engine state
     */
    reset() {
        this.previousData = null;
        this.velocities.clear();
        this.activeWaves = [];
    }
}

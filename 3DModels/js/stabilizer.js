/**
 * Temporal Stabilization System
 * Implements 1€ Filter + Kalman Filter for zero-jitter tracking
 * Eliminates landmark popping while preserving fast motion responsiveness
 */

/**
 * One Euro Filter - Adaptive low-pass filter
 * Eliminates jitter while preserving quick movements
 * Paper: "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 */
class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.minCutoff = minCutoff;  // Minimum cutoff frequency
        this.beta = beta;             // Speed coefficient
        this.dCutoff = dCutoff;       // Cutoff frequency for derivative

        this.xPrev = null;
        this.dxPrev = null;
        this.tPrev = null;
    }

    /**
     * Low-pass filter using exponential smoothing
     */
    lowPass(x, xPrev, alpha) {
        return alpha * x + (1 - alpha) * xPrev;
    }

    /**
     * Compute alpha from cutoff frequency and time delta
     */
    alpha(cutoff, dt) {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    /**
     * Filter a single value
     */
    filter(x, timestamp) {
        if (this.tPrev === null) {
            this.xPrev = x;
            this.dxPrev = 0;
            this.tPrev = timestamp;
            return x;
        }

        const dt = Math.max((timestamp - this.tPrev) / 1000, 0.001); // Convert to seconds
        this.tPrev = timestamp;

        // Estimate velocity (derivative)
        const dx = (x - this.xPrev) / dt;

        // Filter the derivative
        const alphaDx = this.alpha(this.dCutoff, dt);
        const dxFiltered = this.lowPass(dx, this.dxPrev, alphaDx);
        this.dxPrev = dxFiltered;

        // Adaptive cutoff based on speed
        const cutoff = this.minCutoff + this.beta * Math.abs(dxFiltered);

        // Filter the value
        const alphaX = this.alpha(cutoff, dt);
        const xFiltered = this.lowPass(x, this.xPrev, alphaX);
        this.xPrev = xFiltered;

        return xFiltered;
    }

    reset() {
        this.xPrev = null;
        this.dxPrev = null;
        this.tPrev = null;
    }
}

/**
 * Simple Kalman Filter for 1D position tracking
 * Provides predictive smoothing and handles occlusion gracefully
 */
class KalmanFilter1D {
    constructor(processNoise = 0.01, measurementNoise = 0.1) {
        this.Q = processNoise;      // Process noise covariance
        this.R = measurementNoise;  // Measurement noise covariance

        this.x = null;  // State estimate
        this.P = 1.0;   // Estimate uncertainty
        this.K = 0;     // Kalman gain

        this.velocity = 0;
        this.lastTimestamp = null;
    }

    /**
     * Update filter with new measurement
     */
    update(measurement, timestamp) {
        if (this.x === null) {
            this.x = measurement;
            this.lastTimestamp = timestamp;
            return measurement;
        }

        const dt = Math.max((timestamp - this.lastTimestamp) / 1000, 0.001);
        this.lastTimestamp = timestamp;

        // Predict step
        const xPredicted = this.x + this.velocity * dt;
        const pPredicted = this.P + this.Q;

        // Update step
        this.K = pPredicted / (pPredicted + this.R);
        this.x = xPredicted + this.K * (measurement - xPredicted);
        this.P = (1 - this.K) * pPredicted;

        // Update velocity estimate
        this.velocity = (this.x - xPredicted) / dt * 0.5 + this.velocity * 0.5;

        return this.x;
    }

    /**
     * Predict without measurement (for occlusion handling)
     */
    predict(timestamp) {
        if (this.x === null) return null;

        const dt = Math.max((timestamp - this.lastTimestamp) / 1000, 0.001);
        return this.x + this.velocity * dt;
    }

    reset() {
        this.x = null;
        this.P = 1.0;
        this.velocity = 0;
        this.lastTimestamp = null;
    }
}

/**
 * 3D Point Filter combining 1€ and Kalman filters
 */
class Point3DFilter {
    constructor(config = {}) {
        const {
            minCutoff = 0.5,
            beta = 0.007,
            dCutoff = 1.0,
            processNoise = 0.01,
            measurementNoise = 0.1,
            useKalman = true
        } = config;

        // One Euro filters for x, y, z
        this.euroX = new OneEuroFilter(minCutoff, beta, dCutoff);
        this.euroY = new OneEuroFilter(minCutoff, beta, dCutoff);
        this.euroZ = new OneEuroFilter(minCutoff, beta, dCutoff);

        // Kalman filters for x, y, z
        this.kalmanX = new KalmanFilter1D(processNoise, measurementNoise);
        this.kalmanY = new KalmanFilter1D(processNoise, measurementNoise);
        this.kalmanZ = new KalmanFilter1D(processNoise, measurementNoise);

        this.useKalman = useKalman;
        this.lastPoint = null;
        this.isOccluded = false;
        this.occlusionFrames = 0;
    }

    filter(point, timestamp) {
        if (!point) {
            // Handle occlusion
            this.occlusionFrames++;
            if (this.occlusionFrames > 10) {
                // Too long without data, reset
                this.reset();
                return null;
            }

            // Predict using Kalman
            if (this.useKalman && this.lastPoint) {
                return {
                    x: this.kalmanX.predict(timestamp),
                    y: this.kalmanY.predict(timestamp),
                    z: this.kalmanZ.predict(timestamp),
                    visibility: 0.3, // Low confidence for predicted
                    predicted: true
                };
            }
            return this.lastPoint;
        }

        this.occlusionFrames = 0;

        // Apply 1€ filter first
        let x = this.euroX.filter(point.x, timestamp);
        let y = this.euroY.filter(point.y, timestamp);
        let z = this.euroZ.filter(point.z || 0, timestamp);

        // Optionally apply Kalman on top
        if (this.useKalman) {
            x = this.kalmanX.update(x, timestamp);
            y = this.kalmanY.update(y, timestamp);
            z = this.kalmanZ.update(z, timestamp);
        }

        this.lastPoint = {
            x, y, z,
            visibility: point.visibility || 1,
            predicted: false
        };

        return this.lastPoint;
    }

    reset() {
        this.euroX.reset();
        this.euroY.reset();
        this.euroZ.reset();
        this.kalmanX.reset();
        this.kalmanY.reset();
        this.kalmanZ.reset();
        this.lastPoint = null;
        this.occlusionFrames = 0;
    }
}

/**
 * Main Stabilizer class - manages filter banks for all landmarks
 */
export class Stabilizer {
    constructor(config = {}) {
        this.config = {
            // 1€ Filter parameters (tuned for 60 FPS)
            minCutoff: config.minCutoff || 0.8,
            beta: config.beta || 0.005,
            dCutoff: config.dCutoff || 1.0,

            // Kalman parameters
            processNoise: config.processNoise || 0.005,
            measurementNoise: config.measurementNoise || 0.05,

            // Use Kalman for occlusion handling
            useKalman: config.useKalman !== false
        };

        // Filter banks for each landmark type
        this.faceFilters = new Map();
        this.bodyFilters = new Map();
        this.handFilters = new Map();

        // Motion metrics
        this.motionHistory = [];
        this.maxMotionHistory = 30; // ~0.5 seconds at 60fps
    }

    /**
     * Get or create filter for a specific landmark
     */
    getFilter(filterMap, id) {
        if (!filterMap.has(id)) {
            filterMap.set(id, new Point3DFilter(this.config));
        }
        return filterMap.get(id);
    }

    /**
     * Stabilize a single point array (face, body, or hand)
     */
    stabilizePoints(points, filterMap, timestamp, prefix = '') {
        if (!points || points.length === 0) return [];

        const stabilized = [];

        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const id = prefix + (point.originalIndex !== undefined ? point.originalIndex : i);
            const filter = this.getFilter(filterMap, id);

            const filtered = filter.filter(point, timestamp);
            if (filtered) {
                stabilized.push({
                    ...point,
                    x: filtered.x,
                    y: filtered.y,
                    z: filtered.z,
                    visibility: filtered.visibility,
                    stabilized: true
                });
            }
        }

        return stabilized;
    }

    /**
     * Calculate motion magnitude between frames
     */
    calculateMotion(current, previous) {
        if (!previous || !current) return 0;

        let totalMotion = 0;
        const count = Math.min(current.length, previous.length);

        for (let i = 0; i < count; i++) {
            const dx = current[i].x - previous[i].x;
            const dy = current[i].y - previous[i].y;
            totalMotion += Math.sqrt(dx * dx + dy * dy);
        }

        return count > 0 ? totalMotion / count : 0;
    }

    /**
     * Main stabilization function
     */
    stabilize(denseData) {
        if (!denseData) return null;

        const timestamp = denseData.timestamp || performance.now();

        const stabilizedData = {
            face: {
                points: [],
                count: 0
            },
            body: {
                points: [],
                count: 0
            },
            hands: {
                points: [],
                count: 0
            },
            blendshapes: denseData.blendshapes,
            timestamp: timestamp,
            fps: denseData.fps,
            totalPoints: 0
        };

        // Stabilize face points
        if (denseData.face && denseData.face.points) {
            stabilizedData.face.points = this.stabilizePoints(
                denseData.face.points,
                this.faceFilters,
                timestamp,
                'face_'
            );
            stabilizedData.face.count = stabilizedData.face.points.length;
        }

        // Stabilize body points
        if (denseData.body && denseData.body.points) {
            stabilizedData.body.points = this.stabilizePoints(
                denseData.body.points,
                this.bodyFilters,
                timestamp,
                'body_'
            );
            stabilizedData.body.count = stabilizedData.body.points.length;
        }

        // Stabilize hand points
        if (denseData.hands && denseData.hands.points) {
            stabilizedData.hands.points = this.stabilizePoints(
                denseData.hands.points,
                this.handFilters,
                timestamp,
                'hand_'
            );
            stabilizedData.hands.count = stabilizedData.hands.points.length;
        }

        stabilizedData.totalPoints =
            stabilizedData.face.count +
            stabilizedData.body.count +
            stabilizedData.hands.count;

        return stabilizedData;
    }

    /**
     * Get statistics about the filters
     */
    getStats() {
        return {
            faceFilters: this.faceFilters.size,
            bodyFilters: this.bodyFilters.size,
            handFilters: this.handFilters.size,
            totalFilters: this.faceFilters.size + this.bodyFilters.size + this.handFilters.size
        };
    }

    /**
     * Reset all filters (e.g., when tracking is lost)
     */
    reset() {
        this.faceFilters.forEach(f => f.reset());
        this.bodyFilters.forEach(f => f.reset());
        this.handFilters.forEach(f => f.reset());
        this.faceFilters.clear();
        this.bodyFilters.clear();
        this.handFilters.clear();
        this.motionHistory = [];
    }
}

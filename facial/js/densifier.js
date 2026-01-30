/**
 * Landmark Densification Engine
 * Interpolates between raw landmarks to create 1100+ ultra-dense tracking points
 * Uses Catmull-Rom splines for smooth curves and barycentric interpolation for surfaces
 */

export class Densifier {
    constructor() {
        // Interpolation settings
        this.bodySubdivisions = 5;      // Points between each joint
        this.faceSubdivisions = 2;       // Face contour subdivisions
        this.surfaceGridSize = 5;        // NxN grid for surface patches

        // Cached connections for body segments
        this.bodyConnections = this.defineBodyConnections();
        this.faceRegions = this.defineFaceRegions();
    }

    defineBodyConnections() {
        // Define connected segments for interpolation
        return {
            // Spine
            spine: [[11, 12], [23, 24]], // Will interpolate between shoulder-hip midpoints

            // Left arm
            leftArm: [
                [11, 13],  // Shoulder to elbow
                [13, 15],  // Elbow to wrist
            ],

            // Right arm
            rightArm: [
                [12, 14],  // Shoulder to elbow
                [14, 16],  // Elbow to wrist
            ],

            // Left leg
            leftLeg: [
                [23, 25],  // Hip to knee
                [25, 27],  // Knee to ankle
                [27, 31],  // Ankle to foot
            ],

            // Right leg
            rightLeg: [
                [24, 26],  // Hip to knee
                [26, 28],  // Knee to ankle
                [28, 32],  // Ankle to foot
            ],

            // Torso quad
            torso: [11, 12, 24, 23]  // Corners for surface grid
        };
    }

    defineFaceRegions() {
        // Face mesh regions for subdivision
        return {
            // Left eye contour indices
            leftEye: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
            rightEye: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382],

            // Eyebrows
            leftEyebrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
            rightEyebrow: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],

            // Lips
            lipsOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
            lipsInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],

            // Face oval/jawline
            faceOval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],

            // Nose
            noseBridge: [6, 197, 195, 5, 4, 1],
            noseBottom: [98, 240, 64, 48, 115, 220, 45, 4, 275, 440, 344, 278, 294, 460, 327],

            // Forehead (extended points)
            forehead: [10, 338, 297, 251, 21, 54, 103, 67, 109, 108, 151, 337],

            // Cheeks (for depth layers)
            leftCheek: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152],
            rightCheek: [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152],

            // Iris
            leftIris: [468, 469, 470, 471, 472],
            rightIris: [473, 474, 475, 476, 477]
        };
    }

    /**
     * Catmull-Rom spline interpolation
     * Creates smooth curves through control points
     */
    catmullRom(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        return {
            x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
            visibility: (p1.visibility + p2.visibility) / 2,
            interpolated: true
        };
    }

    /**
     * Linear interpolation between two points
     */
    lerp(p1, p2, t) {
        return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
            z: (p1.z || 0) + ((p2.z || 0) - (p1.z || 0)) * t,
            visibility: ((p1.visibility || 1) + (p2.visibility || 1)) / 2,
            interpolated: true
        };
    }

    /**
     * Interpolate along a segment with multiple subdivisions
     */
    interpolateSegment(p1, p2, subdivisions) {
        const points = [];
        for (let i = 1; i < subdivisions; i++) {
            const t = i / subdivisions;
            points.push(this.lerp(p1, p2, t));
        }
        return points;
    }

    /**
     * Create surface grid from quad corners using bilinear interpolation
     */
    interpolateSurface(corners, gridSize) {
        // corners: [topLeft, topRight, bottomRight, bottomLeft]
        const points = [];

        for (let i = 0; i <= gridSize; i++) {
            for (let j = 0; j <= gridSize; j++) {
                const u = i / gridSize;
                const v = j / gridSize;

                // Bilinear interpolation
                const top = this.lerp(corners[0], corners[1], u);
                const bottom = this.lerp(corners[3], corners[2], u);
                const point = this.lerp(top, bottom, v);
                point.surfaceU = u;
                point.surfaceV = v;
                points.push(point);
            }
        }
        return points;
    }

    /**
     * Subdivide a contour (closed loop of points)
     */
    subdivideContour(landmarks, indices, subdivisions) {
        const points = [];
        const n = indices.length;

        for (let i = 0; i < n; i++) {
            const curr = landmarks[indices[i]];
            const next = landmarks[indices[(i + 1) % n]];

            // Add original point
            points.push({ ...curr, originalIndex: indices[i] });

            // Add interpolated points
            const interpolated = this.interpolateSegment(curr, next, subdivisions + 1);
            points.push(...interpolated);
        }

        return points;
    }

    /**
     * Create depth layers for cheek/face regions
     */
    createDepthLayers(landmarks, indices, numLayers = 3) {
        const points = [];
        const center = this.computeCentroid(landmarks, indices);

        for (let layer = 0; layer < numLayers; layer++) {
            const depthOffset = layer * 0.02; // Each layer 2% deeper

            for (const idx of indices) {
                const p = landmarks[idx];
                points.push({
                    x: p.x,
                    y: p.y,
                    z: (p.z || 0) - depthOffset,
                    visibility: p.visibility || 1,
                    depthLayer: layer,
                    interpolated: layer > 0
                });
            }
        }

        return points;
    }

    /**
     * Compute centroid of a set of points
     */
    computeCentroid(landmarks, indices) {
        let x = 0, y = 0, z = 0;
        for (const idx of indices) {
            x += landmarks[idx].x;
            y += landmarks[idx].y;
            z += landmarks[idx].z || 0;
        }
        const n = indices.length;
        return { x: x / n, y: y / n, z: z / n };
    }

    /**
     * Densify body landmarks
     */
    densifyBody(poseLandmarks) {
        if (!poseLandmarks) return { points: [], count: 0 };

        const points = [];
        const subs = this.bodySubdivisions;

        // Add all original landmarks first
        poseLandmarks.forEach((lm, idx) => {
            points.push({
                ...lm,
                originalIndex: idx,
                region: 'body',
                interpolated: false
            });
        });

        // Interpolate arm segments
        const armSegments = [
            ...this.bodyConnections.leftArm,
            ...this.bodyConnections.rightArm
        ];

        for (const [a, b] of armSegments) {
            const interpolated = this.interpolateSegment(poseLandmarks[a], poseLandmarks[b], subs);
            interpolated.forEach(p => {
                p.region = 'arm';
            });
            points.push(...interpolated);
        }

        // Interpolate leg segments
        const legSegments = [
            ...this.bodyConnections.leftLeg,
            ...this.bodyConnections.rightLeg
        ];

        for (const [a, b] of legSegments) {
            const interpolated = this.interpolateSegment(poseLandmarks[a], poseLandmarks[b], subs);
            interpolated.forEach(p => {
                p.region = 'leg';
            });
            points.push(...interpolated);
        }

        // Create spine interpolation
        const leftShoulder = poseLandmarks[11];
        const rightShoulder = poseLandmarks[12];
        const leftHip = poseLandmarks[23];
        const rightHip = poseLandmarks[24];

        const neckCenter = this.lerp(leftShoulder, rightShoulder, 0.5);
        const hipCenter = this.lerp(leftHip, rightHip, 0.5);

        const spinePoints = this.interpolateSegment(neckCenter, hipCenter, 8);
        spinePoints.forEach(p => {
            p.region = 'spine';
        });
        points.push(...spinePoints);

        // Create torso surface grid
        const torsoCorners = [
            poseLandmarks[11], // Left shoulder
            poseLandmarks[12], // Right shoulder
            poseLandmarks[24], // Right hip
            poseLandmarks[23]  // Left hip
        ];

        const torsoGrid = this.interpolateSurface(torsoCorners, this.surfaceGridSize);
        torsoGrid.forEach(p => {
            p.region = 'torso';
        });
        points.push(...torsoGrid);

        return {
            points: points,
            count: points.length
        };
    }

    /**
     * Densify face landmarks
     */
    densifyFace(faceLandmarks) {
        if (!faceLandmarks) return { points: [], count: 0 };

        const points = [];
        const subs = this.faceSubdivisions;

        // Add all original 468 face landmarks
        faceLandmarks.forEach((lm, idx) => {
            points.push({
                ...lm,
                originalIndex: idx,
                region: 'face',
                interpolated: false
            });
        });

        // Subdivide eye contours
        const leftEyeSubdiv = this.subdivideContour(faceLandmarks, this.faceRegions.leftEye, subs);
        leftEyeSubdiv.forEach(p => p.region = 'leftEye');
        points.push(...leftEyeSubdiv);

        const rightEyeSubdiv = this.subdivideContour(faceLandmarks, this.faceRegions.rightEye, subs);
        rightEyeSubdiv.forEach(p => p.region = 'rightEye');
        points.push(...rightEyeSubdiv);

        // Subdivide eyebrows
        const leftBrowSubdiv = this.subdivideContour(faceLandmarks, this.faceRegions.leftEyebrow, subs);
        leftBrowSubdiv.forEach(p => p.region = 'leftEyebrow');
        points.push(...leftBrowSubdiv);

        const rightBrowSubdiv = this.subdivideContour(faceLandmarks, this.faceRegions.rightEyebrow, subs);
        rightBrowSubdiv.forEach(p => p.region = 'rightEyebrow');
        points.push(...rightBrowSubdiv);

        // Subdivide lips
        const outerLipsSubdiv = this.subdivideContour(faceLandmarks, this.faceRegions.lipsOuter, subs);
        outerLipsSubdiv.forEach(p => p.region = 'lipsOuter');
        points.push(...outerLipsSubdiv);

        const innerLipsSubdiv = this.subdivideContour(faceLandmarks, this.faceRegions.lipsInner, subs);
        innerLipsSubdiv.forEach(p => p.region = 'lipsInner');
        points.push(...innerLipsSubdiv);

        // Subdivide face oval/jawline
        const jawlineSubdiv = this.subdivideContour(faceLandmarks, this.faceRegions.faceOval, subs);
        jawlineSubdiv.forEach(p => p.region = 'jawline');
        points.push(...jawlineSubdiv);

        // Create cheek depth layers
        const leftCheekLayers = this.createDepthLayers(faceLandmarks, this.faceRegions.leftCheek, 3);
        leftCheekLayers.forEach(p => p.region = 'leftCheek');
        points.push(...leftCheekLayers);

        const rightCheekLayers = this.createDepthLayers(faceLandmarks, this.faceRegions.rightCheek, 3);
        rightCheekLayers.forEach(p => p.region = 'rightCheek');
        points.push(...rightCheekLayers);

        return {
            points: points,
            count: points.length
        };
    }

    /**
     * Densify hand landmarks
     */
    densifyHands(handsData) {
        if (!handsData || !handsData.landmarks) return { points: [], count: 0 };

        const points = [];
        const subs = 3; // Subdivisions per finger segment

        // Finger connections for each hand
        const fingerConnections = [
            [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],     // Index
            [0, 9], [9, 10], [10, 11], [11, 12], // Middle
            [0, 13], [13, 14], [14, 15], [15, 16], // Ring
            [0, 17], [17, 18], [18, 19], [19, 20]  // Pinky
        ];

        handsData.landmarks.forEach((handLandmarks, handIdx) => {
            const handedness = handsData.handedness?.[handIdx]?.[0]?.categoryName || 'Unknown';

            // Add original landmarks
            handLandmarks.forEach((lm, idx) => {
                points.push({
                    ...lm,
                    originalIndex: idx,
                    region: `hand_${handedness}`,
                    handIndex: handIdx,
                    interpolated: false
                });
            });

            // Interpolate finger segments
            for (const [a, b] of fingerConnections) {
                const interpolated = this.interpolateSegment(handLandmarks[a], handLandmarks[b], subs);
                interpolated.forEach(p => {
                    p.region = `hand_${handedness}`;
                    p.handIndex = handIdx;
                });
                points.push(...interpolated);
            }
        });

        return {
            points: points,
            count: points.length
        };
    }

    /**
     * Main densification function - combines all sources
     */
    densify(trackingResults) {
        if (!trackingResults) return null;

        const denseData = {
            face: this.densifyFace(trackingResults.face?.landmarks),
            body: this.densifyBody(trackingResults.pose?.landmarks),
            hands: this.densifyHands(trackingResults.hands),
            blendshapes: trackingResults.face?.blendshapes || [],
            timestamp: trackingResults.timestamp,
            fps: trackingResults.fps
        };

        // Calculate total
        denseData.totalPoints =
            denseData.face.count +
            denseData.body.count +
            denseData.hands.count;

        return denseData;
    }
}

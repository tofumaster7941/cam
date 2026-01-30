/**
 * Dense Landmark Drawer
 * Efficiently renders 1100+ tracking points with region-based coloring
 * Optimized for 60 FPS on M4 MacBook Pro
 */

export class DenseLandmarkDrawer {
    constructor() {
        this.canvas = document.getElementById('landmark_canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true });

        // Region color palette - vibrant and distinct
        this.colors = {
            // Face regions
            face: '#FF6B9D',
            leftEye: '#00D4FF',
            rightEye: '#00D4FF',
            leftEyebrow: '#FFD93D',
            rightEyebrow: '#FFD93D',
            lipsOuter: '#FF4757',
            lipsInner: '#FF6B81',
            jawline: '#C44569',
            leftCheek: '#F8B739',
            rightCheek: '#F8B739',
            nose: '#A29BFE',
            forehead: '#FDA7DF',


        };

        // Point sizes by type
        this.pointSizes = {
            original: 4,
            interpolated: 2,
            face: 2,
            hand: 3
        };

        // Performance settings
        this.skipInterpolated = false;
        this.showLabels = true;
        this.showConnections = true;
        this.showInfoPanel = true;
        this.debugMode = false;
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Get color for a point based on its region
     */
    getColor(point) {
        if (point.region && this.colors[point.region]) {
            return this.colors[point.region];
        }
        return '#FFFFFF';
    }

    /**
     * Get point size based on type
     */
    getPointSize(point) {
        if (point.interpolated) return this.pointSizes.interpolated;
        if (point.region?.startsWith('hand')) return this.pointSizes.hand;
        if (point.region?.includes('Eye') || point.region?.includes('lip')) return this.pointSizes.face;
        return this.pointSizes.original;
    }

    /**
     * Draw a single point with glow effect
     */
    drawPoint(ctx, x, y, size, color, hasGlow = true) {
        if (hasGlow) {
            // Glow
            ctx.beginPath();
            ctx.arc(x, y, size + 3, 0, Math.PI * 2);
            ctx.fillStyle = color + '33'; // 20% opacity
            ctx.fill();
        }

        // Main point
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    /**
     * Draw points from a region
     */
    drawRegionPoints(ctx, points, w, h, showInterpolated = true) {
        if (!points) return;

        for (const point of points) {
            // Skip interpolated points if flag is set
            if (point.interpolated && !showInterpolated) continue;

            // Skip low visibility points
            const visibility = point.visibility !== undefined ? point.visibility : 1;
            if (visibility < 0.3) continue;

            // Transform coordinates (mirror horizontally)
            const x = (1 - point.x) * w;
            const y = point.y * h;

            // Get visual properties
            const color = this.getColor(point);
            const size = this.getPointSize(point);
            const hasGlow = !point.interpolated;

            this.drawPoint(ctx, x, y, size, color, hasGlow);
        }
    }

    /**
     * Draw face mesh connections
     */
    drawFaceConnections(ctx, facePoints, w, h) {
        if (!facePoints || facePoints.length < 468) return;

        // MediaPipe face mesh tesselation (simplified key contours)
        const contours = {
            leftEye: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33],
            rightEye: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 362],
            lipsOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61],
            lipsInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78]
        };

        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;

        // Get original face landmarks (first 468)
        const originalFace = facePoints.filter(p => p.originalIndex !== undefined && p.originalIndex < 468);
        if (originalFace.length < 468) return;

        // Create lookup by originalIndex
        const lookup = {};
        originalFace.forEach(p => {
            lookup[p.originalIndex] = p;
        });

        for (const [region, indices] of Object.entries(contours)) {
            ctx.strokeStyle = this.colors[region] || '#FFFFFF';
            ctx.beginPath();

            let started = false;
            for (const idx of indices) {
                const point = lookup[idx];
                if (!point) continue;

                const x = (1 - point.x) * w;
                const y = point.y * h;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    /**
     * Draw body skeleton connections
     */


    /**
     * Draw hand connections
     */


    /**
     * Draw info panel with stats
     */
    drawInfoPanel(ctx, data) {
        const panelX = 10;
        const panelY = 10;
        const panelWidth = 280;
        const panelHeight = 200;

        // Semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 12);
        ctx.fill();

        // Border
        ctx.strokeStyle = '#00FFCC33';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Title
        ctx.fillStyle = '#00FFCC';
        ctx.font = 'bold 16px "SF Mono", monospace';
        ctx.fillText('⚡ ULTRA-DENSE MOCAP', panelX + 12, panelY + 28);

        // Stats
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '13px "SF Mono", monospace';

        const stats = [
            `FPS: ${data.fps || 0}`,
            `Total Points: ${data.totalPoints || 0}`,
            `└ Face: ${data.face?.count || 0}`,
            `Blendshapes: ${data.blendshapes?.length || 0}`
        ];

        stats.forEach((stat, i) => {
            const color = i === 0 ? (data.fps >= 55 ? '#00FF88' : data.fps >= 30 ? '#FFD93D' : '#FF4757') : '#FFFFFF';
            ctx.fillStyle = color;
            ctx.fillText(stat, panelX + 12, panelY + 55 + (i * 22));
        });

        // Quality indicator
        const quality = data.totalPoints >= 1000 ? 'CGI-GRADE' : data.totalPoints >= 500 ? 'HIGH' : 'STANDARD';
        const qualityColor = data.totalPoints >= 1000 ? '#00FFCC' : data.totalPoints >= 500 ? '#FFD93D' : '#AAAAAA';

        ctx.fillStyle = qualityColor;
        ctx.font = 'bold 11px "SF Mono", monospace';
        ctx.fillText(`QUALITY: ${quality}`, panelX + 12, panelY + 188);
    }

    /**
     * Main draw function
     */
    draw(processedData) {
        if (!processedData) return;

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, w, h);

        // Draw connections first (behind points)
        if (this.showConnections) {
            if (processedData.face?.points) {
                this.drawFaceConnections(ctx, processedData.face.points, w, h);
            }
        }

        // Draw points
        const showInterpolated = !this.skipInterpolated;
        this.drawRegionPoints(ctx, processedData.face?.points, w, h, showInterpolated);

        // Draw info panel
        if (this.showInfoPanel) {
            this.drawInfoPanel(ctx, processedData);
        }
    }

    /**
     * Toggle display options
     */
    setOption(option, value) {
        if (option === 'skipInterpolated') this.skipInterpolated = value;
        if (option === 'showLabels') this.showLabels = value;
        if (option === 'showConnections') this.showConnections = value;
        if (option === 'showInfoPanel') this.showInfoPanel = value;
        if (option === 'debugMode') this.debugMode = value;
    }
}

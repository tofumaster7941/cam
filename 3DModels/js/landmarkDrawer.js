/**
 * Draws pose landmarks on a canvas for visualization
 */
export class LandmarkDrawer {
    constructor() {
        this.canvas = document.getElementById('landmark_canvas');
        this.ctx = this.canvas.getContext('2d');

        // Body part connections (MediaPipe pose landmark indices)
        this.connections = [
            // Face
            [0, 1], [1, 2], [2, 3], [3, 7], // Left eye
            [0, 4], [4, 5], [5, 6], [6, 8], // Right eye
            [9, 10], // Mouth
            // Torso
            [11, 12], // Shoulders
            [11, 23], [12, 24], // Shoulders to hips
            [23, 24], // Hips
            // Left arm
            [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
            // Right arm
            [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
            // Left leg
            [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
            // Right leg
            [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]
        ];

        // Landmark names for labeling (key landmarks only)
        this.landmarkNames = {
            0: 'NOSE',
            11: 'L_SHOULDER',
            12: 'R_SHOULDER',
            13: 'L_ELBOW',
            14: 'R_ELBOW',
            15: 'L_WRIST',
            16: 'R_WRIST',
            23: 'L_HIP',
            24: 'R_HIP',
            25: 'L_KNEE',
            26: 'R_KNEE',
            27: 'L_ANKLE',
            28: 'R_ANKLE'
        };

        // Colors for different body parts
        this.colors = {
            face: '#FF6B6B',
            torso: '#4ECDC4',
            leftArm: '#45B7D1',
            rightArm: '#96CEB4',
            leftLeg: '#FFEAA7',
            rightLeg: '#DDA0DD'
        };
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    getColor(connectionIndex) {
        const [a, b] = this.connections[connectionIndex];
        // Face connections (indices 0-10)
        if (a <= 10 && b <= 10) return this.colors.face;
        // Torso (11, 12, 23, 24)
        if ([11, 12, 23, 24].includes(a) && [11, 12, 23, 24].includes(b)) return this.colors.torso;
        // Left arm (11, 13, 15, 17, 19, 21)
        if ([11, 13, 15, 17, 19, 21].some(i => a === i || b === i) && a >= 11 && a <= 21) return this.colors.leftArm;
        // Right arm (12, 14, 16, 18, 20, 22)
        if ([12, 14, 16, 18, 20, 22].some(i => a === i || b === i) && a >= 12 && a <= 22) return this.colors.rightArm;
        // Left leg (23, 25, 27, 29, 31)
        if ([23, 25, 27, 29, 31].some(i => a === i || b === i)) return this.colors.leftLeg;
        // Right leg (24, 26, 28, 30, 32)
        if ([24, 26, 28, 30, 32].some(i => a === i || b === i)) return this.colors.rightLeg;
        return '#FFFFFF';
    }

    draw(landmarks) {
        if (!landmarks || landmarks.length === 0) return;

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, w, h);

        // Convert normalized landmarks to pixel coordinates (mirrored)
        const points = landmarks.map(l => ({
            x: (1 - l.x) * w, // Mirror horizontally
            y: l.y * h,
            z: l.z || 0,
            visibility: l.visibility !== undefined ? l.visibility : 1.0 // Default to visible
        }));

        // Draw connections (skeleton lines)
        ctx.lineWidth = 3;
        this.connections.forEach((conn, index) => {
            const [a, b] = conn;
            if (points[a] && points[b]) {
                const pa = points[a];
                const pb = points[b];

                // Only draw if both points are visible enough
                if (pa.visibility > 0.5 && pb.visibility > 0.5) {
                    ctx.beginPath();
                    ctx.strokeStyle = this.getColor(index);
                    ctx.moveTo(pa.x, pa.y);
                    ctx.lineTo(pb.x, pb.y);
                    ctx.stroke();
                }
            }
        });

        // Draw landmark points
        points.forEach((p, index) => {
            if (p.visibility > 0.5) {
                // Glow effect
                ctx.beginPath();
                ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 204, 0.3)';
                ctx.fill();

                // Main point
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#00FFCC';
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Draw label for key landmarks
                if (this.landmarkNames[index]) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.fillText(this.landmarkNames[index], p.x + 10, p.y + 4);
                }
            }
        });

        // Draw info panel
        this.drawInfoPanel(ctx, landmarks);
    }

    drawInfoPanel(ctx, landmarks) {
        const panelX = 10;
        const panelY = 10;
        const panelWidth = 200;
        const panelHeight = 180;

        // Semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 10);
        ctx.fill();

        // Title
        ctx.fillStyle = '#00FFCC';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('🎯 BODY TRACKING', panelX + 10, panelY + 25);

        // Tracked points count
        const visibleCount = landmarks.filter(l => (l.visibility !== undefined ? l.visibility : 1.0) > 0.5).length;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px sans-serif';
        ctx.fillText(`Points tracked: ${visibleCount}/33`, panelX + 10, panelY + 50);

        // Legend
        ctx.font = '11px sans-serif';
        const legendItems = [
            { color: this.colors.face, label: '● Face' },
            { color: this.colors.torso, label: '● Torso' },
            { color: this.colors.leftArm, label: '● Left Arm' },
            { color: this.colors.rightArm, label: '● Right Arm' },
            { color: this.colors.leftLeg, label: '● Left Leg' },
            { color: this.colors.rightLeg, label: '● Right Leg' }
        ];

        legendItems.forEach((item, i) => {
            ctx.fillStyle = item.color;
            ctx.fillText(item.label, panelX + 10, panelY + 75 + (i * 16));
        });
    }
}

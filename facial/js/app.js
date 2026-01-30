/**
 * Ultra-Dense Motion Capture Application
 * CGI-grade tracking with 1100+ landmarks at 60 FPS
 * Optimized for M4 MacBook Pro
 */

import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { DenseTracker } from './denseTracker.js';
import { Densifier } from './densifier.js';
import { Stabilizer } from './stabilizer.js';
import { WaveMotionEngine } from './waveEngine.js';
import { DenseLandmarkDrawer } from './denseLandmarkDrawer.js';
import { CelebrityMatcher } from './celebrityMatcher.js';

class UltraDenseMocapApp {
    constructor() {
        // Core components
        this.camera = new Camera();
        this.renderer = new Renderer();

        // Dense tracking pipeline
        this.tracker = new DenseTracker();
        this.matcher = new CelebrityMatcher();

        // UI for Match Result
        this.matchInfo = document.createElement('div');
        this.matchInfo.style.position = 'absolute';
        this.matchInfo.style.top = '20px';
        this.matchInfo.style.right = '20px';
        this.matchInfo.style.color = '#00ff88';
        this.matchInfo.style.fontFamily = 'monospace';
        this.matchInfo.style.fontSize = '24px';
        this.matchInfo.style.textAlign = 'right';
        this.matchInfo.style.zIndex = '100';
        this.matchInfo.style.textShadow = '0 0 10px #000';
        document.body.appendChild(this.matchInfo);
        this.densifier = new Densifier();
        this.stabilizer = new Stabilizer({
            minCutoff: 0.8,      // Tuned for 60 FPS
            beta: 0.005,         // Speed coefficient
            processNoise: 0.005,
            measurementNoise: 0.05
        });
        this.waveEngine = new WaveMotionEngine({
            stiffness: 0.3,
            damping: 0.85,
            propagationSpeed: 0.15
        });

        // Visualization
        this.landmarkDrawer = new DenseLandmarkDrawer();

        // UI elements
        this.loading = document.getElementById('loading');

        // Performance tracking
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.displayFps = 0;

        // State
        this.isRunning = false;


        // Space Bar Restart Match
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling
                console.log('Restarting Match...');
                this.matchInfo.innerHTML = ''; // Clear match UI
                this.matcher.reset(); // Optional: Reset matcher state if needed
            }
        });

        // Ensure window has focus for keys to work
        window.addEventListener('click', () => {
            window.focus();
        });
    }

    async init() {
        try {
            console.log('🚀 Initializing Ultra-Dense Motion Capture...');
            this.updateLoadingStatus('Starting camera...');

            // 1. Start Camera
            await this.camera.start();
            console.log('✅ Camera started');

            // 2. Setup Three.js renderer (for potential 3D overlays)
            this.updateLoadingStatus('Setting up renderer...');
            this.renderer.init(this.camera.videoElement);
            console.log('✅ Renderer initialized');

            // 3. Setup landmark drawer
            this.updateLoadingStatus('Initializing visualization...');
            this.landmarkDrawer.init();
            console.log('✅ Landmark drawer ready');

            // 4. Initialize Celebrity Matcher
            this.updateLoadingStatus('Loading Celebrity DB...');
            await this.matcher.init();
            console.log('✅ Celebrity Matcher ready');

            // 4. Initialize dense tracker (loads 3 ML models)
            this.updateLoadingStatus('Loading AI models (Face + Body + Hands)...');
            await this.tracker.init((status) => {
                this.updateLoadingStatus(status);
            });
            console.log('✅ Dense tracker initialized (543 raw landmarks)');

            // 5. Hide loading, start loop
            this.loading.style.display = 'none';
            this.isRunning = true;

            console.log('⚡ Face-Only Motion Capture ACTIVE');
            console.log('   Target: High Density Face Mesh');
            console.log('   [SPACE] Restart Match');

            this.loop();

        } catch (e) {
            console.error('❌ Initialization failed:', e);
            this.loading.innerText = 'Error: ' + e.message;
            this.loading.style.background = 'rgba(255,0,0,0.8)';
        }
    }

    updateLoadingStatus(status) {
        if (this.loading) {
            this.loading.innerText = status;
        }
    }

    loop() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.loop());

        const video = this.camera.videoElement;
        if (video.readyState < 2) return;

        // Track FPS
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= 1000) {
            this.displayFps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }

        // === DENSE TRACKING PIPELINE ===

        // 1. Raw tracking (543 landmarks from Face + Pose + Hands)
        const rawResults = this.tracker.detect(video);
        if (!rawResults) return;

        // 2. Densification (interpolate to 1100+ points)
        const denseData = this.densifier.densify(rawResults);
        if (!denseData) return;

        // 3. Temporal stabilization (1€ + Kalman filters)
        const stabilizedData = this.stabilizer.stabilize(denseData);

        // 4. Wave motion dynamics
        const processedData = this.waveEngine.process(stabilizedData);

        // --- Celebrity Match (Every 30 frames / 0.5s) ---
        if (this.frameCount % 30 === 0 && processedData?.face?.points) {
            const match = this.matcher.findMatch(processedData.face.points);

            if (match && match.bestMatch) {
                const best = match.bestMatch;

                // Build Top 3 list
                let listHtml = '';
                match.top3.forEach((m, index) => {
                    // Highlight best match slightly differently if needed
                    const color = index === 0 ? '#00ffaa' : '#cccccc';
                    listHtml += `
                        <div style="display: flex; justify-content: space-between; font-size: 14px; margin-top: 4px; color: ${color};">
                            <span>${index + 1}. ${m.name}</span>
                            <span>${m.similarity}%</span>
                        </div>
                    `;
                });

                this.matchInfo.innerHTML = `
                    <div style="display: flex; align-items: flex-start; gap: 10px; background: rgba(0,0,0,0.7); padding: 15px; border-radius: 12px; border: 1px solid #00ffaa;">
                        <!-- Match Image -->
                        <div style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; border: 2px solid #00ffaa;">
                            <img src="${best.image}" style="width: 100%; height: 100%; object-fit: cover;" alt="${best.name}">
                        </div>
                        
                        <!-- Stats -->
                        <div style="text-align: left;">
                            <div style="font-size: 10px; color: #aaa; letter-spacing: 1px;">TOP MATCH</div>
                            <div style="font-size: 20px; font-weight: bold; color: #fff; margin-bottom: 2px;">${best.name}</div>
                            <div style="font-size: 18px; color: #00ffaa; margin-bottom: 8px;">${best.similarity}%</div>
                            
                            <!-- Divider -->
                            <div style="height: 1px; background: #555; margin-bottom: 5px;"></div>
                            
                            <!-- Top 3 List -->
                            ${listHtml}
                        </div>
                    </div>
                `;
            }
        }



        // Add display FPS
        if (processedData) {
            processedData.fps = this.displayFps;
        }

        // 5. Visualization
        this.landmarkDrawer.draw(processedData);

        // 6. Update 3D Face Mesh
        this.renderer.updateFaceVisuals(processedData);

        // 7. Update 3D Character (REMOVED)

        // 8. Render Three.js scene (transparent overlay)
        this.renderer.render();


    }

    /**
     * Stop the application
     */
    stop() {
        this.isRunning = false;
        this.stabilizer.reset();
        this.waveEngine.reset();
    }

    /**
     * Toggle visualization options
     */
    toggleOption(option) {
        const current = this.landmarkDrawer[option];
        this.landmarkDrawer.setOption(option, !current);
    }
}

// Initialize and run
const app = new UltraDenseMocapApp();
app.init();

// Expose for debugging
window.mocapApp = app;

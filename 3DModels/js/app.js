/**
 * Ultra-Dense Motion Capture Application
 * CGI-grade tracking with 1100+ landmarks at 60 FPS
 * Optimized for M4 MacBook Pro
 */

import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { Rigger } from './rigger.js';
import { DenseTracker } from './denseTracker.js';
import { Densifier } from './densifier.js';
import { Stabilizer } from './stabilizer.js';
import { WaveMotionEngine } from './waveEngine.js';
import { DenseLandmarkDrawer } from './denseLandmarkDrawer.js';

class UltraDenseMocapApp {
    constructor() {
        // Core components
        this.camera = new Camera();
        this.renderer = new Renderer();
        this.rigger = new Rigger();

        // Dense tracking pipeline
        this.tracker = new DenseTracker();
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
        this.matrixMode = false;

        // Space Bar Toggle for Matrix Mode
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling
                this.matrixMode = !this.matrixMode;
                console.log('Matrix Mode:', this.matrixMode ? 'ON' : 'OFF');
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

            // Initialize Rigger (Procedural 3D Character) - DISABLED
            // this.rigger.init(this.renderer);
            // console.log('✅ Rigger initialized');

            // 3. Setup landmark drawer
            this.updateLoadingStatus('Initializing visualization...');
            this.landmarkDrawer.init();
            console.log('✅ Landmark drawer ready');

            // 4. Initialize dense tracker (loads 3 ML models)
            this.updateLoadingStatus('Loading AI models (Face + Body + Hands)...');
            await this.tracker.init((status) => {
                this.updateLoadingStatus(status);
            });
            console.log('✅ Dense tracker initialized (543 raw landmarks)');

            // 5. Hide loading, start loop
            this.loading.style.display = 'none';
            this.isRunning = true;

            console.log('⚡ Ultra-Dense Motion Capture ACTIVE');
            console.log('   Target: 1100+ landmarks @ 60 FPS');
            console.log('   [SPACE] Toggle Matrix Mode');

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

        // 4. Wave motion dynamics (organic propagation)
        const processedData = this.waveEngine.process(stabilizedData);

        // Add display FPS
        if (processedData) {
            processedData.fps = this.displayFps;
        }

        // 5. Visualization
        this.landmarkDrawer.draw(processedData);

        // 6. Update 3D Hand Models
        this.renderer.updateHandVisuals(processedData);
        this.renderer.updateFaceVisuals(processedData);

        // 7. Update 3D Character (DISABLED)
        // this.rigger.update(processedData);

        // 8. Render Three.js scene (transparent overlay)
        this.renderer.render();

        // 9. Matrix Mode (Black BG) Logic
        // Toggle via Space Bar
        if (this.matrixMode) {
            video.style.opacity = '0';
        } else {
            video.style.opacity = '1';
        }
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

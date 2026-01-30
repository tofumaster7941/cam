
import * as THREE from 'three';

export class Rigger {
    constructor() {
        this.scene = null;
        this.root = new THREE.Group();
        this.nodes = {};

        // Materials
        this.headMat = new THREE.MeshPhysicalMaterial({
            color: 0xffcc00, // Yellow head
            metalness: 0.2,
            roughness: 0.4,
            clearcoat: 0.5
        });

        this.bodyMat = new THREE.MeshPhysicalMaterial({
            color: 0x3366ff, // Blue body
            metalness: 0.3,
            roughness: 0.5
        });

        this.limbMat = new THREE.MeshPhysicalMaterial({
            color: 0x44aa44, // Green limbs
            metalness: 0.2,
            roughness: 0.6
        });
    }

    init(renderer) {
        this.renderer = renderer;
        this.scene = renderer.scene;
        this.scene.add(this.root);

        this.setupNodes();
        this.createProceduralBody();
    }

    setupNodes() {
        const parts = [
            'nose',
            'left_shoulder', 'right_shoulder',
            'left_elbow', 'right_elbow',
            'left_wrist', 'right_wrist',
            'left_hip', 'right_hip',
            'left_knee', 'right_knee',
            'left_ankle', 'right_ankle',
            'torso'
        ];

        parts.forEach(name => {
            const obj = new THREE.Group();
            obj.name = name;
            this.root.add(obj);
            this.nodes[name] = obj;
        });
    }


    createProceduralBody() {
        // === HEAD (Sphere) ===
        const headGeo = new THREE.SphereGeometry(0.08, 32, 32);
        const headMesh = new THREE.Mesh(headGeo, this.headMat);
        headMesh.castShadow = true;
        headMesh.receiveShadow = true;
        this.nodes['nose'].add(headMesh);

        // Add Face specific features
        this.addFaceFeatures(headMesh);

        // === BODY (Box) ===
        const bodyGeo = new THREE.BoxGeometry(0.18, 0.22, 0.08);
        const bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMat);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        this.nodes['torso'].add(bodyMesh);

        // === ARMS (Capsules) ===
        // Upper Arms
        this.createLimb('left_shoulder', 0.025, 0.12, this.limbMat);
        this.createLimb('right_shoulder', 0.025, 0.12, this.limbMat);
        // Forearms
        this.createLimb('left_elbow', 0.02, 0.10, this.limbMat);
        this.createLimb('right_elbow', 0.02, 0.10, this.limbMat);

        // === LEGS (Capsules) ===
        // Upper Legs (thighs)
        this.createLimb('left_hip', 0.035, 0.18, this.limbMat);
        this.createLimb('right_hip', 0.035, 0.18, this.limbMat);
        // Lower Legs (shins)
        this.createLimb('left_knee', 0.028, 0.16, this.limbMat);
        this.createLimb('right_knee', 0.028, 0.16, this.limbMat);

        // === HANDS (Small spheres) ===
        const handGeo = new THREE.SphereGeometry(0.025, 16, 16);
        const leftHand = new THREE.Mesh(handGeo, this.headMat);
        const rightHand = new THREE.Mesh(handGeo, this.headMat);
        leftHand.castShadow = true;
        rightHand.castShadow = true;
        this.nodes['left_wrist'].add(leftHand);
        this.nodes['right_wrist'].add(rightHand);

        // === FEET (Small boxes) ===
        const footGeo = new THREE.BoxGeometry(0.04, 0.02, 0.06);
        const leftFoot = new THREE.Mesh(footGeo, this.bodyMat);
        const rightFoot = new THREE.Mesh(footGeo, this.bodyMat);
        leftFoot.castShadow = true;
        rightFoot.castShadow = true;
        this.nodes['left_ankle'].add(leftFoot);
        this.nodes['right_ankle'].add(rightFoot);
    }

    addFaceFeatures(headMesh) {
        // Eyes (White spheres with black pupils)
        const eyeGeo = new THREE.SphereGeometry(0.015, 16, 16);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo = new THREE.SphereGeometry(0.007, 16, 16);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        // Left Eye
        this.leftEye = new THREE.Group();
        const leMesh = new THREE.Mesh(eyeGeo, eyeMat);
        const lpMesh = new THREE.Mesh(pupilGeo, pupilMat);
        lpMesh.position.z = 0.012; // Pupil slightly forward
        this.leftEye.add(leMesh);
        this.leftEye.add(lpMesh);
        this.leftEye.position.set(-0.025, 0.01, 0.07); // Adjust relative to head
        headMesh.add(this.leftEye);

        // Right Eye
        this.rightEye = new THREE.Group();
        const reMesh = new THREE.Mesh(eyeGeo, eyeMat);
        const rpMesh = new THREE.Mesh(pupilGeo, pupilMat);
        rpMesh.position.z = 0.012;
        this.rightEye.add(reMesh);
        this.rightEye.add(rpMesh);
        this.rightEye.position.set(0.025, 0.01, 0.07);
        headMesh.add(this.rightEye);

        // Mouth (Black Capsule/Cylinder)
        const mouthGeo = new THREE.CapsuleGeometry(0.008, 0.03, 4, 8);
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
        this.mouth = new THREE.Mesh(mouthGeo, mouthMat);
        this.mouth.rotation.z = Math.PI / 2; // Horizontal
        this.mouth.position.set(0, -0.025, 0.075);
        headMesh.add(this.mouth);
    }

    createLimb(nodeName, radius, length, material) {
        if (!this.nodes[nodeName]) return;

        const geo = new THREE.CapsuleGeometry(radius, length, 4, 8);
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Position so it extends "down" from the joint
        mesh.position.y = -length / 2;

        this.nodes[nodeName].add(mesh);
        return mesh;
    }

    orientBone(nodeA, posA, posB) {
        if (!nodeA) return;
        const v = new THREE.Vector3().subVectors(posB, posA);
        if (v.lengthSq() < 0.0001) return;
        const dir = v.clone().normalize();
        const targetUp = dir.clone().negate();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetUp);
        nodeA.quaternion.slerp(q, 0.8);
    }

    update(fullData) {
        // Handle pose - Use worldLandmarks for PiP (Pure 3D)
        if (fullData && fullData.pose && fullData.pose.worldLandmarks) {
            this.animateBody(fullData.pose.worldLandmarks);
        }

        // Handle face
        if (fullData && fullData.face && fullData.face.landmarks) {
            this.animateFace(fullData.face.landmarks);
        }
    }

    animateFace(landmarks) {
        if (!this.mouth || !this.leftEye || !this.rightEye) return;

        // Simple logic:
        // 1. Mouth open/close based on distance between upper/lower lip
        // Indicies: Upper Lip (13), Lower Lip (14) - standard MediaPipe
        const topLip = landmarks[13];
        const botLip = landmarks[14];

        // Calculate vertical opening
        const mouthOpen = Math.abs(topLip.y - botLip.y);

        // Base scale + opening factor
        // Typically mouth open is 0.0 to 0.1ish
        const scaleY = 1 + (mouthOpen * 50);
        this.mouth.scale.set(1, Math.max(1, scaleY), 1);

        // 2. Head Rotation (already handled by body pose rough estimation, 
        // but could be refined here if we wanted precise face rotation)

        // 3. Eye Blinking
        // Left Eye: 159 (upper), 145 (lower)
        // Right Eye: 386 (upper), 374 (lower)
        const leftBlink = Math.abs(landmarks[159].y - landmarks[145].y);
        const rightBlink = Math.abs(landmarks[386].y - landmarks[374].y);

        // If distance is small, scale Y to 0.1 to simulate close
        this.leftEye.scale.y = leftBlink < 0.01 ? 0.1 : 1;
        this.rightEye.scale.y = rightBlink < 0.01 ? 0.1 : 1;
    }

    animateBody(worldLandmarks) {
        // Direct use of world landmarks (centered at 0,0,0 typically approx)
        const getPos = (idx) => {
            const l = worldLandmarks[idx];
            // MediaPipe World Landmarks: meters, origin at midpoint of hips
            return new THREE.Vector3(-l.x, -l.y, -l.z);
        };

        const idx = {
            nose: 0,
            ls: 11, rs: 12,
            le: 13, re: 14,
            lw: 15, rw: 16,
            lh: 23, rh: 24,
            lk: 25, rk: 26,
            la: 27, ra: 28
        };

        const p = {};
        for (const [k, v] of Object.entries(idx)) {
            p[k] = getPos(v);
        }

        // 1. Position Joints
        for (const [name, node] of Object.entries(this.nodes)) {
            let pos = null;
            if (name === 'nose') pos = p.nose;
            if (name === 'left_shoulder') pos = p.ls;
            if (name === 'right_shoulder') pos = p.rs;
            if (name === 'left_elbow') pos = p.le;
            if (name === 'right_elbow') pos = p.re;
            if (name === 'left_wrist') pos = p.lw;
            if (name === 'right_wrist') pos = p.rw;
            if (name === 'left_hip') pos = p.lh;
            if (name === 'right_hip') pos = p.rh;
            if (name === 'left_knee') pos = p.lk;
            if (name === 'right_knee') pos = p.rk;
            if (name === 'left_ankle') pos = p.la;
            if (name === 'right_ankle') pos = p.ra;

            if (pos) {
                node.position.lerp(pos, 0.7);
            }
        }

        // 2. Torso (center of shoulders and hips)
        // If hips are inferred (poor confidence), we might want to just rely on shoulders?
        // But MediaPipe usually gives something.
        const torsoPos = new THREE.Vector3()
            .add(p.ls).add(p.rs).add(p.lh).add(p.rh).multiplyScalar(0.25);
        this.nodes['torso'].position.lerp(torsoPos, 0.7);

        // 3. Orient limbs toward next joint
        this.orientBone(this.nodes.left_shoulder, p.ls, p.le);
        this.orientBone(this.nodes.right_shoulder, p.rs, p.re);
        this.orientBone(this.nodes.left_elbow, p.le, p.lw);
        this.orientBone(this.nodes.right_elbow, p.re, p.rw);
        this.orientBone(this.nodes.left_hip, p.lh, p.lk);
        this.orientBone(this.nodes.right_hip, p.rh, p.rk);
        this.orientBone(this.nodes.left_knee, p.lk, p.la);
        this.orientBone(this.nodes.right_knee, p.rk, p.ra);

        // 4. Torso Orientation
        const midHips = new THREE.Vector3().add(p.lh).add(p.rh).multiplyScalar(0.5);
        const midShoulders = new THREE.Vector3().add(p.ls).add(p.rs).multiplyScalar(0.5);
        const torsoUp = new THREE.Vector3().subVectors(midShoulders, midHips).normalize();

        // For right vector, shoulders are more reliable than hips if sitting
        const torsoRight = new THREE.Vector3().subVectors(p.rs, p.ls).normalize();
        const torsoFwd = new THREE.Vector3().crossVectors(torsoRight, torsoUp).normalize();
        const m = new THREE.Matrix4().makeBasis(torsoRight, torsoUp, torsoFwd);

        const qTorso = new THREE.Quaternion().setFromRotationMatrix(m);
        this.nodes.torso.quaternion.slerp(qTorso, 0.7);
    }
}

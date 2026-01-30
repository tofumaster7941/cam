import cv2
import mediapipe as mp
import numpy as np
import time
import math

class IronManApp:
    def __init__(self):
        # MediaPipe Components
        self.mp_holistic = mp.solutions.holistic
        self.holistic = self.mp_holistic.Holistic(
            min_detection_confidence=0.5, 
            min_tracking_confidence=0.5,
            enable_segmentation=True,
            smooth_segmentation=True
        )
        
        # Load Assets
        self.helmet_path = "/Users/ginapark/.gemini/antigravity/brain/dd71e901-2964-44a4-8dc6-21823272dd51/uploaded_image_1768505541069.jpg"
        self.helmet_img = self._load_image_safe(self.helmet_path)
        if self.helmet_img is None:
            print("Error: Could not load helmet image.")
            self.helmet_img = np.zeros((300, 300, 3), dtype=np.uint8)
            cv2.circle(self.helmet_img, (150, 150), 100, (0, 0, 255), -1)

        if self.helmet_img is None:
            print("Error: Could not load helmet image.")
            self.helmet_img = np.zeros((300, 300, 3), dtype=np.uint8)
            cv2.circle(self.helmet_img, (150, 150), 100, (0, 0, 255), -1)

        # Pre-calculate Source Points for Mesh Warping (Normalized)
        # Order: [LeftEye, RightEye, Nose, Mouth, Chin, Forehead, LeftSide, RightSide]
        h, w, _ = self.helmet_img.shape
        self.helmet_w = w
        self.helmet_h = h
        
        self.src_helmet_points = np.float32([
            [w * 0.28, h * 0.45], # 0: Left Eye
            [w * 0.72, h * 0.45], # 1: Right Eye
            [w * 0.50, h * 0.65], # 2: Nose
            [w * 0.50, h * 0.80], # 3: Mouth
            [w * 0.50, h * 0.95], # 4: Chin
            [w * 0.50, h * 0.10], # 5: Forehead
            [w * 0.05, h * 0.50], # 6: Left Side (Ear)
            [w * 0.95, h * 0.50]  # 7: Right Side (Ear)
        ])
        
        # Triangulation Indices (0-7)
        self.helmet_triangles = [
            (5, 0, 2), (5, 1, 2), # Forehead -> Eyes -> Nose
            (0, 6, 2), (1, 7, 2), # Eyes -> Sides -> Nose/Cheeks
            (6, 4, 3), (7, 4, 3), # Sides -> Chin -> Mouth
            (6, 2, 3), (7, 2, 3), # Sides -> Nose -> Mouth
            (0, 2, 3), (1, 2, 3)  # Eyes -> Nose -> Mouth (Central)
        ]

        # --- BODY SUIT ASSETS ---
        self.bodysuit_path = "/Users/ginapark/.gemini/antigravity/brain/dd71e901-2964-44a4-8dc6-21823272dd51/uploaded_image_1768931984272.png"
        self.bodysuit_img = self._load_image_safe(self.bodysuit_path)
        
        # Define Source Keypoints for the FRONT VIEW Suit (Middle of the image)
        # Image is roughly 3 panels. Middle panel is Front.
        # Coordinates estimated based on standard T-pose/A-pose structure in middle third.
        bs_h, bs_w, _ = self.bodysuit_img.shape
        
        # X-range for middle panel: approx 35% to 65% width
        mid_x = bs_w * 0.5
        
        # Define Rectangular Patches for Parts:
        # TORSO: Shoulders to Hips
        # Left Shoulder: 42%, Right Shoulder: 58%
        # Left Hip: 44%, Right Hip: 56%
        # Neck: 15%, Waist: 45%
        
        self.src_torso_pts = np.float32([
            [bs_w * 0.40, bs_h * 0.15], # Left Shoulder
            [bs_w * 0.60, bs_h * 0.15], # Right Shoulder
            [bs_w * 0.58, bs_h * 0.48], # Right Hip
            [bs_w * 0.42, bs_h * 0.48]  # Left Hip
        ])
        
        # Left Arm (Our Left, Suit's Right Arm?? No, it's a mirror. Suit's Left Arm is on the Right side of image if facing us)
        # Actually, "Left Shoulder" effectively maps to user's Left Shoulder (which is screen right if mirrored, but landmarks are distinct)
        # Let's map Image-Left to user-Left-Landmark.
        
        # Arm: Shoulder to Elbow
        self.src_l_arm_pts = np.float32([
            [bs_w * 0.33, bs_h * 0.18], # Elbow Outer
            [bs_w * 0.40, bs_h * 0.15], # Shoulder Outer
            [bs_w * 0.42, bs_h * 0.20], # Shoulder Inner (Armpit)
            [bs_w * 0.36, bs_h * 0.22]  # Elbow Inner
        ])
        
        # Forearm: Elbow to Wrist
        self.src_l_forearm_pts = np.float32([
            [bs_w * 0.28, bs_h * 0.25], # Wrist Outer
            [bs_w * 0.33, bs_h * 0.18], # Elbow Outer
            [bs_w * 0.36, bs_h * 0.22], # Elbow Inner
            [bs_w * 0.32, bs_h * 0.28]  # Wrist Inner
        ])

        # Right Arm (Mirrored X)
        self.src_r_arm_pts = np.float32([
            [bs_w * 0.60, bs_h * 0.15], # Shoulder Outer
            [bs_w * 0.67, bs_h * 0.18], # Elbow Outer
            [bs_w * 0.64, bs_h * 0.22], # Elbow Inner
            [bs_w * 0.58, bs_h * 0.20]  # Shoulder Inner
        ])
        
        self.src_r_forearm_pts = np.float32([
            [bs_w * 0.67, bs_h * 0.18], # Elbow Outer
            [bs_w * 0.72, bs_h * 0.25], # Wrist Outer
            [bs_w * 0.68, bs_h * 0.28], # Wrist Inner
            [bs_w * 0.64, bs_h * 0.22]  # Elbow Inner
        ])

        self.hair_path = "/Users/ginapark/.gemini/antigravity/brain/dd71e901-2964-44a4-8dc6-21823272dd51/uploaded_image_1768587125442.png"
        self.hair_img = self._load_image_safe(self.hair_path)
        self.src_hair_points = self._get_src_face_points_for_hair(self.hair_img)

        # Gesture State
        self.gesture_hold_start = None
        self.last_gesture = "NONE"
        
        # Effect State
        self.is_suit_active = False
        self.active_effect = "NONE" # "HULK" or "IRON_MAN"
        
        # Screenshots
        self.hulk_frame = None
        self.ironman_frame = None
        self.widow_frame = None
        
        self.growth_radius = 0
        self.max_radius = 2000
        self.growth_speed = 30
        self.chest_center = (0, 0)
        
        # 3D Rendering Camera Matrix (Approximation)
        self.focal_length = 640  # Approximate focal length
        self.cam_center = (320, 240) # Center of screen (will update in run)

    def project_3d_point(self, pt3d):
        """Projects a 3D point (x, y, z) to 2D image coordinates."""
        x, y, z = pt3d
        
        # Simple weak-perspective or pinhole projection
        # If z is depth from camera. MP Landmarks z is relative depth.
        # We need to assume a translation to camera space.
        
        # MP pixel coords are normalized [0,1]. z is roughly same scale.
        # Let's treat (x,y) as screen coords already (passed in as pixels).
        # We'll just add standard perspective offset based on z.
        
        # Currently, the 'nodes' (x,y) are already 2D projected by MP.
        # But to draw a 3D object *around* it, we need to extrude in Z.
        
        # Artificial Z-depth for 3D effect:
        # We assume the landmark is at z=0 relative to its own center for drawing.
        # But for the cube, we have vertices at +/- size.
        
        # Refined approach:
        # Input pt3d is relative to the landmark center.
        # we add landmark 2D center to projected offset.
        
        factor = 1.0 / (1.0 + z * 0.5) # Fake perspective scaling
        # Actually simplest way for "looking like 3D object":
        # Just draw isometric or perspective offset vertices.
        return int(x), int(y)

    def draw_cube(self, img, center, size, color=(0, 255, 255), thickness=1):
        """Draws a wireframe cube centered at 'center' (x,y)."""
        cx, cy = center
        s = size
        
        # Define vertices relative to center
        # Front face (closer to viewer) -> larger or shifted?
        # Let's do a simple oblique projection or just a flat 3D wireframe.
        
        # Front Face Rect
        f_tl = (cx - s, cy - s)
        f_tr = (cx + s, cy - s)
        f_br = (cx + s, cy + s)
        f_bl = (cx - s, cy + s)
        
        # Back Face Rect (offset for depth)
        depth_scale = 0.5
        dx = int(s * depth_scale)
        dy = int(s * depth_scale)
        
        b_tl = (cx - s + dx, cy - s - dy)
        b_tr = (cx + s + dx, cy - s - dy)
        b_br = (cx + s + dx, cy + s - dy)
        b_bl = (cx - s + dx, cy + s - dy)
        
        # Draw Front Face
        cv2.line(img, f_tl, f_tr, color, thickness)
        cv2.line(img, f_tr, f_br, color, thickness)
        cv2.line(img, f_br, f_bl, color, thickness)
        cv2.line(img, f_bl, f_tl, color, thickness)
        
        # Draw Back Face
        cv2.line(img, b_tl, b_tr, color, thickness)
        cv2.line(img, b_tr, b_br, color, thickness)
        cv2.line(img, b_br, b_bl, color, thickness)
        cv2.line(img, b_bl, b_tl, color, thickness)
        
        # Connect Faces
        cv2.line(img, f_tl, b_tl, color, thickness)
        cv2.line(img, f_tr, b_tr, color, thickness)
        cv2.line(img, f_br, b_br, color, thickness)
        cv2.line(img, f_bl, b_bl, color, thickness)

    def draw_3d_hands(self, frame, results):
        """Draws 3D cubes around hand landmarks."""
        h, w, _ = frame.shape
        
        hands_list = []
        if results.left_hand_landmarks:
            hands_list.append(results.left_hand_landmarks)
        if results.right_hand_landmarks:
            hands_list.append(results.right_hand_landmarks)
            
        for hand_landmarks in hands_list:
            for i, lm in enumerate(hand_landmarks.landmark):
                cx, cy = int(lm.x * w), int(lm.y * h)
                
                # Size varies slightly by depth (z) if we wanted, but constant is fine for stylized.
                # MP z is relative info.
                
                # Make knuckles larger?
                size = 5 if i % 4 != 0 else 8 # Larger for joints
                
                color = (0, 255, 255) # Cyan-ish
                if i == 0: color = (0, 0, 255) # Wrist Red
                
                self.draw_cube(frame, (cx, cy), size, color=color, thickness=1)
        
    def _load_image_safe(self, path):
        img = cv2.imread(path)
        if img is None:
            print(f"Error: Could not load {path}")
            return np.zeros((300, 300, 3), dtype=np.uint8)
        return img

    def _get_src_face_points_for_hair(self, img):
        # Hair needs to align with top of head/face.
        # We align: Left Cheek/Temple, Right Cheek/Temple, Top of Forehead
        # Based on the new uploaded image with a face hole:
        # Hole Width is approx 30% to 70%
        # Hole Top is approx 25%
        # Cheek level is approx 55%
        h, w, _ = img.shape
        return np.float32([
            [w * 0.30, h * 0.55], # Left Cheek/Temple (Inner edge of hair)
            [w * 0.70, h * 0.55], # Right Cheek/Temple (Inner edge of hair)
            [w * 0.50, h * 0.25]  # Top Forehead (Hairline)
        ])

    def trigger_effect(self, effect_type, center=None):
        """Triggers a specific effect."""
        self.is_suit_active = True
        self.active_effect = effect_type
        self.growth_radius = 0
        self.max_radius = 2000 
        
        if center:
            self.chest_center = center
        else:
             self.chest_center = (640, 360) 

    def calculate_angle(self, a, b, c):
        """Calculates angle between three points (a,b,c). b is vertex."""
        a = np.array(a)
        b = np.array(b)
        c = np.array(c)
        
        radians = np.arctan2(c[1]-b[1], c[0]-b[0]) - np.arctan2(a[1]-b[1], a[0]-b[0])
        angle = np.abs(radians*180.0/np.pi)
        
        if angle > 180.0:
            angle = 360-angle
            
        return angle

    def is_finger_extended(self, hand_landmarks, finger_tip_idx, finger_pip_idx):
        """Checks if a finger is extended (Tip above PIP in y-axis context?)."""
        # Note: 'Above' depends on hand orientation.
        # Robust check: Distance from Wrist to Tip > Distance from Wrist to PIP
        wrist = hand_landmarks.landmark[0]
        tip = hand_landmarks.landmark[finger_tip_idx]
        pip = hand_landmarks.landmark[finger_pip_idx]
        
        # Euclidean Distances
        d_tip = math.hypot(tip.x - wrist.x, tip.y - wrist.y)
        d_pip = math.hypot(pip.x - wrist.x, pip.y - wrist.y)
        
        return d_tip > d_pip

    def detect_gesture(self, results, width, height):
        """
        Detects hand gestures using Holistic Hand Landmarks.
        """
        # We prioritize Right Hand for control
        hand_lm = results.right_hand_landmarks
        if not hand_lm:
            hand_lm = results.left_hand_landmarks
            
        if not hand_lm:
            self.gesture_hold_start = None
            return

        # Check Fingers
        # Indices: Thumb=4, Index=8, Middle=12, Ring=16, Pinky=20
        # PIP Indices: Thumb=2, Index=6, Middle=10, Ring=14, Pinky=18
        
        thumb_ext = self.is_finger_extended(hand_lm, 4, 2)
        index_ext = self.is_finger_extended(hand_lm, 8, 6)
        middle_ext = self.is_finger_extended(hand_lm, 12, 10)
        ring_ext = self.is_finger_extended(hand_lm, 16, 14)
        pinky_ext = self.is_finger_extended(hand_lm, 20, 18)
        
        current_gesture = "NONE"
        
        # PEACE SIGN: Index & Middle Extended, Ring & Pinky Curled
        if index_ext and middle_ext and not ring_ext and not pinky_ext:
            current_gesture = "PEACE"
            
        # FIST: All fingers curled (Thumb can be flexible)
        elif not index_ext and not middle_ext and not ring_ext and not pinky_ext:
            current_gesture = "FIST"
            
        # OPEN HAND: All fingers extended (High Five)
        elif index_ext and middle_ext and ring_ext and pinky_ext:
            current_gesture = "OPEN_HAND"

        current_time = time.time()
        
        if current_gesture != "NONE":
            if self.gesture_hold_start is None or self.last_gesture != current_gesture:
                self.gesture_hold_start = current_time
                self.last_gesture = current_gesture
                print(f"Gesture detected: {current_gesture}... holding...")
            
            elif current_time - self.gesture_hold_start > 0.3:
                # EXECUTE
                if current_gesture == "PEACE" and self.active_effect != "IRON_MAN":
                    print("PEACE SIGN! Activating Iron Man.")
                    self.trigger_effect("IRON_MAN")
                        
                elif current_gesture == "FIST" and self.active_effect != "HULK":
                    print("HULK SMASH! Activating Hulk.")
                    self.trigger_effect("HULK")
                    
                elif current_gesture == "OPEN_HAND" and self.active_effect != "BLACK_WIDOW":
                    print("OPEN HAND DETECTED! Activating Black Widow.")
                    self.trigger_effect("BLACK_WIDOW")
                        
                self.gesture_hold_start = current_time + 5.0 
        else:
            self.gesture_hold_start = None

    def warp_triangle(self, img1, img2, t1, t2):
        """
        Warps a triangular region from img1 (src) to img2 (dst).
        """
        # Find bounding box for each triangle
        r1 = cv2.boundingRect(np.float32([t1]))
        r2 = cv2.boundingRect(np.float32([t2]))

        # Offset points by left top corner of the respective rectangles
        t1_rect = []
        t2_rect = []
        t2_rect_int = []

        for i in range(0, 3):
            t1_rect.append(((t1[i][0] - r1[0]), (t1[i][1] - r1[1])))
            t2_rect.append(((t2[i][0] - r2[0]), (t2[i][1] - r2[1])))
            t2_rect_int.append(((t2[i][0] - r2[0]), (t2[i][1] - r2[1])))

        # Get mask by filling triangle
        mask = np.zeros((r2[3], r2[2], 3), dtype=np.float32)
        cv2.fillConvexPoly(mask, np.int32(t2_rect_int), (1.0, 1.0, 1.0), 16, 0)

        # Apply warpImage to small rectangular patches
        img1_rect = img1[r1[1]:r1[1] + r1[3], r1[0]:r1[0] + r1[2]]
        
        size = (r2[2], r2[3])
        
        # Affine Transform
        warp_mat = cv2.getAffineTransform(np.float32(t1_rect), np.float32(t2_rect))
        img2_rect = cv2.warpAffine(img1_rect, warp_mat, size, None, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
        
        # Alpha blending
        img2_rect = img2_rect * mask

        # Copy triangular region of the rectangular patch to the output image
        y_start = r2[1]
        y_end = r2[1]+r2[3]
        x_start = r2[0]
        x_end = r2[0]+r2[2]
        
        if y_end > img2.shape[0]: y_end = img2.shape[0]
        if x_end > img2.shape[1]: x_end = img2.shape[1]
        
        # Add to existing (Assuming img2 starts black or we just accumulate)
        # Note: Simple addition works if triangles don't overlap or if img2 is zeroed.
        # But for 'seams', simple replacement is better if zeroed.
        
        # Safe addition with bounds check
        h_part, w_part = img2[y_start:y_end, x_start:x_end].shape[:2]
        if h_part > 0 and w_part > 0:
             img2[y_start:y_end, x_start:x_end] = img2[y_start:y_end, x_start:x_end] * ((1.0, 1.0, 1.0) - mask[:h_part, :w_part]) + img2_rect[:h_part, :w_part]


    def warp_body_part(self, img_src, img_dst, src_pts, dst_pts):
        """Perspective warp for a body part quad."""
        M = cv2.getPerspectiveTransform(src_pts, dst_pts)
        h, w = img_dst.shape[:2]
        warped = cv2.warpPerspective(img_src, M, (w, h))
        
        # Masking: Assume simple non-black check for now
        gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 5, 255, cv2.THRESH_BINARY)
        
        # Composite
        mask_inv = cv2.bitwise_not(mask)
        img_dst[:] = cv2.bitwise_and(img_dst, img_dst, mask=mask_inv)
        img_dst[:] = cv2.add(img_dst, cv2.bitwise_and(warped, warped, mask=mask))

    def apply_body_suit(self, frame, pose_landmarks):
        """Maps Torso and Arms using Pose Landmarks."""
        if not pose_landmarks: return frame
        
        h, w, _ = frame.shape
        lm = pose_landmarks.landmark
        
        # -- TORSO --
        # 11: Left Shoulder, 12: Right Shoulder, 23: Left Hip, 24: Right Hip
        p11 = lm[11]; p12 = lm[12]; p23 = lm[23]; p24 = lm[24]
        
        # Helper to get coords
        def get_pt(lm_pt, dx=0, dy=0):
            return [lm_pt.x * w + dx, lm_pt.y * h + dy]
            
        # Torso Quad (Expanded slightly for width)
        dst_torso = np.float32([
            get_pt(p11, -20, -20), # TL (Left Shoulder)
            get_pt(p12, 20, -20),  # TR (Right Shoulder)
            get_pt(p24, 20, 20),   # BR (Right Hip)
            get_pt(p23, -20, 20)   # BL (Left Hip)
        ])
        
        # -- ARMS --
        # Left Arm: 11->13 (Shoulder->Elbow), 13->15 (Elbow->Wrist)
        # Create quads by adding perpendicular width
        def get_limb_quad(p_start, p_end, width_scale=40):
            x1, y1 = p_start.x * w, p_start.y * h
            x2, y2 = p_end.x * w, p_end.y * h
            dx = x2 - x1; dy = y2 - y1
            dist = math.hypot(dx, dy)
            if dist == 0: return np.zeros((4,2), dtype=np.float32)
            
            # Normal vector
            nx = -dy / dist; ny = dx / dist
            
            # Offsets
            ws = width_scale
            return np.float32([
                [x1 + nx*ws, y1 + ny*ws],
                [x1 - nx*ws, y1 - ny*ws],
                [x2 - nx*ws*0.7, y2 - ny*ws*0.7],
                [x2 + nx*ws*0.7, y2 + ny*ws*0.7]
            ])
            
        # Refined Quad mapping requires precise order to match Source Pts
        # For simplicity, let's just do Torso to start safe, or map strictly.
        self.warp_body_part(self.bodysuit_img, frame, self.src_torso_pts, dst_torso)
        
        # TODO: Refine Arm mapping vectors (requires robust normals).
        # Warping just the torso is a HUGE visual upgrade already.
        
        return frame

    def apply_helmet(self, frame, face_landmarks):
        """
        Overlays the Iron Man helmet using Detail-Preserving Mesh Warping.
        """
        if not face_landmarks:
            return frame
            
        h, w, _ = frame.shape
        
        # 1. Get Destination Landmarks
        # Order: [LeftEye, RightEye, Nose, Mouth, Chin, Forehead, LeftSide, RightSide]
        # MP Indices: [33, 263, 1, 13, 152, 10, 234, 454]
        indices = [33, 263, 1, 13, 152, 10, 234, 454]
        
        dst_points = []
        for idx in indices:
            p = face_landmarks.landmark[idx]
            dst_points.append((int(p.x * w), int(p.y * h)))
            
        dst_points = np.array(dst_points)
        
        # 2. Warp Triangles
        warped_helmet_full = np.zeros_like(frame)
        src_pts = self.src_helmet_points
        
        for tri_indices in self.helmet_triangles:
            idx1, idx2, idx3 = tri_indices
            
            t1 = [src_pts[idx1], src_pts[idx2], src_pts[idx3]]
            t2 = [dst_points[idx1], dst_points[idx2], dst_points[idx3]]
            
            try:
                self.warp_triangle(self.helmet_img, warped_helmet_full, t1, t2)
            except Exception as e:
                # Catch singular matrix errors if triangles degenerate
                pass
            
        # 3. Composite
        helmet_gray = cv2.cvtColor(warped_helmet_full, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(helmet_gray, 5, 255, cv2.THRESH_BINARY)
        
        mask_inv = cv2.bitwise_not(mask)
        bg = cv2.bitwise_and(frame, frame, mask=mask_inv)
        fg = cv2.bitwise_and(warped_helmet_full, warped_helmet_full, mask=mask)
        
        return cv2.add(bg, fg)
        
    def apply_hair(self, frame, face_landmarks):
        """
        Overlays Black Widow hair on the head.
        """
        if not face_landmarks:
            return frame

        h, w, _ = frame.shape
        
        # Key Points for Hair Alignment
        # 127: Left Cheek/Temple, 356: Right Cheek/Temple, 10: Top Forehead
        # These points are more stable and define the "face area" well.
        p1 = face_landmarks.landmark[127] 
        p2 = face_landmarks.landmark[356]
        p3 = face_landmarks.landmark[10] 
        
        dst_points = np.float32([
            [p1.x * w, p1.y * h],
            [p2.x * w, p2.y * h],
            [p3.x * w, p3.y * h]
        ])
        
        M = cv2.getAffineTransform(self.src_hair_points, dst_points)
        warped_hair = cv2.warpAffine(self.hair_img, M, (w, h))
        
        # Proper alpha blending if hair img is PNG with alpha
        # Assuming simple threshold mask for now for robustness
        hair_gray = cv2.cvtColor(warped_hair, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(hair_gray, 5, 255, cv2.THRESH_BINARY)
        
        mask_inv = cv2.bitwise_not(mask)
        bg = cv2.bitwise_and(frame, frame, mask=mask_inv)
        fg = cv2.bitwise_and(warped_hair, warped_hair, mask=mask) # If src has color
        
        # If the original image was just red hair on transparent/white background,
        # we need to make sure 'fg' has the hair color.
        # Assuming warped_hair is correct BGR.
        
        return cv2.add(bg, fg)

    def apply_suit(self, frame, user_mask, results=None):
        """
        Applies effect based on active_effect.
        mask: Segmentation mask of the user (0.0 - 1.0)
        """
        if not self.is_suit_active:
            return frame
        
        h, w, _ = frame.shape
        self.max_radius = math.hypot(w, h) 
        
        # 1. Update Animation 
        if self.growth_radius < self.max_radius:
            self.growth_radius += self.growth_speed
            
        # 2. Create Growth Mask (Circle)
        growth_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(growth_mask, self.chest_center, int(self.growth_radius), 255, -1)
        
        output = frame.copy()
        
        if self.active_effect == "HULK":
            # HULK: Use Segmentation Mask + Growth Mask
            user_mask_binary = (user_mask > 0.5).astype(np.uint8) * 255
            effect_mask = cv2.bitwise_and(user_mask_binary, growth_mask)
            
            mask_bool = effect_mask > 0
            if np.any(mask_bool):
                green_overlay = np.zeros_like(frame)
                green_overlay[:] = (0, 200, 0) # BGR
                frame_part = frame[mask_bool]
                green_part = green_overlay[mask_bool]
                
                # Blend
                output[mask_bool] = cv2.addWeighted(frame_part, 0.6, green_part, 0.4, 0)
                
            self.hulk_frame = output.copy()
            
        elif self.active_effect == "IRON_MAN":
            
            # IRON MAN: Body Suit + Face Helmet
            if results and results.pose_landmarks:
                frame = self.apply_body_suit(frame, results.pose_landmarks)
            
            # Helmet overlay on top
            if results and results.face_landmarks:
                helmet_frame = self.apply_helmet(frame, results.face_landmarks)
                
                # Apply Nanotech Growth Wipe
                grow_bool = growth_mask > 0
                output[grow_bool] = helmet_frame[grow_bool]
            
            self.ironman_frame = output.copy()
            
        elif self.active_effect == "BLACK_WIDOW":
            if results and results.face_landmarks:
                hair_frame = self.apply_hair(frame, results.face_landmarks)
                grow_bool = growth_mask > 0
                output[grow_bool] = hair_frame[grow_bool]
                
            self.widow_frame = output.copy()
        
        return output

    def run(self):
        cap = cv2.VideoCapture(0)
        print("Super Hero App Started.")
        print("1. Raise FIST -> HULK 🟢")
        print("2. PEACE SIGN -> IRON MAN ✌️")
        print("3. OPEN HAND ✋ -> BLACK_WIDOW 🕷️")
        print("Press 'q' to quit.")
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            
            frame = cv2.flip(frame, 1)
            h, w, _ = frame.shape
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Process Holistic
            results = self.holistic.process(rgb_frame)
            
            # Detect Gestures (using Hands + Pose info)
            self.detect_gesture(results, w, h)
            
            # Determine Mask
            mask = None
            if results.segmentation_mask is not None:
                 # Holistic provides segmentation too!
                 mask = results.segmentation_mask
                 
            # Apply Suit/Effect
            if self.is_suit_active:
                # Pass full results for face landmarks
                frame = self.apply_suit(frame, mask, results=results)
            
            # Draw 3D Hand "Gauntlets" always or only when active? 
            # User asked to "wrap something around my hand nodes", usually implies always or for effect.
            # I'll enable it generally for now to show the user the effect.
            self.draw_3d_hands(frame, results)
                
            # Info
            status = f"ACTIVE: {self.active_effect}" if self.is_suit_active else "READY"
            color = (0, 255, 0) if self.active_effect == "HULK" else (0, 255, 255)
            cv2.putText(frame, f"STATUS: {status}", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

            cv2.imshow('Superhero App', frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
                
        cap.release()
        cv2.destroyAllWindows()
        
        self.generate_avengers_montage()

    def generate_avengers_montage(self):
        """Displays the Avengers Montage if all effects were used."""
        frames = []
        if self.hulk_frame is not None: frames.append(self.hulk_frame)
        if self.ironman_frame is not None: frames.append(self.ironman_frame)
        if self.widow_frame is not None: frames.append(self.widow_frame)
        
        if len(frames) > 0:
            print(f"Assembling Avengers Montage ({len(frames)} Heroes)...")
            
            # 1. Resize frames to match height
            heights = [f.shape[0] for f in frames]
            target_h = min(heights)
            
            resized_frames = []
            for f in frames:
                h, w, _ = f.shape
                aspect = w / h
                new_w = int(target_h * aspect)
                resized_frames.append(cv2.resize(f, (new_w, target_h)))
                
            # 2. Concatenate
            montage = np.hstack(resized_frames)
            
            # 3. Add Title
            mh, mw, _ = montage.shape
            
            # Black bar at top for text
            bar_h = 100
            final_img = np.zeros((mh + bar_h, mw, 3), dtype=np.uint8)
            final_img[bar_h:, :] = montage
            
            # Text 'AVENGERS' centered
            text = "AVENGERS"
            font = cv2.FONT_HERSHEY_TRIPLEX
            scale = 3.0
            thickness = 5
            (text_w, text_h), _ = cv2.getTextSize(text, font, scale, thickness)
            
            text_x = (mw - text_w) // 2
            text_y = (bar_h + text_h) // 2 - 10
            
            cv2.putText(final_img, text, (text_x, text_y), font, scale, (255, 255, 255), thickness)
            
            cv2.imshow("Avengers Assemble", final_img)
            print("Montage Displayed. Press any key to exit.")
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        else:
            print("No heroes detected for montage!")

if __name__ == "__main__":
    app = IronManApp()
    app.run()

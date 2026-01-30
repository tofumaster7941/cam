import cv2
import numpy as np

class Effects:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.sky_offset = 0
        self.sky_speed = 5
        
        # Load assets
        # Note: In a real app, these paths should be relative or configurable.
        # Using absolute paths to generated artifacts for this session.
        self.sky_path = "/Users/ginapark/.gemini/antigravity/brain/dd71e901-2964-44a4-8dc6-21823272dd51/matching_sky_loop_1768498909193.png"
        self.city_path = "/Users/ginapark/.gemini/antigravity/brain/dd71e901-2964-44a4-8dc6-21823272dd51/seamless_city_sky_transition_1768498895802.png"
        
        self.sky_bg = self._load_and_prep_texture(self.sky_path, is_sky=True)
        self.ground_bg = self._load_and_prep_texture(self.city_path, is_sky=False)
        
        # Launch state
        self.is_launching = False
        self.launch_progress = 0  
        self.launch_speed = 20    
        
        # Landing state
        self.is_landing = False

    def _load_and_prep_texture(self, path, is_sky=True):
        """Loads image and resizes/tiles it to match required dimensions."""
        img = cv2.imread(path)
        if img is None:
            # Fallback to generation if file missing
            print(f"Warning: Could not load {path}. Generating fallback.")
            if is_sky: return self._generate_sky_texture_fallback()
            else: return self._generate_ground_texture_fallback()
            
        # Resize to match width, maintain aspect ratio roughly or assume texture is large enough
        # We need height * 2 for sky scrolling loop
        target_height = self.height * 2 if is_sky else self.height
        
        # Simple resize to target dims
        img = cv2.resize(img, (self.width, target_height))
        return img

    def _generate_ground_texture_fallback(self):
        """Generates a ground/cityscape texture for the launch."""
        bg = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        bg[:] = (235, 206, 135) 
        cv2.rectangle(bg, (0, int(self.height * 0.7)), (self.width, self.height), (34, 139, 34), -1) 
        return bg

    def _generate_sky_texture_fallback(self):
        """
        Generates a seamless vertically scrollable sky texture.
        """
        # Create a gradient blue sky
        height = self.height * 2  # Double height for scrolling
        width = self.width
        sky = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Gradient: Dark blue at top to lighter blue
        for y in range(height):
            # RGB values
            ratio = y / height
            r = int(135 * ratio + 0 * (1 - ratio))
            g = int(206 * ratio + 100 * (1 - ratio))
            b = int(235 * ratio + 180 * (1 - ratio))
            sky[y, :] = (b, g, r) # BGR
            
        # Add some random 'clouds' (white ellipses)
        num_clouds = 20
        for _ in range(num_clouds):
            center = (np.random.randint(0, width), np.random.randint(0, height))
            axes = (np.random.randint(50, 200), np.random.randint(30, 100))
            angle = 0
            color = (255, 255, 255)
            cv2.ellipse(sky, center, axes, angle, 0, 360, color, -1)
            
        # Blur to make clouds soft
        sky = cv2.GaussianBlur(sky, (51, 51), 0)
        
        return sky

    def trigger_launch(self):
        """Resets the launch animation."""
        self.is_launching = True
        self.is_landing = False
        self.launch_progress = 0
        
    def trigger_landing(self):
        """Starts the landing animation."""
        self.is_landing = True
        self.is_launching = False
        # Start landing from the top (Sky) back down to ground
        # Launch went 0 -> Height. Landing goes Height -> 0 ??
        # Or better: We are at Sky (full offset?). We want to bring Ground back.
        # Launch ended with offset = height.
        # We can reuse launch_progress in reverse?
        self.launch_progress = self.height 

    def get_background_frame(self):
        """
        Returns the appropriate background frame based on state (launching, flying, landing).
        """
        if self.is_launching:
            offset = self.launch_progress
            frame = self._compose_transition_frame(offset)

            self.launch_progress += self.launch_speed
            self.launch_speed += 2 # Accelerate
            
            if self.launch_progress >= self.height:
                self.is_launching = False
                self.sky_offset = self.height 
            return frame
            
        elif self.is_landing:
            offset = self.launch_progress
            frame = self._compose_transition_frame(offset)
            
            # Decelerate / Move down
            self.launch_progress -= 30 # Fast descent
            
            if self.launch_progress <= 0:
                self.is_landing = False
                return None # Signal landing complete
                
            return frame
            
        else:
            return self.get_sky_frame()
            
    def _compose_transition_frame(self, offset):
        """Helper to compose Ground/Sky based on offset (0 = Ground, Height = Sky)"""
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
            
        # Ground part (Lower part of screen moves DOWN as offset increases)
        # Offset 0: Ground at top? No.
        # Launch logic was:
        # ground_y = offset. If offset=0, ground_y=0. Frame[0:] = Ground. FULL GROUND.
        # If offset=Height, ground_y=Height. Frame[Height:] (Empty). FULL SKY.
        
        ground_y = offset
        if ground_y < self.height and ground_y >= 0:
             # Ground texture needs to be drawn from its top?
             # self.ground_bg is Height x Width.
             # We want to show top part of ground disappearing downwards?
             # Frame[ground_y : H] = Ground[0 : H-ground_y]
             h_part = self.height - ground_y
             frame[ground_y:self.height, :] = self.ground_bg[0:h_part, :]
            
        # Sky part (Enters from top)
        # sky_height_needed = offset
        sky_h = offset
        if sky_h > 0:
             # We want bottom of sky buffer to appear at top of frame?
             # Launch logic: frame[0:sky_h] = sky_bg[bottom]
             draw_h = min(sky_h, self.height)
             frame[0:draw_h, :] = self.sky_bg[self.height - draw_h : self.height, :]
             
        return frame

    def get_sky_frame(self):
        """
        Returns the next frame of the scrolling sky.
        """
        # Crop the current view
        # We scroll UP (decrease offset) so pixels move DOWN, simulating flying UP.
        self.sky_offset = (self.sky_offset - self.sky_speed) % (self.height // 2)

        y1 = self.sky_offset
        y2 = y1 + self.height
        frame = self.sky_bg[y1:y2, :]
        
        return frame

    def apply_motion_blur(self, frame, kernel_size=15):
        """
        Applies a vertical motion blur to simulate speed.
        """
        kernel = np.zeros((kernel_size, kernel_size))
        kernel[:, int((kernel_size - 1)/2)] = np.ones(kernel_size)
        kernel /= kernel_size
        return cv2.filter2D(frame, -1, kernel)
    
    def set_sprite(self, sprite_rgb, sprite_mask):
        """Stores the captured user sprite and its mask."""
        self.sprite_rgb = sprite_rgb
        self.sprite_mask = sprite_mask

    def overlay_sprite(self, background):
        """Overlays the stored sprite onto the background."""
        if background is None:
            return None 

        if not hasattr(self, 'sprite_rgb'):
             return background
             
        # Optional: Add shake or float to the sprite for realism?
        # For now, static overlay.
        
        # Alpha blend
        # background * (1 - mask) + sprite * mask
        # Note: sprite_rgb already has background pixels blacked out, but alpha logic is safer
        
        # Ensure shapes match
        if background.shape != self.sprite_rgb.shape:
             background = cv2.resize(background, (self.sprite_rgb.shape[1], self.sprite_rgb.shape[0]))
             
        bg_part = background * (1.0 - self.sprite_mask)
        sprite_part = self.sprite_rgb # Assumes pre-masked, or use self.sprite_rgb * self.sprite_mask
        
        # If sprite_rgb wasn't pre-masked perfectly, using mask again is safer
        sprite_part = self.sprite_rgb * self.sprite_mask 
        
        output = bg_part + sprite_part
        return output.astype(np.uint8)

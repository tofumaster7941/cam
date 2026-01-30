import mediapipe as mp
import cv2
import numpy as np

class Segmentor:
    def __init__(self, model_selection=1):
        """
        model_selection: 0 for general, 1 for landscape (faster/better for webcam)
        """
        self.mp_selfie_segmentation = mp.solutions.selfie_segmentation
        self.segmentation = self.mp_selfie_segmentation.SelfieSegmentation(model_selection=model_selection)

    def remove_background(self, image, background_image=None, threshold=0.1):
        """
        Segments user and replaces background.
        image: RGB input image
        background_image: (Optional) Image to replace background with. 
                          If None, returns mask.
        threshold: Segmentation confidence threshold (0.0 to 1.0)
        """
        results = self.segmentation.process(image)
        # Smooth the mask to reduce jitter and soften edges
        mask = results.segmentation_mask
        # Apply a joint bilateral filter or simple blur to the mask if needed, 
        # but MediaPipe mask is already 0-1 float.
        
        # Expand mask to 3 channels
        mask_3d = np.stack((mask,) * 3, axis=-1)
        
        if background_image is None:
            bg_image = np.zeros(image.shape, dtype=np.uint8)
        else:
            if background_image.shape != image.shape:
                bg_image = cv2.resize(background_image, (image.shape[1], image.shape[0]))
            else:
                bg_image = background_image

        # Alpha blending
        # output = image * mask + bg * (1 - mask)
        output_image = image * mask_3d + bg_image * (1.0 - mask_3d)
        output_image = output_image.astype(np.uint8)
        
        return output_image, mask

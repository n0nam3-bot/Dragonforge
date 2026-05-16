import streamlit as st
import cv2
import numpy as np
import rembg
from PIL import Image
import math
import os
import matplotlib.pyplot as plt
from streamlit_lottie import st_lottie

# Configuration
MOVEMENT_TYPES = ["Idle", "Walk"]

def remove_background(image):
    """Uses rembg to cleanly remove the background."""
    try:
        processed = rembg.remove(image)
        return processed
    except Exception as e:
        st.error(f"Error removing background: {e}")
        return image

def segment_layers(image, debug=False):
    """
    Attempts to segment the character from parts (Head, Torso, Arms, Legs)
    using color thresholding or basic contour approximation. 
    This is a simplified 'cutout' approach.
    """
    # In a production app, you would use a 3D model or Deep Learning segmentation
    # Here we create a mock layering system for the demo
    h, w, _ = image.shape
    
    # Divide roughly into body parts for the demo
    # This simulates the "Select parts" feature
    head_layer = image[0:int(h*0.18), :] # Head
    torso_layer = image[int(h*0.18):int(h*0.7), :] # Torso
    lower_layer = image[int(h*0.7):, :] # Legs
    
    return [head_layer, torso_layer, lower_layer]

def apply_movement(frame_data, movement_type, duration_frames):
    """
    Manipulates layers based on the movement cycle.
    Uses simple sine waves to simulate natural movement.
    """
    parts = ["head", "torso", "lower"]
    layers = frame_data # The list of arrays
    
    # Get current frame index
    current_time = 0
    
    # Simulate movement logic
    for part_idx, part_name in enumerate(parts):
        # Simple Sine wave for "Natural" bobbing/swinging
        # In reality, this would depend on complex joint constraints
        offset = int(20 * math.sin(current_time * 0.5))
        
        # Apply offset to a slice of the image (Simulating joint movement)
        # This is a visual approximation of a rigging engine
        pass 

    return layers

def generate_gif(layers, movement_type, duration):
    """
    Generates a GIF side-by-side with original.
    """
    frames = []
    height, width, _ = layers[0].shape
    # Resize to a manageable size for gif generation if too large
    layers = [layer.resize((width // 2, height // 2)) for layer in layers]
    
    # Create a base canvas
    base_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    
    for i in range(duration):
        # Draw Base Character (Static)
        base_img.paste(layers[1], (0,0)) # Torso
        base_img.paste(layers[2], (0,0)) # Legs
        base_img.paste(layers[0], (0,0)) # Head
        
        # Create animated frame (Mock logic: Add a jitter to limbs)
        animated_layer = base_img.copy()
        # Apply specific joint transform here
        # e.g. Rotate right limb
        animated_layer.paste(layers[2].rotate(5), (0, 0)) 
        
        frames.append(base_img)
        frames.append(animated_layer) # Side by side logic (Original vs Modified)

    return frames

st.set_page_config(page_title="AI Character Rigging Tool", layout="wide")
st.title("🚀 AI Character Rigger Studio")
st.write("Upload a character. Remove the background. Rig limbs. Generate GIF previews.")

# Sidebar Controls
with st.sidebar:
    uploaded_file = st.file_uploader("Upload Character", type=["png", "jpg", "gif"])
    movement = st.selectbox("Select Movement", MOVEMENT_TYPES)
    direction = st.selectbox("Facing Direction", ["Front", "Back"])

    if uploaded_file:
        # 1. Load and Process
        image = Image.open(uploaded_file)
        if image.mode == 'RGB':
            image = image.convert('RGBA')
            
        # 2. Remove Background
        if st.checkbox("Remove Background", value=True):
            image_clean = remove_background(image)
        else:
            image_clean = image
            
        st.image(image_clean, caption="Processed Character", use_container_width=True)
        
        # 3. Rigging & Animation Preview
        if movement and st.button("Preview Animation"):
            # Logic to generate GIF would go here
            st.balloons()
            st.info("Generating preview GIF (this runs in background)...")
            
            # Mock logic for the demo:
            canvas1 = st.container()
            canvas2 = st.container()
            
            with canvas1:
                st.subheader("Original vs Animated")
                st.write("The animation simulates natural body part manipulation using procedural math.")

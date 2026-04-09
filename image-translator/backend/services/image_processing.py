import os
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont
import cv2
import numpy as np
from models import TextRegion
from config import settings


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def sample_edge_color(img: Image.Image, region: TextRegion) -> Tuple[int, int, int]:
    """Sample the dominant color from the edges of a region."""
    x, y, w, h = region.x, region.y, region.width, region.height

    # Sample pixels from edges
    edge_pixels = []

    # Top edge
    for px in range(x, min(x + w, img.width)):
        if y > 0:
            edge_pixels.append(img.getpixel((px, max(0, y - 1))))

    # Bottom edge
    for px in range(x, min(x + w, img.width)):
        if y + h < img.height:
            edge_pixels.append(img.getpixel((px, min(img.height - 1, y + h))))

    # Left edge
    for py in range(y, min(y + h, img.height)):
        if x > 0:
            edge_pixels.append(img.getpixel((max(0, x - 1), py)))

    # Right edge
    for py in range(y, min(y + h, img.height)):
        if x + w < img.width:
            edge_pixels.append(img.getpixel((min(img.width - 1, x + w), py)))

    if not edge_pixels:
        return (255, 255, 255)

    # Average the colors
    if isinstance(edge_pixels[0], int):
        # Grayscale
        avg = int(sum(edge_pixels) / len(edge_pixels))
        return (avg, avg, avg)
    else:
        # RGB or RGBA
        r = int(sum(p[0] for p in edge_pixels) / len(edge_pixels))
        g = int(sum(p[1] for p in edge_pixels) / len(edge_pixels))
        b = int(sum(p[2] for p in edge_pixels) / len(edge_pixels))
        return (r, g, b)


def remove_text_simple(img: Image.Image, region: TextRegion) -> None:
    """Remove text by filling with background color (in-place)."""
    draw = ImageDraw.Draw(img)

    if region.background_color:
        fill_color = hex_to_rgb(region.background_color)
    else:
        fill_color = sample_edge_color(img, region)

    # Ensure we have the right color format
    if img.mode == 'RGBA':
        fill_color = fill_color + (255,)

    draw.rectangle(
        [region.x, region.y, region.x + region.width, region.y + region.height],
        fill=fill_color
    )


def remove_text_inpaint(img_array: np.ndarray, region: TextRegion) -> np.ndarray:
    """Remove text using OpenCV inpainting for complex backgrounds."""
    # Create mask
    mask = np.zeros(img_array.shape[:2], dtype=np.uint8)
    cv2.rectangle(
        mask,
        (region.x, region.y),
        (region.x + region.width, region.y + region.height),
        255,
        -1
    )

    # Inpaint
    result = cv2.inpaint(img_array, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    return result


def remove_text(image: Image.Image, regions: List[TextRegion]) -> Image.Image:
    """Remove marketing text from image."""
    img = image.copy()

    # Convert to RGB if needed
    if img.mode != 'RGB':
        img = img.convert('RGB')

    # Separate regions by background type
    simple_regions = []
    complex_regions = []

    for region in regions:
        if region.is_product_text:
            continue
        if region.background_color:
            simple_regions.append(region)
        else:
            complex_regions.append(region)

    # Handle simple backgrounds with PIL
    for region in simple_regions:
        remove_text_simple(img, region)

    # Handle complex backgrounds with OpenCV inpainting
    if complex_regions:
        img_array = np.array(img)
        img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        for region in complex_regions:
            img_array = remove_text_inpaint(img_array, region)

        img_array = cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(img_array)

    return img


def get_font(language: str, size: int) -> ImageFont.FreeTypeFont:
    """Get appropriate font for language."""
    font_path = os.path.join(settings.fonts_dir, "NotoSans-Bold.ttf")

    if not os.path.exists(font_path):
        # Fallback to default font
        try:
            return ImageFont.truetype("arial.ttf", size)
        except:
            return ImageFont.load_default()

    return ImageFont.truetype(font_path, size)


def wrap_text(text: str, max_width: int, font: ImageFont.FreeTypeFont, draw: ImageDraw.Draw) -> List[str]:
    """Wrap text to fit within max_width."""
    words = text.split()
    lines = []
    current_line = []

    for word in words:
        test_line = ' '.join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        width = bbox[2] - bbox[0]

        if width <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]

    if current_line:
        lines.append(' '.join(current_line))

    return lines if lines else [text]


def place_translated_text(
    image: Image.Image,
    translated_regions: List[dict],
    language: str
) -> Image.Image:
    """Place translated text onto image."""
    img = image.copy()

    # Convert to RGB if needed for drawing
    if img.mode != 'RGB':
        img = img.convert('RGB')

    draw = ImageDraw.Draw(img)

    for tr in translated_regions:
        region = tr["original"]
        text = tr["translated_text"]

        if not text:
            continue

        # Get font at original size
        font_size = region.font_size
        font = get_font(language, font_size)

        # Calculate text size
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        # Auto-scale font if text is too wide
        min_font_size = max(10, int(region.font_size * 0.5))
        while text_width > region.width * 1.2 and font_size > min_font_size:
            font_size -= 1
            font = get_font(language, font_size)
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]

        # If still too wide, try wrapping
        if text_width > region.width * 1.3:
            lines = wrap_text(text, int(region.width * 1.1), font, draw)
        else:
            lines = [text]

        # Calculate total height for wrapped text
        line_height = text_height + 2
        total_height = line_height * len(lines)

        # Starting Y position (centered vertically)
        start_y = region.y + (region.height - total_height) // 2

        # Draw each line
        text_color = hex_to_rgb(region.font_color)

        for i, line in enumerate(lines):
            # Calculate line width for centering
            line_bbox = draw.textbbox((0, 0), line, font=font)
            line_width = line_bbox[2] - line_bbox[0]

            # Center horizontally
            x = region.x + (region.width - line_width) // 2
            y = start_y + i * line_height

            # Draw text
            draw.text((x, y), line, font=font, fill=text_color)

    return img


def save_high_quality(img: Image.Image, output_path: str) -> None:
    """Save image at high quality."""
    # Always save as PNG for best quality
    img.save(output_path, 'PNG', compress_level=1)

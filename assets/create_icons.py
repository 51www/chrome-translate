#!/usr/bin/env python3
import os
import sys

# 尝试导入PIL
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("请安装Pillow库: pip install Pillow")
    sys.exit(1)

def create_icon(size, output_path):
    # 创建新图像
    image = Image.new('RGB', (size, size), '#1976d2')
    draw = ImageDraw.Draw(image)
    
    # 绘制文字
    try:
        # 尝试使用系统字体
        font = ImageFont.truetype("arial.ttf", size // 2)
    except:
        # 使用默认字体
        font = ImageFont.load_default()
    
    text = "译"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    draw.text((x, y), text, fill='white', font=font)
    
    # 保存图像
    image.save(output_path, 'PNG')
    print(f"创建图标: {output_path}")

def main():
    # 创建不同尺寸的图标
    sizes = [16, 48, 128]
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    for size in sizes:
        output_path = os.path.join(script_dir, f'icon{size}.png')
        create_icon(size, output_path)

if __name__ == '__main__':
    main()
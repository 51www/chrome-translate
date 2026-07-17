#!/usr/bin/env python3
import os
import sys

# 尝试导入PIL
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("请安装Pillow库: pip install Pillow")
    sys.exit(1)

def create_icon(size, output_path, source_image):
    # 从源图像调整大小
    image = source_image.copy()
    image = image.resize((size, size), Image.Resampling.LANCZOS)
    
    # 保存图像
    image.save(output_path, 'PNG')
    print(f"创建图标: {output_path}")

def main():
    # 创建不同尺寸的图标
    sizes = [16, 48, 128]
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 打开源图像
    source_path = os.path.join(script_dir, 'icon.png')
    try:
        source_image = Image.open(source_path)
    except FileNotFoundError:
        print(f"找不到源图像: {source_path}")
        sys.exit(1)
    
    for size in sizes:
        output_path = os.path.join(script_dir, f'icon{size}.png')
        create_icon(size, output_path, source_image)

if __name__ == '__main__':
    main()
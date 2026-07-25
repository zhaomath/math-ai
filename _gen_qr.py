#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成带标题的应用访问二维码"""
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

URL = "https://zhaomath.github.io/math-ai/"
OUT = "小学数学AI助教_二维码.png"

# 生成二维码本体
qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=12, border=2)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color="#1f2937", back_color="white").convert("RGB")
qw, qh = qr_img.size

# 画布：上方标题区 + 二维码 + 下方链接区
pad = 40
title_h = 150
foot_h = 70
W = qw + pad * 2
H = title_h + qh + foot_h

canvas = Image.new("RGB", (W, H), "white")
draw = ImageDraw.Draw(canvas)

# 顶部橙蓝渐变条
band_h = 12
for x in range(W):
    t = x / W
    r = int(0xff + (0x2f - 0xff) * t)
    g = int(0x8c + (0x9b - 0x8c) * t)
    b = int(0x1a + (0xe0 - 0x1a) * t)
    draw.line([(x, 0), (x, band_h)], fill=(r, g, b))

# 字体
def load_font(size):
    for fp in [
        "C:/Windows/Fonts/msyhbd.ttc",
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
    ]:
        try:
            return ImageFont.truetype(fp, size)
        except Exception:
            continue
    return ImageFont.load_default()

font_title = load_font(44)
font_sub = load_font(24)
font_url = load_font(20)

def center_text(y, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text(((W - w) / 2, y), text, font=font, fill=fill)

center_text(band_h + 30, "小学数学AI助教", font_title, "#1f2937")
center_text(band_h + 92, "扫码即用 · 手机/平板/电脑均可安装", font_sub, "#6b7280")

# 贴二维码
canvas.paste(qr_img, (pad, title_h))

# 底部链接
center_text(title_h + qh + 18, URL, font_url, "#2f9be0")

canvas.save(OUT, "PNG")
print("SAVED:" + OUT + " size=" + str(canvas.size))

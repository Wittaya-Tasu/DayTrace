"""Rebuild original DayTrace icons; requires Pillow. No external image assets."""
from PIL import Image, ImageDraw
from pathlib import Path

target=Path(__file__).resolve().parent.parent/'public'/'icons'
target.mkdir(parents=True,exist_ok=True)
for name,size,maskable in [('icon-192',192,False),('icon-512',512,False),('maskable-512',512,True),('apple-touch-icon',180,False)]:
    scale=4
    im=Image.new('RGB',(size*scale,size*scale),'#176449')
    d=ImageDraw.Draw(im)
    def pt(v):return round(v*size*scale)
    # A clock with an open upper right arc and a small sprout: time, gently observed.
    d.arc([pt(.24),pt(.24),pt(.76),pt(.76)],38,325,fill='#F5F8F5',width=pt(.039))
    d.line([(pt(.50),pt(.36)),(pt(.50),pt(.51)),(pt(.62),pt(.57))],fill='#F5F8F5',width=pt(.037),joint='curve')
    d.ellipse([pt(.477),pt(.487),pt(.523),pt(.533)],fill='#F5F8F5')
    d.ellipse([pt(.73),pt(.28),pt(.80),pt(.35)],fill='#B0D9BA')
    im.resize((size,size),Image.Resampling.LANCZOS).save(target/f'{name}.png')
print('Generated 4 original PNG icons')

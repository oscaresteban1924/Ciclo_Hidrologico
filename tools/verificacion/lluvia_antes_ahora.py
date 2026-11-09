# Hoja comparativa de la lluvia en los sectores: antes (a-*) y ahora (d-*), mismas vistas, 100 mm/h, minuto 10
from PIL import Image, ImageDraw, ImageFont
S = 'shots/city/lluvia'
F = '/usr/share/fonts/opentype/inter/'
fb = ImageFont.truetype(F + 'Inter-SemiBold.otf', 30)
fm = ImageFont.truetype(F + 'Inter-Medium.otf', 22)
fs = ImageFont.truetype(F + 'Inter-Regular.otf', 19)
def crop(path):
    return Image.open(path).convert('RGB').crop((0, 66, 994, 900)).resize((900, 755), Image.LANCZOS)
rows = [
    ('calle-t600-calle', 'Calle de prueba a nivel de calle'),
    ('calle-t600-general', 'Calle de prueba, vista general'),
    ('ladera-t600-calle', 'Ladera con quebrada a nivel de calle'),
    ('ladera-t600-valle', 'Ladera con quebrada, botón «Valle»'),
]
W, M, top, lab = 1840, 14, 96, 44
H = top + len(rows) * (755 + lab + M) + 70
sheet = Image.new('RGB', (W, H), '#f4f6f8')
d = ImageDraw.Draw(sheet)
d.text((M + 6, 22), 'Medellín: laboratorio de lluvia · aguacero de 100 mm/h, minuto 10', font=fb, fill='#14263a')
d.text((M + 6, 60), 'Antes (izquierda) y ahora (derecha): mismo cálculo y mismas cifras; cambian el color natural del agua, los reflejos, lo mojado y la tormenta', font=fs, fill='#45576b')
for r, (f, desc) in enumerate(rows):
    for c, (pre, tag) in enumerate([('a', 'Antes'), ('d', 'Ahora')]):
        x = M + c * (900 + 12); y = top + r * (755 + lab + M)
        d.rounded_rectangle((x, y, x + 900, y + lab - 6), 8, fill='#14263a' if tag == 'Ahora' else '#7a8794')
        d.text((x + 14, y + 7), tag, font=fm, fill='white')
        d.text((x + 14 + d.textlength(tag, font=fm) + 14, y + 10), desc, font=fs, fill='#dfe7ef')
        sheet.paste(crop(f'{S}/{pre}-{f}.png'), (x, y + lab))
d.text((M + 6, H - 52), 'Bruma, nubes bajas, luces encendidas y velo de lluvia son ambiente. El agua que cuenta es la que tiene color en la leyenda; «Agua en azul» vuelve a la escala azul.', font=fs, fill='#45576b')
sheet.save('medellin-lluvia-antes-ahora.png', optimize=True)
print(sheet.size)

# Hoja comparativa del valle: antes (captura anterior) y ahora (vista nueva)
from PIL import Image, ImageDraw, ImageFont
S = 'shots/city'
F = '/usr/share/fonts/opentype/inter/'
fb = ImageFont.truetype(F + 'Inter-SemiBold.otf', 30)
fm = ImageFont.truetype(F + 'Inter-Medium.otf', 22)
fs = ImageFont.truetype(F + 'Inter-Regular.otf', 19)
def crop(path):  # zona 3D de la captura 1440×900
    return Image.open(path).convert('RGB').crop((0, 66, 994, 900)).resize((900, 755), Image.LANCZOS)
cells = [
    (f'{S}/antes3/01-valle-1440.png', 'Antes', 'vista general anterior'),
    (f'{S}/final/01-valle-1440.png', 'Ahora', 'vista general desde el sur (Itagüí y Envigado al frente)'),
    (f'{S}/valle/f-occidente.png', 'Ahora', 'mirando al oriente desde San Javier: Laureles, Centro, nororiente'),
    (f'{S}/valle/f-oriente.png', 'Ahora', 'mirando al occidente desde Santa Elena'),
]
W, M, top, lab = 1840, 14, 96, 44
H = top + 2 * (755 + lab + M) + 70
sheet = Image.new('RGB', (W, H), '#f4f6f8')
d = ImageDraw.Draw(sheet)
d.text((M + 6, 22), 'Medellín: laboratorio de lluvia · Valle de Aburrá', font=fb, fill='#14263a')
d.text((M + 6, 60), 'Relieve, río, quebradas, cerros, comunas, metro y cables dibujados desde una tabla de referencia aproximada', font=fs, fill='#45576b')
for i, (p, a, b) in enumerate(cells):
    x = M + (i % 2) * (900 + 12); y = top + (i // 2) * (755 + lab + M)
    d.rounded_rectangle((x, y, x + 900, y + lab - 6), 8, fill='#14263a' if a == 'Ahora' else '#7a8794')
    d.text((x + 14, y + 7), a, font=fm, fill='white')
    d.text((x + 14 + d.textlength(a, font=fm) + 14, y + 10), b, font=fs, fill='#dfe7ef')
    sheet.paste(crop(p), (x, y + lab))
d.text((M + 6, H - 52), 'Vista orientativa: relieve y edificios ×1,5; trazados y cotas aproximados. No reemplaza la cartografía oficial (DEM, POT, red del metro).', font=fs, fill='#45576b')
sheet.save('medellin-valle-antes-ahora.png', optimize=True)
print(sheet.size)

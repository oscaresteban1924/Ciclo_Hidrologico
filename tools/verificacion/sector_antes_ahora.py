# Hoja comparativa del sector: antes (captura anterior) y ahora (fachadas, vida de calle y valle alrededor)
from PIL import Image, ImageDraw, ImageFont
S = 'shots/city'
F = '/usr/share/fonts/opentype/inter/'
fb = ImageFont.truetype(F + 'Inter-SemiBold.otf', 30)
fm = ImageFont.truetype(F + 'Inter-Medium.otf', 22)
fs = ImageFont.truetype(F + 'Inter-Regular.otf', 19)
def crop(path):
    return Image.open(path).convert('RGB').crop((0, 66, 994, 900)).resize((900, 755), Image.LANCZOS)
rows = [
    ('03-calle-nivel-de-calle-1440.png', 'Calle de prueba a nivel de calle, con lluvia'),
    ('15-calle-camara-valle-1440.png', 'Botón «Valle»: el sector adelante y el valle al fondo'),
    ('05-ladera-lluvia-1440.png', 'Ladera con quebrada, con lluvia'),
]
W, M, top, lab = 1840, 14, 96, 44
H = top + len(rows) * (755 + lab + M) + 70
sheet = Image.new('RGB', (W, H), '#f4f6f8')
d = ImageDraw.Draw(sheet)
d.text((M + 6, 22), 'Medellín: laboratorio de lluvia · sectores de cálculo', font=fb, fill='#14263a')
d.text((M + 6, 60), 'Antes (izquierda) y ahora (derecha): mismas vistas y mismo cálculo; cambian las fachadas, la vida de calle y el valle alrededor', font=fs, fill='#45576b')
for r, (f, desc) in enumerate(rows):
    for c, (folder, tag) in enumerate([('antes4', 'Antes'), ('final', 'Ahora')]):
        x = M + c * (900 + 12); y = top + r * (755 + lab + M)
        d.rounded_rectangle((x, y, x + 900, y + lab - 6), 8, fill='#14263a' if tag == 'Ahora' else '#7a8794')
        d.text((x + 14, y + 7), tag, font=fm, fill='white')
        d.text((x + 14 + d.textlength(tag, font=fm) + 14, y + 10), desc, font=fs, fill='#dfe7ef')
        sheet.paste(crop(f'{S}/{folder}/{f}'), (x, y + lab))
d.text((M + 6, H - 52), 'El entorno es el valle de referencia aproximado; fachadas, avisos, postes, cables y motos son ambientación. La calle y la ladera siguen siendo escenarios didácticos.', font=fs, fill='#45576b')
sheet.save('medellin-sector-antes-ahora.png', optimize=True)
print(sheet.size)

# Hoja de la red separada y la creciente: seis vistas con su rótulo.
from PIL import Image, ImageDraw, ImageFont
S = 'shots/city/red'
F = '/usr/share/fonts/opentype/inter/'
fb = ImageFont.truetype(F + 'Inter-SemiBold.otf', 30)
fm = ImageFont.truetype(F + 'Inter-Medium.otf', 21)
fs = ImageFont.truetype(F + 'Inter-Regular.otf', 19)
def view3d(f):  # zona de la maqueta
    return Image.open(f'{S}/{f}.png').convert('RGB').crop((0, 66, 994, 900)).resize((900, 755), Image.LANCZOS)
def panel(f):   # panel lateral
    return Image.open(f'{S}/{f}.png').convert('RGB').crop((994, 170, 1440, 900)).resize((460, 753), Image.LANCZOS)
cells = [
    (view3d('d-calle-bajo'), 'Calle · bajo la calle con conexiones erradas: aguas residuales en carga (rojo)'),
    (panel('d-calle-panel2'), 'Estado de las dos redes'),
    (view3d('d-ladera-seccion'), 'Ladera · creciente al 200 %: la quebrada llena su valle'),
    (panel('d-ladera-panel2'), 'Sección de control e hidrograma'),
    (view3d('d-ladera-perfil'), 'La quebrada ahoga la descarga: la red queda en carga y la cámara rebosa'),
    (panel('d-ladera-perfil'), 'Perfil del colector de aguas lluvias'),
]
M, lab, top = 14, 40, 96
W = M + 900 + 12 + 460 + M
H = top + 3 * (755 + lab + M) + 60
sheet = Image.new('RGB', (W, H), '#f4f6f8')
d = ImageDraw.Draw(sheet)
d.text((M + 6, 22), 'Medellín: laboratorio de lluvia · alcantarillado separado y creciente', font=fb, fill='#14263a')
d.text((M + 6, 60), 'Red didáctica con criterios de la norma de diseño de EPM (GD-AS002); no es la red real ni un diseño de ingeniería. Todo lo que se ve sale del cálculo.', font=fs, fill='#45576b')
for r in range(3):
    for c in range(2):
        img, txt = cells[r * 2 + c]
        x = M + (0 if c == 0 else 900 + 12); y = top + r * (755 + lab + M)
        w = img.width
        d.rounded_rectangle((x, y, x + w, y + lab - 6), 8, fill='#14263a')
        d.text((x + 12, y + 7), txt, font=fm if c == 0 else fs, fill='white')
        sheet.paste(img, (x, y + lab))
d.text((M + 6, H - 46), 'Conexiones erradas y creciente son hipotéticas: no son caudales medidos ni un pronóstico de inundación.', font=fs, fill='#45576b')
sheet.save('medellin-alcantarillado-creciente.png', optimize=True)
print(sheet.size)

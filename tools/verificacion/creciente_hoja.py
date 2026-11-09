# Hoja de la creciente dañina y de las redes legibles: antes y ahora, maqueta y panel, con su rótulo.
from PIL import Image, ImageDraw, ImageFont
R = 'shots/city/red'
S = 'shots/city/cr'
F = '/usr/share/fonts/opentype/inter/'
fb = ImageFont.truetype(F + 'Inter-SemiBold.otf', 30)
fm = ImageFont.truetype(F + 'Inter-Medium.otf', 21)
fs = ImageFont.truetype(F + 'Inter-Regular.otf', 19)
def view3d(path):
    return Image.open(path).convert('RGB').crop((0, 66, 994, 900)).resize((900, 755), Image.LANCZOS)
def panel(path):
    return Image.open(path).convert('RGB').crop((994, 196, 1440, 900)).resize((460, 726), Image.LANCZOS)
rows = [
    ((view3d(f'{R}/d-calle-bajo.png'), 'Antes · bajo la calle: árboles, cables y casas encima; carga en rojo'), (panel(f'{S}/i-calle-corte.png'), 'Ahora · corte de la calle y planta')),
    ((view3d(f'{S}/i-calle-bajo-ambas.png'), 'Ahora · cada red con su color, flechas del agua y anillos de carga'), (panel(f'{S}/i-calle-perfil.png'), 'Perfil del colector')),
    ((view3d(f'{S}/i-calle-bajo-residuales.png'), 'Ver una sola red: aguas residuales con conexiones erradas (violeta)'), (panel(f'{S}/i-calle-planta.png'), 'Esquema en planta')),
    ((view3d(f'{S}/i-avenida-seccion.png'), 'Avenida torrencial (350 %, 30 % de lodo): troncos y agua sobre el puente'), (panel(f'{S}/i-avenida-seccion.png'), 'Crecientes de ejemplo e indicadores')),
    ((view3d(f'{S}/i-avenida-peligro.png'), 'Vista de peligro H1–H6 (profundidad y velocidad calculadas)'), (panel(f'{S}/i-grave-seccion-panel.png'), 'Sección con casas, nivel máximo y peligro')),
    ((view3d(f'{S}/i-avenida-despues.png'), 'Después: marcas del agua en las fachadas y troncos depositados'), (panel(f'{S}/i-grave-hidrograma.png'), 'Hidrograma y daños por edificación')),
]
M, lab, top = 14, 40, 96
W = M + 900 + 12 + 460 + M
H = top + len(rows) * (755 + lab + M) + 70
sheet = Image.new('RGB', (W, H), '#f4f6f8')
d = ImageDraw.Draw(sheet)
d.text((M + 6, 22), 'Medellín: laboratorio de lluvia · creciente dañina y redes legibles', font=fb, fill='#14263a')
d.text((M + 6, 60), 'Todo lo que se ve sale del cálculo; el material flotante es ilustrativo y se mueve con la velocidad calculada.', font=fs, fill='#45576b')
for r, cells in enumerate(rows):
    for c, (img, txt) in enumerate(cells):
        x = M + (0 if c == 0 else 900 + 12); y = top + r * (755 + lab + M)
        w = img.width
        d.rounded_rectangle((x, y, x + w, y + lab - 6), 8, fill='#14263a')
        d.text((x + 12, y + 7), txt, font=fm if c == 0 else fs, fill='white')
        sheet.paste(img, (x, y + lab))
d.text((M + 6, H - 52), 'Sector demostrativo y crecientes hipotéticas: no es un pronóstico de inundación.', font=fs, fill='#45576b')
d.text((M + 6, H - 28), 'Peligro según la guía australiana AIDR 7-3 (referencia técnica), no la zonificación oficial de amenaza de Medellín.', font=fs, fill='#45576b')
sheet.save('medellin-creciente-redes.png', optimize=True)
print(sheet.size)
